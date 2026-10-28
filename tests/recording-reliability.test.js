import test from 'node:test';
import assert from 'node:assert/strict';
import {activateRecordingTake,applyPunchToTrack,createRecordingTake,loopbackTestSignal,measureLoopbackLatency,normalizeCalibrationStore,recordingCompensation,recordingTiming,validateRecordingClip} from '../src/recording-model.js';
import {commitRecordedTake,quotaFailure} from '../src/recording-session.js';
import {copyTimeRange,duplicateClip,pasteTimeRange,splitClipAtTime} from '../src/arrangement.js';

const rate=48000;
let counter=0;const ids=()=>`id${++counter}`;
const take=(over={})=>({id:'t0',asset:'a0',bar:0,start:0,end:8,rate:1,gain:1,fadeIn:0,fadeOut:0,mute:false,recording:{takeId:'t0',groupId:'g0',name:'Take',positionSeconds:0,startFrame:0,sampleRate:rate,frames:8*rate,offsetMs:0,inputLatency:0,outputLatency:0},...over});

function delayed(signal,delaySamples,{total=Math.round(1.6*rate),gain=1,noise=0,echo=0,seed=1}={}){
  const out=new Float32Array(total);let s=seed;const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/2**32-.5};
  for(let i=0;i<total;i++)out[i]=noise*rand();
  for(let i=0;i<signal.length;i++){const at=Math.round(delaySamples)+i;if(at<total)out[at]+=gain*signal[i];if(echo&&at+2400<total)out[at+2400]+=echo*gain*signal[i]}
  return out;
}

test('compensation never adds reported latency on top of a loopback measurement',()=>{
  const reported=recordingCompensation({baseLatency:.01,outputLatency:.02,lookaheadSeconds:.005});
  assert.equal(reported.source,'reported');assert.ok(Math.abs(reported.seconds-.035)<1e-12);assert.equal(reported.inputLatencyAssumed,0);
  const measured=recordingCompensation({baseLatency:.01,outputLatency:.02,lookaheadSeconds:.005,calibration:{roundTripSeconds:.08,correlation:.9}});
  assert.equal(measured.source,'loopback');assert.ok(Math.abs(measured.seconds-.085)<1e-12);
  assert.equal(recordingCompensation({calibration:{roundTripSeconds:5,correlation:1}}).source,'reported');
  assert.throws(()=>recordingCompensation({baseLatency:-1}),/Invalid latency/);
});

test('calibration store keeps only valid entries',()=>{
  const store=normalizeCalibrationStore({a:{roundTripSeconds:.05,correlation:.8,measuredAt:'x'},b:{roundTripSeconds:-1,correlation:.8},c:null});
  assert.deepEqual(Object.keys(store),['a']);
  assert.deepEqual(normalizeCalibrationStore('nope'),{});
});

test('loopback correlation recovers known delays within a fraction of a sample',()=>{
  const signal=loopbackTestSignal(rate),expected=Math.round(.4*rate);
  for(const delayMs of [0,12.5,37.3,118.04,310]){
    const delay=Math.round(delayMs/1000*rate),captured=delayed(signal,expected+delay,{noise:.02,gain:.3});
    const result=measureLoopbackLatency(captured,signal,rate,{expectedIndex:expected,maxLagSeconds:.6});
    assert.ok(result.ok,`${delayMs} ms should be detected`);
    assert.ok(Math.abs(result.lagFrames-delay)<=1,`${delayMs} ms lag ${result.lagFrames} vs ${delay}`);
  }
});

test('loopback correlation survives attenuation, an echo and reports failure honestly',()=>{
  const signal=loopbackTestSignal(rate),expected=Math.round(.4*rate),delay=Math.round(.0613*rate);
  const echoed=measureLoopbackLatency(delayed(signal,expected+delay,{gain:.1,echo:.5,noise:.01}),signal,rate,{expectedIndex:expected,maxLagSeconds:.6});
  assert.ok(echoed.ok);assert.ok(Math.abs(echoed.lagFrames-delay)<=1);
  const silent=measureLoopbackLatency(new Float32Array(Math.round(1.6*rate)),signal,rate,{expectedIndex:expected,maxLagSeconds:.6});
  assert.equal(silent.ok,false);assert.match(silent.reason,/No clear test signal/);
  const noise=measureLoopbackLatency(delayed(new Float32Array(10),0,{noise:1,seed:9}),signal,rate,{expectedIndex:0,maxLagSeconds:.6});
  assert.equal(noise.ok,false);
  assert.equal(measureLoopbackLatency(new Float32Array(100),signal,rate).ok,false);
});

