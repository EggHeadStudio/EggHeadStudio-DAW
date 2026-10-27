function createBuffer(context,buffer,length){
 const result=context.createBuffer(buffer.numberOfChannels,Math.max(1,length),buffer.sampleRate);
 return result;
}

export function resampleBuffer(context,buffer,speed=1){
 if(!Number.isFinite(speed)||speed<.25||speed>4)throw new RangeError('Playback speed must be between 0.25x and 4x.');
 const output=createBuffer(context,buffer,Math.round(buffer.length/speed));
 for(let channel=0;channel<buffer.numberOfChannels;channel++){
  const source=buffer.getChannelData(channel),target=output.getChannelData(channel);
  for(let frame=0;frame<target.length;frame++){
   const position=frame*speed,first=Math.min(source.length-1,Math.floor(position)),second=Math.min(source.length-1,first+1),fraction=position-first;
   target[frame]=source[first]*(1-fraction)+source[second]*fraction;
  }
 }
 return output;
}

export function timeStretchBuffer(context,buffer,factor=1){
 if(!Number.isFinite(factor)||factor<.25||factor>4)throw new RangeError('Time stretch must be between 0.25x and 4x.');
 if(factor===1)return buffer;
 const outputLength=Math.max(1,Math.round(buffer.length*factor)),output=createBuffer(context,buffer,outputLength);
 if(buffer.length<32)return resampleBuffer(context,buffer,1/factor);
 const windowSize=Math.min(1024,2**Math.floor(Math.log2(buffer.length))),synthesisHop=Math.max(1,Math.floor(windowSize/4)),searchRadius=Math.max(8,Math.floor(windowSize/8)),weights=new Float32Array(outputLength),sources=Array.from({length:buffer.numberOfChannels},(_,channel)=>buffer.getChannelData(channel)),targets=Array.from({length:output.numberOfChannels},(_,channel)=>output.getChannelData(channel));
 for(let outputStart=0;outputStart<outputLength;outputStart+=synthesisHop){
  if(outputStart>=outputLength)break;
  const expectedInput=Math.round(outputStart/factor),overlap=Math.min(windowSize-synthesisHop,outputLength-outputStart);
  let inputStart=Math.max(0,Math.min(buffer.length-1,expectedInput));
  if(outputStart>0&&overlap>0){
   let bestScore=-Infinity,bestStart=inputStart;
   const first=Math.max(0,inputStart-searchRadius),last=Math.min(buffer.length-windowSize,inputStart+searchRadius);
   for(let candidate=first;candidate<=last;candidate+=4){
    let score=0;
    for(let offset=0;offset<overlap;offset+=8){
     const targetFrame=outputStart+offset,weight=weights[targetFrame];
     if(weight<=1e-6)continue;
     for(let channel=0;channel<buffer.numberOfChannels;channel++)score+=targets[channel][targetFrame]/weight*sources[channel][candidate+offset];
    }
    if(score>bestScore){bestScore=score;bestStart=candidate}
   }
   inputStart=bestStart;
  }
  const count=Math.min(windowSize,buffer.length-inputStart,outputLength-outputStart);
  for(let offset=0;offset<count;offset++){
   const phase=windowSize<=1?0:offset/(windowSize-1),weight=.5-.5*Math.cos(2*Math.PI*phase);
   weights[outputStart+offset]+=weight;
   for(let channel=0;channel<buffer.numberOfChannels;channel++)targets[channel][outputStart+offset]+=sources[channel][inputStart+offset]*weight;
  }
 }
 for(let channel=0;channel<output.numberOfChannels;channel++){
  const data=targets[channel];
  for(let frame=0;frame<outputLength;frame++)data[frame]=weights[frame]>1e-6?data[frame]/weights[frame]:0;
 }
 return output;
}

export function pitchShiftBuffer(context,buffer,semitones=0,cents=0){
 if(!Number.isFinite(semitones)||!Number.isFinite(cents))throw new RangeError('Pitch shift must be finite.');
 const ratio=2**((semitones+cents/100)/12);
 if(ratio<.25||ratio>4)throw new RangeError('Pitch shift is outside the supported 0.25x–4x range.');
 if(Math.abs(ratio-1)<1e-9)return buffer;
 const shifted=resampleBuffer(context,buffer,ratio);
 return timeStretchBuffer(context,shifted,buffer.length/shifted.length);
}

export function renderSampleProcessing(context,buffer,{speed=1,pitchSemitones=0,pitchCents=0,mode='preserve'}={}){
 if(!['preserve','repitch'].includes(mode))throw new RangeError('Unknown sample pitch mode.');
 if(mode==='repitch')return resampleBuffer(context,buffer,speed*2**((pitchSemitones+pitchCents/100)/12));
 const pitched=pitchShiftBuffer(context,buffer,pitchSemitones,pitchCents);
 return timeStretchBuffer(context,pitched,1/speed);
}
