import {splitClipAtTime} from './arrangement.js';

/*
 Timing model. Backing playback for arrangement position P is scheduled at context time T. The performer hears it at
 T + outputPath, where outputPath = browser base/output latency + mastering-limiter lookahead (the limiter delays the whole
 master). A sound they play on cue enters the capture graph delayed again by inputPath, and AudioWorklet frame F is stamped
 with the context clock at which the sample reached the graph. A captured sample at frame F therefore maps to arrangement time
 P + (F - F0)/sr - (outputPath + inputPath). `compensationSeconds` is that total. Loopback calibration measures
 base+output+input together (the test tone bypasses mastering), so the mastering lookahead is added separately and the
 reported base/output values are never added on top of a measurement (no double counting).
*/
export function recordingCompensation({baseLatency=0,outputLatency=0,lookaheadSeconds=0,calibration=null}={}){
  if(![baseLatency,outputLatency,lookaheadSeconds].every(value=>Number.isFinite(value)&&value>=0))throw new Error('Invalid latency values.');
  if(calibration&&validCalibration(calibration)){
    return{seconds:calibration.roundTripSeconds+lookaheadSeconds,source:'loopback',roundTripSeconds:calibration.roundTripSeconds,lookaheadSeconds};
  }
  return{seconds:baseLatency+outputLatency+lookaheadSeconds,source:'reported',baseLatency,outputLatency,lookaheadSeconds,inputLatencyAssumed:0};
}

export function validCalibration(value){
  return !!value&&Number.isFinite(value.roundTripSeconds)&&value.roundTripSeconds>=0&&value.roundTripSeconds<=1&&Number.isFinite(value.correlation)&&value.correlation>=0&&value.correlation<=1;
}

export function calibrationKey(deviceId,sampleRate){return`${deviceId||'default'}@${Math.round(sampleRate)}`}

export function normalizeCalibrationStore(raw){
  const result={};
  if(!raw||typeof raw!=='object')return result;
  for(const [key,value] of Object.entries(raw))if(typeof key==='string'&&key.length<=300&&validCalibration(value))result[key]={roundTripSeconds:value.roundTripSeconds,correlation:value.correlation,measuredAt:String(value.measuredAt||'').slice(0,40),deviceStable:value.deviceStable===true};
  return result;
}

export function loopbackTestSignal(sampleRate,seconds=.05){
  if(!(sampleRate>=8000)||!(seconds>0))throw new Error('Invalid test-signal settings.');
  const length=Math.round(seconds*sampleRate),f0=500,f1=4000,k=(f1-f0)/seconds,signal=new Float32Array(length);
  for(let i=0;i<length;i++){const t=i/sampleRate,window=Math.sin(Math.PI*i/(length-1))**2;signal[i]=window*Math.sin(2*Math.PI*(f0*t+k*t*t/2))}
  return signal;
}