test('punch timing places capture start and end on exact audio frames',()=>{
  const t=recordingTiming({contextTime:3,position:0,bpm:120,sampleRate:rate,countInBars:1,punch:{inSeconds:8,outSeconds:12,preRollSeconds:2}});
  assert.equal(t.backingStart,6);
  assert.equal(t.playFrame,Math.ceil((3+.2+2)*rate));
  assert.equal(t.startFrame-t.playFrame,2*rate);
  assert.equal(t.endFrame-t.startFrame,4*rate);
  assert.equal(t.position,8);
  const early=recordingTiming({contextTime:0,position:0,bpm:120,sampleRate:rate,punch:{inSeconds:1,outSeconds:2,preRollSeconds:4}});
  assert.equal(early.backingStart,0);assert.equal(early.startFrame-early.playFrame,rate);
  assert.throws(()=>recordingTiming({contextTime:0,position:0,bpm:120,sampleRate:rate,punch:{inSeconds:2,outSeconds:2,preRollSeconds:0}}),/Invalid punch/);
  const plain=recordingTiming({contextTime:1,position:2,bpm:120,sampleRate:rate});
  assert.equal(plain.endFrame,null);assert.equal(plain.startFrame,plain.playFrame);
});

test('punch splits the active take without losing or copying audio',()=>{
  const track={id:'tr',clips:[take()]},punchTake={id:'p',asset:'a1'};
  const touched=applyPunchToTrack(track,punchTake,{inSeconds:2,outSeconds:5},120,ids);
  const clips=track.clips.map(c=>({bar:c.bar*2,start:c.start,end:c.end,mute:c.mute}));
  assert.equal(track.clips.length,3);assert.equal(touched.length,1);
  assert.deepEqual(clips,[{bar:0,start:0,end:2,mute:false},{bar:2,start:2,end:5,mute:true},{bar:5,start:5,end:8,mute:false}]);
  assert.ok(track.clips.every(c=>c.asset==='a0'));
  for(const clip of track.clips)validateRecordingClip(clip);
  assert.equal(new Set(track.clips.map(c=>c.recording)).size,3);
  assert.equal(new Set(track.clips.map(c=>c.id)).size,3);
});

test('punch handles edges, non-overlap, muted alternates and plain audio',()=>{
  const track={id:'tr',clips:[take({id:'x',recording:{...take().recording,takeId:'x'},bar:10}),take({id:'plain',recording:undefined}),take({id:'m',mute:true})]};
  delete track.clips[1].recording;
  applyPunchToTrack(track,{id:'p'},{inSeconds:0,outSeconds:3},120,ids);
  assert.equal(track.clips.find(c=>c.id==='x').mute,false);
  assert.equal(track.clips.find(c=>c.id==='plain').mute,false);
  assert.equal(track.clips.find(c=>c.id==='m').end,8);
  const edge={id:'tr',clips:[take()]};
  applyPunchToTrack(edge,{id:'p'},{inSeconds:0,outSeconds:3},120,ids);
  assert.deepEqual(edge.clips.map(c=>[c.start,c.end,c.mute]),[[0,3,true],[3,8,false]]);
  assert.throws(()=>applyPunchToTrack(edge,{id:'p'},{inSeconds:3,outSeconds:3},120,ids),/Invalid punch/);
});

test('split, duplicate and paste keep recorded takes valid and independent',()=>{
  const tracks=[{id:'tr',clips:[take()]}];
  const right=splitClipAtTime(tracks,'tr','t0',3,120,ids);
  validateRecordingClip(right);validateRecordingClip(tracks[0].clips[0]);
  assert.notEqual(right.recording,tracks[0].clips[0].recording);
  right.recording.name='Renamed';assert.equal(tracks[0].clips[0].recording.name,'Take');
  const copy=duplicateClip(tracks,'tr','t0',120,ids);
  validateRecordingClip(copy);assert.notEqual(copy.recording,tracks[0].clips[0].recording);
  const clipboard=copyTimeRange(tracks,{firstTrack:0,lastTrack:0,startBeat:0,endBeat:8},120);
  const [pasted]=pasteTimeRange(tracks,clipboard,32,0,ids);
  validateRecordingClip(pasted);assert.notEqual(pasted.recording,clipboard.entries[0].clip.recording);
});

test('activating a split take keeps every piece of that take together',()=>{
  const track={id:'tr',clips:[take()]};
  splitClipAtTime([track],'tr','t0',3,120,ids);
  const other=take({id:'t1',recording:{...take().recording,takeId:'t1'}});track.clips.push(other);
  activateRecordingTake(track,'t1');
  assert.deepEqual(track.clips.map(c=>c.mute),[true,true,false]);
  activateRecordingTake(track,track.clips[1].id);
  assert.deepEqual(track.clips.map(c=>c.mute),[false,false,true]);
});

