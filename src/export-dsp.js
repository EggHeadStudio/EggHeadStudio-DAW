import {Mp3Encoder} from '../vendor/lamejs/lamejs.js';

export const EXPORT_SAMPLE_RATES=Object.freeze({
 wav:[44100,48000,88200,96000],
 mp3:[44100,48000]
});
export const EXPORT_BITRATES=Object.freeze([128,192,256,320]);
export const EXPORT_DEFAULTS=Object.freeze({
 format:'wav',bitDepth:24,bitrate:320,sampleRate:44100,channels:2,
 mastering:true,dither:true,advanced:false
});
export const EXPORT_MAX_MEMORY_BYTES=768*1024*1024;
export const EXPORT_WARN_MEMORY_BYTES=192*1024*1024;

export function normalizeExportSettings(settings={}){
 const format=settings.format==='mp3'?'mp3':'wav';
 const rates=EXPORT_SAMPLE_RATES[format];
 const sampleRate=rates.includes(Number(settings.sampleRate))?Number(settings.sampleRate):44100;
 return{
  format,
  bitDepth:[16,24,32].includes(Number(settings.bitDepth))?Number(settings.bitDepth):24,
  bitrate:EXPORT_BITRATES.includes(Number(settings.bitrate))?Number(settings.bitrate):320,
  sampleRate,
  channels:Number(settings.channels)===1?1:2,
  mastering:settings.mastering!==false,
  dither:settings.dither!==false,
  advanced:Boolean(settings.advanced)
 };
}

export function estimateExportMemory(duration,settings,sourceRate=44100){
 const normalized=normalizeExportSettings(settings);
 if(!Number.isFinite(duration)||duration<=0)throw new RangeError('Export duration must be positive.');
 const frames=Math.ceil(duration*normalized.sampleRate);
 const renderBytes=Math.ceil(duration*sourceRate*2*4);
 const transferBytes=renderBytes;
 const channelConversion=normalized.channels!==2;
 const workingBytes=sourceRate===normalized.sampleRate&&!channelConversion?0:frames*normalized.channels*4;
 const encodedBytes=normalized.format==='wav'
  ?44+frames*normalized.channels*(normalized.bitDepth/8)
  :Math.ceil(duration*normalized.bitrate*125)+65536;
 const estimatedPeakBytes=renderBytes+transferBytes+workingBytes+encodedBytes+64*1024*1024;
 return{frames,renderBytes,transferBytes,workingBytes,encodedBytes,estimatedPeakBytes,
  warning:estimatedPeakBytes>EXPORT_WARN_MEMORY_BYTES,
  allowed:estimatedPeakBytes<=EXPORT_MAX_MEMORY_BYTES};
}

function validateChannels(channels,sampleRate){
 if(!Array.isArray(channels)||channels.length<1||channels.length>2)throw new RangeError('Export supports mono or stereo audio.');
 if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Export sample rate is invalid.');
 const frames=channels[0]?.length;
 if(!frames||channels.some(channel=>channel.length!==frames))throw new RangeError('Export channels must have equal, non-zero frame counts.');
 return frames;
}

function greatestCommonDivisor(left,right){
 while(right){[left,right]=[right,left%right]}
 return left;
}

export function prepareExportChannels(channels,channelCount){
 if(!Array.isArray(channels)||!channels.length||!channels.every(channel=>channel.length===channels[0].length))throw new RangeError('Input audio channels must have equal lengths.');
 if(channelCount===1){
  if(channels.length===1)return channels;
  const mono=new Float32Array(channels[0].length);
  for(let frame=0;frame<mono.length;frame++){
   let sum=0;
   for(const channel of channels)sum+=channel[frame]||0;
   mono[frame]=sum/channels.length;
  }
  return[mono];
 }
 if(channelCount!==2)throw new RangeError('Export channel count must be mono or stereo.');
 if(channels.length===1)return[channels[0],channels[0]];
 return channels;
}

