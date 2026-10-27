import {EXPORT_MAX_MEMORY_BYTES,EXPORT_WARN_MEMORY_BYTES,estimateExportMemory,normalizeExportSettings} from './export-dsp.js';

export {EXPORT_BITRATES,EXPORT_DEFAULTS,EXPORT_SAMPLE_RATES,estimateExportMemory,normalizeExportSettings} from './export-dsp.js';

export function encodeExport(buffer,settings,{signal,onProgress}={}){
 if(!buffer||!Number.isInteger(buffer.numberOfChannels)||!buffer.length)throw new TypeError('A non-empty rendered audio buffer is required.');
 const config=normalizeExportSettings(settings),memory=estimateExportMemory(buffer.duration,config,buffer.sampleRate);
 if(!memory.allowed)throw new RangeError(`This export is estimated to need ${Math.ceil(memory.estimatedPeakBytes/1024/1024)} MiB of memory. Reduce the duration or output sample rate and try again.`);
 if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Export cancelled.','AbortError'));
 const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>new Float32Array(buffer.getChannelData(index)));
 const worker=new Worker(new URL('./export-worker.js',import.meta.url),{type:'module'});
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{
   signal?.removeEventListener('abort',abort);
   worker.terminate();
  };
  const finish=(callback,value)=>{
   if(settled)return;
   settled=true;cleanup();callback(value);
  };
  const abort=()=>{
   const error=signal?.reason?.name==='AbortError'?signal.reason:new DOMException('Export cancelled.','AbortError');
   finish(reject,error);
  };
  worker.onmessage=({data})=>{
   if(data?.type==='progress'){onProgress?.(data.stage,Math.max(0,Math.min(1,data.progress)));return}
   if(data?.type==='error'){const error=new Error(data.message);error.name=data.name||'Error';finish(reject,error);return}
   if(data?.type==='done'){
    const blob=new Blob([data.bytes],{type:config.format==='mp3'?'audio/mpeg':'audio/wav'});
    finish(resolve,{blob,info:data.info,settings:config,memory});
   }
  };
  worker.onerror=event=>finish(reject,new Error(event.message||'Audio export worker failed.'));
  worker.onmessageerror=()=>finish(reject,new Error('The audio export worker returned data the page could not read.'));
  signal?.addEventListener('abort',abort,{once:true});
  const transfer=channels.map(channel=>channel.buffer);
  try{worker.postMessage({type:'encode',channels,sampleRate:buffer.sampleRate,settings:config},transfer)}
  catch(error){finish(reject,error)}
 });
}

export function exportMemoryWarning(memory){
 if(memory.estimatedPeakBytes>EXPORT_MAX_MEMORY_BYTES)return`Estimated export memory is ${Math.ceil(memory.estimatedPeakBytes/1024/1024)} MiB, above the supported limit.`;
 if(memory.estimatedPeakBytes>EXPORT_WARN_MEMORY_BYTES)return`Large export: estimated peak memory is ${Math.ceil(memory.estimatedPeakBytes/1024/1024)} MiB. Close other tabs or choose a lower sample rate if the browser is memory-limited.`;
 return'';
}