/* Cross-correlates the known chirp with captured audio. Returns the lag of the best match relative to the expected index. */
export function measureLoopbackLatency(captured,signal,sampleRate,{expectedIndex=0,maxLagSeconds=1}={}){
  const decimate=Math.max(1,Math.floor(sampleRate/12000)),n=signal.length,searchEnd=Math.min(captured.length-n,expectedIndex+Math.round(maxLagSeconds*sampleRate));
  if(searchEnd<expectedIndex)return{ok:false,reason:'Recording is shorter than the test signal.'};
  const down=(data,length)=>{const out=new Float32Array(Math.floor(length/decimate));for(let i=0;i<out.length;i++){let sum=0;for(let j=0;j<decimate;j++)sum+=data[i*decimate+j];out[i]=sum/decimate}return out};
  const x=down(captured,captured.length),r=down(signal,n),rn=r.length,energy=new Float64Array(x.length+1);
  for(let i=0;i<x.length;i++)energy[i+1]=energy[i]+x[i]*x[i];
  let refEnergy=0;for(let i=0;i<rn;i++)refEnergy+=r[i]*r[i];
  const score=lag=>{
    if(lag<0||lag+rn>x.length)return 0;
    let sum=0;for(let i=0;i<rn;i++)sum+=r[i]*x[lag+i];
    const window=energy[lag+rn]-energy[lag];
    return window>1e-12&&refEnergy>0?sum/Math.sqrt(window*refEnergy):0;
  };
  const first=Math.floor(expectedIndex/decimate),last=Math.floor(searchEnd/decimate),scores=new Float64Array(last-first+1);
  let best=first,bestScore=-Infinity;
  for(let lag=first;lag<=last;lag++){const value=scores[lag-first]=score(lag);if(value>bestScore){bestScore=value;best=lag}}
  const guard=Math.max(2,Math.round(.003*sampleRate/decimate));let sidelobe=0;
  // Normalized scores make an echo as strong as the direct path, so take the earliest strong peak; only earlier lags count as ambiguity.
  for(let lag=first;lag<best;lag++){const v=scores[lag-first];if(v>=.9*bestScore&&v>=(scores[lag-first-1]??-Infinity)&&v>=(scores[lag-first+1]??-Infinity)){best=lag;bestScore=v;break}}
  for(let lag=first;lag<=last;lag++)if(lag<best-guard&&Math.abs(scores[lag-first])>sidelobe)sidelobe=Math.abs(scores[lag-first]);
  const fullScore=index=>{
    if(index<0||index+n>captured.length)return -Infinity;
    let sum=0,window=0,ref=0;for(let i=0;i<n;i++){sum+=signal[i]*captured[index+i];window+=captured[index+i]**2;ref+=signal[i]**2}
    return window>1e-12?sum/Math.sqrt(window*ref):0;
  };
  let bestIndex=best*decimate,bestFull=-Infinity;
  for(let index=best*decimate-decimate;index<=best*decimate+decimate;index++){const value=fullScore(index);if(value>bestFull){bestFull=value;bestIndex=index}}
  let fractional=0;
  const a=fullScore(bestIndex-1),b=bestFull,c=fullScore(bestIndex+1);
  if(Number.isFinite(a)&&Number.isFinite(c)){const denominator=a-2*b+c;if(Math.abs(denominator)>1e-12)fractional=Math.max(-.5,Math.min(.5,.5*(a-c)/denominator))}
  const lagFrames=bestIndex+fractional-expectedIndex,correlation=Math.max(0,Math.min(1,bestFull)),ratio=sidelobe>0?bestScore/sidelobe:Infinity;
  const ok=correlation>=.25&&ratio>=1.5&&lagFrames>=0;
  return{ok,lagFrames,roundTripSeconds:lagFrames/sampleRate,correlation,peakToSidelobe:ratio,reason:ok?'':correlation<.25?'No clear test signal was detected. Use speakers near the microphone or a loopback cable and reduce background noise.':'The match is ambiguous (echo or noise). Repeat the test in a quieter setup.'};
}

export function recordingTiming({contextTime,position,bpm,countInBars=0,offsetMs=0,sampleRate,playbackLatency=0,punch=null}){
  if(![contextTime,position,bpm,offsetMs,sampleRate,playbackLatency].every(Number.isFinite)||contextTime<0||position<0||bpm<=0||sampleRate<=0||playbackLatency<0||Math.abs(offsetMs)>2000||![0,1,2,4].includes(countInBars))throw new Error('Invalid recording timing settings.');
  if(punch&&(!Number.isFinite(punch.inSeconds)||!Number.isFinite(punch.outSeconds)||!Number.isFinite(punch.preRollSeconds)||punch.inSeconds<0||punch.outSeconds<=punch.inSeconds||punch.preRollSeconds<0))throw new Error('Invalid punch range.');
  const countInSeconds=countInBars*4*60/bpm;
  const playFrame=Math.ceil((contextTime+.2+countInSeconds)*sampleRate);
  const backingStart=punch?Math.max(0,punch.inSeconds-punch.preRollSeconds):position,recordFrom=punch?punch.inSeconds:position;
  const startFrame=playFrame+Math.round((recordFrom-backingStart)*sampleRate);
  const endFrame=punch?playFrame+Math.round((punch.outSeconds-backingStart)*sampleRate):null;
  const base={startFrame,endFrame,playFrame,playContextTime:playFrame/sampleRate,startContextTime:startFrame/sampleRate,countInSeconds,backingStart,position:recordFrom,offsetMs,playbackLatency};
  base.clipPosition=Math.max(0,recordFrom-offsetMs/1000-playbackLatency);
  if(punch)base.punch={inSeconds:punch.inSeconds,outSeconds:punch.outSeconds,preRollSeconds:punch.preRollSeconds};
  return base;
}