export function resampleChannel(input,sourceRate,targetRate,{taps=32,onProgress}={}){
 if(!(input instanceof Float32Array)||!input.length)throw new TypeError('Resampling requires a non-empty Float32Array.');
 if(!Number.isInteger(sourceRate)||!Number.isInteger(targetRate)||sourceRate<8000||targetRate<8000)throw new RangeError('Resampling rates must be valid audio sample rates.');
 if(!Number.isInteger(taps)||taps<8||taps%2!==0)throw new RangeError('Resampling filter length must be an even integer of at least 8.');
 if(sourceRate===targetRate)return new Float32Array(input);
 const outputLength=Math.max(1,Math.round(input.length*targetRate/sourceRate)),output=new Float32Array(outputLength);
 const radius=taps/2,cutoff=Math.min(1,targetRate/sourceRate)*.94,reportStep=Math.max(1,Math.floor(outputLength/100));
 const divisor=greatestCommonDivisor(sourceRate,targetRate),phaseCount=targetRate/divisor,sourceStep=sourceRate/divisor;
 const coefficients=Array.from({length:phaseCount},(_,phaseIndex)=>{
  const fraction=phaseIndex/phaseCount,weights=new Float64Array(taps);
  let total=0,index=0;
  for(let offset=-radius+1;offset<=radius;offset++){
   const distance=fraction-offset,scaled=distance*cutoff,position=distance/radius;
   const sinc=Math.abs(scaled)<1e-12?1:Math.sin(Math.PI*scaled)/(Math.PI*scaled);
   const window=Math.abs(position)>=1?0:.42+.5*Math.cos(Math.PI*position)+.08*Math.cos(2*Math.PI*position);
   weights[index++]=cutoff*sinc*window;total+=weights[index-1];
  }
  if(total)for(let weightIndex=0;weightIndex<weights.length;weightIndex++)weights[weightIndex]/=total;
  return weights;
 });
 for(let outIndex=0;outIndex<outputLength;outIndex++){
  const centerFrame=Math.floor(outIndex*sourceRate/targetRate),phaseIndex=(outIndex*sourceStep)%phaseCount,weights=coefficients[phaseIndex];
  let value=0,weightSum=0,index=0,edge=centerFrame<radius||centerFrame+radius>=input.length;
  for(let offset=-radius+1;offset<=radius;offset++){
   const sourceIndex=centerFrame+offset,weight=weights[index++];
   if(sourceIndex<0||sourceIndex>=input.length)continue;
   value+=(input[sourceIndex]||0)*weight;
   if(edge)weightSum+=weight;
  }
  output[outIndex]=edge&&weightSum?value/weightSum:value;
  if(onProgress&&outIndex%reportStep===0)onProgress(outIndex/outputLength);
 }
 onProgress?.(1);
 return output;
}