function pendingTake(){return{id:'take1',assetId:'asset1',name:'Take 1',frames:1000,sampleRate:rate,chunks:[new Float32Array(600).fill(.25),new Float32Array(400).fill(-.25)]}}
const fakeBuffer=(channels,frames)=>{const data=new Float32Array(frames);return{getChannelData:()=>data}};
const timing=()=>recordingTiming({contextTime:0,position:1,bpm:120,sampleRate:rate});

test('a storage quota failure keeps captured audio and a retry completes without re-encoding',async()=>{
  const pending=pendingTake(),track={id:'tr',clips:[]};let stores=0,encodes=0,fail=true;
  const deps={createBuffer:fakeBuffer,encodeWav:async()=>{encodes++;return new Uint8Array(16)},storeAsset:async()=>{stores++;if(fail)throw Object.assign(new Error('full'),{name:'QuotaExceededError'})},track,timing:timing(),bpm:120,idFactory:ids,compensation:{source:'reported'}};
  await assert.rejects(commitRecordedTake(pending,deps),error=>error.stage==='store'&&quotaFailure(error));
  assert.equal(track.clips.length,0);assert.ok(pending.wavBytes);assert.equal(pending.buffer.getChannelData(0)[0],.25);
  fail=false;const clip=await commitRecordedTake(pending,deps);
  assert.equal(encodes,1);assert.equal(stores,2);assert.equal(track.clips.length,1);assert.equal(clip.recording.compensation.source,'reported');
  assert.equal((await commitRecordedTake(pending,deps)).id,clip.id);assert.equal(track.clips.length,1);
});

test('an encoding failure is reported by stage and can be retried',async()=>{
  const pending=pendingTake(),track={id:'tr',clips:[]};let fail=true;
  const deps={createBuffer:fakeBuffer,encodeWav:async()=>{if(fail)throw new Error('worker died');return new Uint8Array(8)},storeAsset:async()=>{},track,timing:timing(),bpm:120,idFactory:ids};
  await assert.rejects(commitRecordedTake(pending,deps),error=>error.stage==='encode'&&/worker died/.test(error.message));
  assert.equal(pending.wavBytes,undefined);assert.equal(pending.chunks.length,0);
  fail=false;await commitRecordedTake(pending,deps);assert.equal(track.clips.length,1);
});

test('a punch take layers over an existing take while preserving both',async()=>{
  const pending=pendingTake(),track={id:'tr',clips:[take({bar:0,end:8})]};
  const punchTiming=recordingTiming({contextTime:0,position:0,bpm:120,sampleRate:rate,punch:{inSeconds:2,outSeconds:2+1000/rate,preRollSeconds:1}});
  const clip=await commitRecordedTake(pending,{createBuffer:fakeBuffer,encodeWav:async()=>new Uint8Array(8),storeAsset:async()=>{},track,timing:punchTiming,bpm:120,idFactory:ids});
  assert.equal(track.clips.filter(c=>c.asset==='a0').length>=2,true);
  assert.equal(clip.mute,false);assert.equal(clip.recording.punch.inSeconds,2);
  assert.ok(track.clips.some(c=>c.asset==='a0'&&c.mute));
  assert.ok(track.clips.some(c=>c.asset==='a0'&&!c.mute&&c.bar===0));
  for(const c of track.clips)validateRecordingClip(c);
});

test('the capture worklet starts and stops on exact frames and ends itself at punch-out',async()=>{
  let processor;
  globalThis.AudioWorkletProcessor=class{constructor(){this.port={messages:[],postMessage:(message)=>this.port.messages.push(message)}}};
  globalThis.registerProcessor=(name,Class)=>{processor=new Class()};
  globalThis.currentFrame=0;
  await import('../src/recording-processor.js?punch');
  processor.port.onmessage({data:{type:'start',startFrame:300,endFrame:700,maxFrames:100000}});
  const block=index=>[[Float32Array.from({length:128},(_,i)=>(index*128+i)/10000)]];
  for(let b=0;b<8;b++){globalThis.currentFrame=b*128;processor.process(block(b))}
  const pcm=processor.port.messages.filter(m=>m.type==='pcm').flatMap(m=>[...m.data]),done=processor.port.messages.find(m=>m.type==='finished');
  assert.equal(done.frames,400);assert.equal(pcm.length,400);
  assert.ok(Math.abs(pcm[0]-300/10000)<1e-6);assert.ok(Math.abs(pcm[399]-699/10000)<1e-6);
  const before=processor.port.messages.length;globalThis.currentFrame=2000;processor.process(block(15));
  assert.equal(processor.port.messages.length,before);
});