/* Non-destructively splits active recorded takes around a punch region; the covered middle becomes a muted alternate. */
export function applyPunchToTrack(track,take,{inSeconds,outSeconds},bpm,idFactory){
  if(!(outSeconds>inSeconds)||!Number.isFinite(bpm)||bpm<=0)throw new Error('Invalid punch range.');
  const duration=clip=>clip.loop&&clip.duration!==undefined?clip.duration:(clip.end-clip.start)/(clip.rate||1),touched=[];
  for(const clip of [...track.clips]){
    if(clip.id===take.id||clip.kind==='instrument'||!clip.recording||clip.mute)continue;
    const start=clip.bar*240/bpm,end=start+duration(clip);
    if(end<=inSeconds||start>=outSeconds)continue;
    let middle=clip;
    if(start<inSeconds){middle=splitClipAtTime([track],track.id,clip.id,inSeconds,bpm,idFactory)}
    if(middle&&middle.bar*240/bpm+duration(middle)>outSeconds+1e-9)splitClipAtTime([track],track.id,middle.id,outSeconds,bpm,idFactory);
    if(middle){middle.mute=true;touched.push(middle.id)}
  }
  return touched;
}

export function createRecordingTake({id,assetId,groupId,name,timing,frames,sampleRate,bpm,inputLatency=0,outputLatency=0,compensation=null}){
  if(!id||!assetId||!groupId||!Number.isInteger(frames)||frames<=0||!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(bpm)||bpm<=0)throw new Error('Cannot create an empty or invalid recording take.');
  const position=timing.position-timing.offsetMs/1000-(timing.playbackLatency||0),trim=Math.max(0,-position);
  if(frames/sampleRate<=trim)throw new Error('Recording offset trims the entire take. Reduce offset compensation.');
  const recording={takeId:id,groupId,name,positionSeconds:timing.position,startFrame:timing.startFrame,sampleRate,frames,offsetMs:timing.offsetMs,inputLatency,outputLatency};
  if(compensation)recording.compensation={source:compensation.source,seconds:timing.playbackLatency};
  if(timing.punch)recording.punch={...timing.punch};
  return{id,asset:assetId,bar:Math.max(0,position)*bpm/240,start:trim,end:frames/sampleRate,rate:1,gain:1,fadeIn:0,fadeOut:0,mute:false,recording};
}

export function activateRecordingTake(track,id){
  const clip=track.clips.find(clip=>clip.id===id&&clip.recording);
  if(!clip)throw new Error('Select a recording take.');
  for(const item of track.clips)if(item.recording?.groupId===clip.recording.groupId)item.mute=item.recording.takeId!==clip.recording.takeId;
}

export function recordingBackingProject(project,selection){
  const solo=project.tracks.some(track=>track.solo);
  return{...project,loop:false,tracks:project.tracks.map(track=>{
    const monitor=selection.get(track.id);
    return{...track,solo:false,mute:track.mute||(solo&&!track.solo)||monitor?.enabled===false,volume:track.volume*(monitor?.volume??1)};
  })};
}

export function validateRecordingClip(clip){
  if(clip.mute!==undefined&&typeof clip.mute!=='boolean')throw new Error('Invalid clip mute state.');
  const r=clip.recording;if(r===undefined)return;
  if(!r||typeof r.takeId!=='string'||!r.takeId||r.takeId.length>128||typeof r.groupId!=='string'||!r.groupId||r.groupId.length>128||typeof r.name!=='string'||r.name.length>120||!Number.isInteger(r.frames)||r.frames<=0||!Number.isInteger(r.startFrame)||r.startFrame<0||!Number.isFinite(r.sampleRate)||r.sampleRate<8000||r.sampleRate>192000||!Number.isFinite(r.positionSeconds)||r.positionSeconds<0||!Number.isFinite(r.offsetMs)||Math.abs(r.offsetMs)>2000||![r.inputLatency,r.outputLatency].every(value=>Number.isFinite(value)&&value>=0))throw new Error('Invalid recording take metadata.');
  if(r.compensation!==undefined&&(!['reported','loopback'].includes(r.compensation?.source)||!Number.isFinite(r.compensation.seconds)||r.compensation.seconds<0))throw new Error('Invalid recording take metadata.');
  if(r.punch!==undefined&&(!Number.isFinite(r.punch?.inSeconds)||!Number.isFinite(r.punch.outSeconds)||r.punch.inSeconds<0||r.punch.outSeconds<=r.punch.inSeconds))throw new Error('Invalid recording take metadata.');
}
