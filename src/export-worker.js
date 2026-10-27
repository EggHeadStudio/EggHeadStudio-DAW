import {
 encodeMp3Async,encodeWavAsync,inspectMp3,inspectWav,prepareExportChannels,resampleChannels
} from './export-dsp.js';

self.onmessage=async({data})=>{
 if(data?.type!=='encode')return;
 try{
  const settings=data.settings,sourceRate=data.sampleRate;
  const prepared=prepareExportChannels(data.channels,settings.channels);
  const channels=await resampleChannels(prepared,sourceRate,settings.sampleRate,{
   onProgress:value=>self.postMessage({type:'progress',stage:'resample',progress:value})
  });
  let sourceClippedSamples=0;
  if(settings.bitDepth!==32||settings.format==='mp3'){
   for(const channel of channels)for(const sample of channel)if(Math.abs(sample)>=1)sourceClippedSamples++;
  }
  let bytes,info;
  if(settings.format==='mp3'){
   bytes=await encodeMp3Async(channels,settings.sampleRate,settings.bitrate,{
    onProgress:value=>self.postMessage({type:'progress',stage:'encode',progress:value})
   });
   info=inspectMp3(bytes);
  }else{
   bytes=await encodeWavAsync(channels,settings.sampleRate,{
    bitDepth:settings.bitDepth,dither:settings.dither,
    onProgress:value=>self.postMessage({type:'progress',stage:'encode',progress:value})
   });
   info=inspectWav(bytes);
  }
  info.sourceClippedSamples=sourceClippedSamples;
  const output=bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  self.postMessage({type:'done',bytes:output,info},[output]);
 }catch(error){
  self.postMessage({type:'error',name:error?.name||'Error',message:error?.message||String(error)});
 }
};
