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

export function masterRangeInSeconds(range,bpm){
 if(!range||![range.startBeat,range.endBeat,bpm].every(Number.isFinite)||range.startBeat<0||range.endBeat-range.startBeat<1||bpm<=0)throw new RangeError('Master export range must span at least one beat.');
 return{start:range.startBeat*60/bpm,end:range.endBeat*60/bpm};
}

export function fitMasterRange(range,beat,minimumBeats=1){
 if(![range?.startBeat,range?.endBeat,beat,minimumBeats].every(Number.isFinite)||beat<0||minimumBeats<=0)throw new RangeError('Master range coordinates must be finite.');
 const start=Math.max(0,range.startBeat),end=Math.max(start+minimumBeats,range.endBeat);
 return{startBeat:start,endBeat:end};
}

export function cropMasterAudioBuffer(buffer,range,bpm,createBuffer){
 const seconds=masterRangeInSeconds(range,bpm);
 if(!buffer||!Number.isInteger(buffer.length)||buffer.length<1||!Number.isFinite(buffer.sampleRate)||buffer.sampleRate<=0||!Number.isInteger(buffer.numberOfChannels)||buffer.numberOfChannels<1)throw new TypeError('A decoded audio buffer is required to crop the master range.');
 if(typeof createBuffer!=='function')throw new TypeError('A buffer factory is required to crop the master range.');
 const length=Math.ceil((seconds.end-seconds.start)*buffer.sampleRate),output=createBuffer(buffer.numberOfChannels,length,buffer.sampleRate),sourceStart=Math.min(buffer.length,Math.floor(seconds.start*buffer.sampleRate));
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const source=buffer.getChannelData(channel),target=output.getChannelData(channel),available=Math.max(0,Math.min(length,buffer.length-sourceStart));
  if(available)target.set(source.subarray(sourceStart,sourceStart+available));
 }
 return output;
}