export async function resampleChannels(channels,sourceRate,targetRate,{onProgress,shouldCancel=()=>false}={}){
 validateChannels(channels,sourceRate);
 if(sourceRate===targetRate)return channels;
 const output=[];
 for(let index=0;index<channels.length;index++){
  if(shouldCancel())throw new DOMException('Export cancelled.','AbortError');
  output.push(resampleChannel(channels[index],sourceRate,targetRate,{onProgress:value=>onProgress?.((index+value)/channels.length)}));
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return output;
}

function writeString(view,offset,value){
 for(let index=0;index<value.length;index++)view.setUint8(offset+index,value.charCodeAt(index));
}

function pcmSample(sample,bits,dither,random){
 const negativeScale=2**(bits-1),positiveMax=negativeScale-1;
 let scaled=Math.max(-1,Math.min(1,sample))*negativeScale;
 if(dither)scaled+=(random()-random());
 return Math.max(-negativeScale,Math.min(positiveMax,Math.round(scaled)));
}

export async function encodeWavAsync(channels,sampleRate,{bitDepth=24,dither=true,onProgress,shouldCancel=()=>false,random=Math.random}={}){
 const frames=validateChannels(channels,sampleRate);
 if(![16,24,32].includes(bitDepth))throw new RangeError('WAV bit depth must be 16, 24, or 32.');
 if(bitDepth===32)dither=false;
 const bytesPerSample=bitDepth/8,dataBytes=frames*channels.length*bytesPerSample;
 if(dataBytes>0xffffffff-36)throw new RangeError('This WAV would exceed the RIFF 4 GiB size limit.');
 const result=new ArrayBuffer(44+dataBytes),view=new DataView(result),format=bitDepth===32?3:1;
 writeString(view,0,'RIFF');view.setUint32(4,36+dataBytes,true);writeString(view,8,'WAVE');
 writeString(view,12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,format,true);
 view.setUint16(22,channels.length,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*channels.length*bytesPerSample,true);
 view.setUint16(32,channels.length*bytesPerSample,true);view.setUint16(34,bitDepth,true);
 writeString(view,36,'data');view.setUint32(40,dataBytes,true);
 const chunkFrames=16384;
 for(let start=0;start<frames;start+=chunkFrames){
  if(shouldCancel())throw new DOMException('Export cancelled.','AbortError');
  const end=Math.min(frames,start+chunkFrames);
  for(let frame=start;frame<end;frame++)for(let channel=0;channel<channels.length;channel++){
   const sample=Number.isFinite(channels[channel][frame])?channels[channel][frame]:0,offset=44+(frame*channels.length+channel)*bytesPerSample;
   if(bitDepth===32)view.setFloat32(offset,sample,true);
   else{
    const quantized=pcmSample(sample,bitDepth,dither,random);
    if(bitDepth===16)view.setInt16(offset,quantized,true);
    else if(bitDepth===24){view.setUint8(offset,quantized&255);view.setUint8(offset+1,(quantized>>8)&255);view.setUint8(offset+2,(quantized>>16)&255)}
   }
  }
  onProgress?.(end/frames);
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return result;
}

function floatToInt16(sample){
 return Math.max(-32768,Math.min(32767,Math.round(Math.max(-1,Math.min(1,sample))*32768)));
}

export async function encodeMp3Async(channels,sampleRate,bitrate,{onProgress,shouldCancel=()=>false,Encoder=Mp3Encoder}={}){
 const frames=validateChannels(channels,sampleRate);
 if(!EXPORT_SAMPLE_RATES.mp3.includes(sampleRate))throw new RangeError('MP3 sample rate must be 44.1 or 48 kHz.');
 if(!EXPORT_BITRATES.includes(bitrate))throw new RangeError('MP3 bitrate must be 128, 192, 256, or 320 kbps.');
 const encoder=new Encoder(channels.length,sampleRate,bitrate),frameSize=1152,batchFrames=frameSize*16,chunks=[];
 for(let start=0;start<frames;start+=batchFrames){
  if(shouldCancel())throw new DOMException('Export cancelled.','AbortError');
  const end=Math.min(frames,start+batchFrames);
  for(let frame=start;frame<end;frame+=frameSize){
   const count=Math.min(frameSize,end-frame),left=new Int16Array(count),right=channels.length===2?new Int16Array(count):null;
   for(let index=0;index<count;index++){
    left[index]=floatToInt16(channels[0][frame+index]);
    if(right)right[index]=floatToInt16(channels[1][frame+index]);
   }
   const encoded=right?encoder.encodeBuffer(left,right):encoder.encodeBuffer(left);
   if(encoded?.length)chunks.push(new Uint8Array(encoded.buffer,encoded.byteOffset,encoded.byteLength));
  }
  onProgress?.(end/frames);
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 const tail=encoder.flush();
 if(tail?.length)chunks.push(new Uint8Array(tail.buffer,tail.byteOffset,tail.byteLength));
 const length=chunks.reduce((total,chunk)=>total+chunk.length,0),result=new Uint8Array(length);
 let offset=0;
 for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}
 return result;
}

export function inspectWav(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<44||String.fromCharCode(...bytes.subarray(0,4))!=='RIFF'||String.fromCharCode(...bytes.subarray(8,12))!=='WAVE')throw new Error('Invalid RIFF/WAVE file.');
 let offset=12,format=null,channels=0,sampleRate=0,bitDepth=0,dataBytes=0,dataOffset=-1;
 while(offset+8<=bytes.length){
  const id=String.fromCharCode(...bytes.subarray(offset,offset+4)),size=view.getUint32(offset+4,true),chunkStart=offset+8;
  if(chunkStart+size>bytes.length)throw new Error('Invalid WAV chunk bounds.');
  if(id==='fmt '){
   if(size<16)throw new Error('Invalid WAV format chunk.');
   format=view.getUint16(chunkStart,true);channels=view.getUint16(chunkStart+2,true);
   sampleRate=view.getUint32(chunkStart+4,true);bitDepth=view.getUint16(chunkStart+14,true);
  }else if(id==='data'){dataBytes=size;dataOffset=chunkStart}
  offset=chunkStart+size+(size&1);
 }
 if(offset!==bytes.length||dataOffset<0)throw new Error('Unsupported or truncated WAV chunk layout.');
 if(![1,3].includes(format)||!channels||!sampleRate)throw new Error('Invalid WAV format or data chunk.');
 if((format===3&&bitDepth!==32)||(format===1&&![16,24].includes(bitDepth)))throw new Error('Unsupported WAV sample encoding.');
 return{format:format===3?'float':'pcm',channels,sampleRate,bitDepth,dataBytes,dataOffset,frames:dataBytes/(channels*bitDepth/8),duration:dataBytes/(channels*bitDepth/8)/sampleRate};
}

export function inspectMp3(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 let offset=0;
 if(bytes.length>=10&&String.fromCharCode(...bytes.subarray(0,3))==='ID3'){
  offset=10+((bytes[6]&0x7f)<<21)+((bytes[7]&0x7f)<<14)+((bytes[8]&0x7f)<<7)+(bytes[9]&0x7f);
 }
 const rates=[44100,48000,32000],mpeg1Bitrates=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0],mpeg2Bitrates=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
 const frames=[],seenRates=new Set(),seenBitrates=new Set();
 for(;offset+4<=bytes.length;){
  if(bytes[offset]!==0xff||(bytes[offset+1]&0xe0)!==0xe0){offset++;continue}
  const header=((bytes[offset]<<24)|(bytes[offset+1]<<16)|(bytes[offset+2]<<8)|bytes[offset+3])>>>0;
  const version=(header>>>19)&3,layer=(header>>>17)&3,bitrateIndex=(header>>>12)&15,rateIndex=(header>>>10)&3;
  if(version===1||layer!==1||bitrateIndex===0||bitrateIndex===15||rateIndex===3){offset++;continue}
  const mpeg1=version===3,sampleRate=Math.floor(rates[rateIndex]/(mpeg1?1:version===2?2:4)),bitrate=(mpeg1?mpeg1Bitrates:mpeg2Bitrates)[bitrateIndex],padding=(header>>>9)&1,frameLength=Math.floor((mpeg1?144:72)*bitrate*1000/sampleRate)+padding;
  if(frameLength<24||offset+frameLength>bytes.length)break;
  const channelMode=(header>>>6)&3;
  frames.push({offset,length:frameLength,sampleRate,bitrate,channels:channelMode===3?1:2,samplesPerFrame:mpeg1?1152:576});
  seenRates.add(sampleRate);seenBitrates.add(bitrate);offset+=frameLength;
 }
 if(!frames.length)throw new Error('No valid MPEG Layer III frames were found.');
 return{frames:frames.length,sampleRate:frames[0].sampleRate,channels:frames[0].channels,
  bitrates:[...seenBitrates],duration:frames.reduce((total,frame)=>total+frame.samplesPerFrame/frame.sampleRate,0),
  frameBytes:frames.reduce((total,frame)=>total+frame.length,0),variableBitrate:seenBitrates.size>1,
  sampleRates:[...seenRates]};
}
