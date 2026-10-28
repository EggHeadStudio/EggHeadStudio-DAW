import test from 'node:test';
import assert from 'node:assert/strict';
import {activateRecordingTake,createRecordingTake,recordingBackingProject,recordingTiming,validateRecordingClip} from '../src/recording-model.js';

const timing=(over={})=>recordingTiming({contextTime:10,position:8,bpm:120,countInBars:1,sampleRate:48000,...over});

test('recording timing uses an exact frame start and count-in length',()=>{
  const t=timing();
  assert.equal(t.countInSeconds,2);
  assert.equal(t.startFrame,Math.ceil(12.2*48000));
  assert.equal(t.startContextTime,t.startFrame/48000);
});

test('recording timing rejects invalid settings',()=>{
  for(const bad of [{bpm:0},{countInBars:3},{offsetMs:5000},{position:-1},{sampleRate:NaN}])assert.throws(()=>timing(bad),/Invalid recording timing/);
});

test('take is placed using offset and playback latency and kept in a group',()=>{
  const t=timing({offsetMs:20,playbackLatency:.01});
  const take=createRecordingTake({id:'t1',assetId:'a1',groupId:'g',name:'Take 1',timing:t,frames:48000,sampleRate:48000,bpm:120});
  assert.ok(Math.abs(take.bar*240/120-(8-.02-.01))<1e-9);
  assert.equal(take.start,0);
  assert.equal(take.recording.groupId,'g');
  validateRecordingClip(take);
});

test('take that would start before zero is trimmed, and a fully trimmed take is rejected',()=>{
  const t=timing({position:0,offsetMs:100});
  const take=createRecordingTake({id:'t',assetId:'a',groupId:'g',name:'x',timing:t,frames:48000,sampleRate:48000,bpm:120});
  assert.equal(take.bar,0);
  assert.ok(Math.abs(take.start-.1)<1e-9);
  assert.throws(()=>createRecordingTake({id:'t',assetId:'a',groupId:'g',name:'x',timing:t,frames:1000,sampleRate:48000,bpm:120}),/trims the entire take/);
  assert.throws(()=>createRecordingTake({id:'t',assetId:'a',groupId:'g',name:'x',timing:t,frames:0,sampleRate:48000,bpm:120}),/empty or invalid/);
});

test('activating a take mutes only others in its group',()=>{
  const mk=(id,groupId)=>createRecordingTake({id,assetId:'a'+id,groupId,name:id,timing:timing(),frames:4800,sampleRate:48000,bpm:120});
  const track={clips:[mk('1','g'),mk('2','g'),mk('3','h'),{id:'plain',asset:'z'}]};
  activateRecordingTake(track,'2');
  assert.deepEqual(track.clips.map(c=>c.mute),[true,false,false,undefined]);
  assert.throws(()=>activateRecordingTake(track,'plain'),/Select a recording take/);
});

test('backing selection does not mutate project mute or solo',()=>{
  const project={loop:true,tracks:[{id:'a',mute:false,solo:true,volume:1},{id:'b',mute:false,solo:false,volume:.8}]};
  const copy=JSON.stringify(project);
  const backing=recordingBackingProject(project,new Map([['a',{enabled:true,volume:.5}]]));
  assert.equal(JSON.stringify(project),copy);
  assert.equal(backing.loop,false);
  assert.deepEqual(backing.tracks.map(t=>[t.mute,t.solo,t.volume]),[[false,false,.5],[true,false,.8]]);
});

test('validateRecordingClip rejects malformed metadata',()=>{
  const ok=createRecordingTake({id:'t',assetId:'a',groupId:'g',name:'n',timing:timing(),frames:4800,sampleRate:48000,bpm:120});
  validateRecordingClip(ok);
  validateRecordingClip({id:'x'});
  for(const patch of [{takeId:'other'},{frames:0},{sampleRate:100},{offsetMs:9999},{inputLatency:-1},{groupId:''},{name:'n'.repeat(121)}])
    assert.throws(()=>validateRecordingClip({...ok,recording:{...ok.recording,...patch}}),/Invalid recording take/);
  assert.throws(()=>validateRecordingClip({...ok,mute:'yes'}),/mute/);
});
