import {getWaveformRangePeaks} from './waveform.js';

export function createMasterWaveformPeaks(buffer,{samplesPerSecond=120,maxSamples=65536}={}){
 if(!buffer||!Number.isInteger(buffer.length)||buffer.length<1||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1)throw new TypeError('A decoded audio buffer is required to build the master waveform.');
 if(!Number.isFinite(samplesPerSecond)||samplesPerSecond<=0||!Number.isInteger(maxSamples)||maxSamples<1)throw new RangeError('Master waveform resolution must be positive.');
 const count=Math.max(1,Math.min(maxSamples,Math.ceil(buffer.length/buffer.sampleRate*samplesPerSecond))),channels=[];
 for(let channel=0;channel<Math.min(2,buffer.numberOfChannels);channel++){
  const minimum=new Float32Array(count),maximum=new Float32Array(count);
  for(let index=0;index<count;index++){
   const start=Math.floor(index*buffer.length/count),end=Math.max(start+1,Math.floor((index+1)*buffer.length/count)),peak=getWaveformRangePeaks(buffer,channel,start,Math.min(buffer.length,end));
   minimum[index]=peak.minimum;maximum[index]=peak.maximum;
  }
  channels.push({minimum,maximum});
 }
 return{duration:buffer.length/buffer.sampleRate,channels};
}
