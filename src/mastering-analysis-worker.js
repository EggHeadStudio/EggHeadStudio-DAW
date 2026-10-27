import {analyzeLoudness,analyzeStereo} from './mastering-dsp.js';

self.onmessage=event=>{
 const{channels,sampleRate,requestId}=event.data||{};
 try{
  const analysis=analyzeLoudness(channels,sampleRate,{onProgress:progress=>self.postMessage({type:'progress',requestId,progress})});
  analysis.stereo=channels.length>=2?analyzeStereo(channels):null;
  self.postMessage({type:'result',requestId,analysis});
 }catch(error){
  self.postMessage({type:'error',requestId,message:error?.message||String(error)});
 }
};
