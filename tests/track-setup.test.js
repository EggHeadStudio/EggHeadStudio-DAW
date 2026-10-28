import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectTrack,trackPlaybackType,parseProject,serializeProject} from '../src/project-state.js';
import {formatTransportTime} from '../src/timeline.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {encodeWav} from '../src/audio.js';

test('named colored audio tracks use normal routing defaults without an instrument',()=>{
  const track=createProjectTrack({name:'  Bass recording  ',color:'#123abc'},'audio');
  assert.equal(track.name,'Bass recording');assert.equal(track.color,'#123abc');
  assert.equal(trackPlaybackType(track),'audio');assert.deepEqual(track.clips,[]);
  assert.equal(track.volume,.85);assert.equal(track.fx.cutoff,20000);
});

test('Sampler type creates a pitched sample instrument and preserves selected appearance',()=>{
  const track=createProjectTrack({name:'Synth',color:'#abcdef',type:'sampler',assetId:'tone',duration:2,pitch:{midi:48,name:'C3',confidence:.9}},'synth');
  assert.equal(trackPlaybackType(track),'sampler');assert.equal(track.sampler.asset,'tone');
  assert.equal(track.sampler.rootNote,48);assert.equal(track.sampler.end,2);assert.equal(track.name,'Synth');
  assert.deepEqual(track.pattern.notes,[]);
});

test('Drum Rack type creates sixteen independent pads, optionally initialized with a sample',()=>{
  const empty=createProjectTrack({name:'Drums',color:'#123456',type:'drumRack'},'rack');
  assert.equal(trackPlaybackType(empty),'drumRack');assert.equal(empty.drumRack.pads.length,16);
  assert.equal(empty.drumRack.pads[0].asset,null);empty.drumRack.pads[0].volume=.1;
  assert.equal(empty.drumRack.pads[1].volume,1);
  const loaded=createProjectTrack({name:'Kit',color:'#123456',type:'drumRack',assetId:'kick'},'loaded');
  assert.ok(loaded.drumRack.pads.every(pad=>pad.asset==='kick'));
});

test('invalid track setup is rejected before project mutation',()=>{
  for(const settings of [{name:' '},{name:'x'.repeat(81)},{type:'synth'},{color:'red'},{type:'sampler'},{type:'sampler',assetId:'tone',duration:NaN}]){
    assert.throws(()=>createProjectTrack({name:'Track',color:'#123456',...settings},'bad'));
  }
});

test('legacy playback types are inferred without requiring new schema fields',()=>{
  assert.equal(trackPlaybackType({name:'Drums',clips:[]}),'audio');
  assert.equal(trackPlaybackType({sampler:{asset:'tone'}}),'sampler');
  assert.equal(trackPlaybackType({drumRack:{pads:[]}}),'drumRack');
});

test('track appearance and playback settings survive JSON and EHS v1 round trips',async()=>{
  const project={id:'appearance',schemaVersion:1,name:'Track setup',bpm:120,tracks:[
    createProjectTrack({name:'Bass audio',color:'#123456'},'audio'),
    createProjectTrack({name:'My kit',color:'#abcdef',type:'drumRack'},'rack'),
    createProjectTrack({name:'Lead synth',color:'#ca9876',type:'sampler',assetId:'tone',duration:.01},'lead')
  ]};
  assert.deepEqual(parseProject(serializeProject(project)),project);
  const archive=await createPortableProjectArchive(project,{assetFiles:new Map([['tone',encodeWav([new Float32Array(441)],44100)]])});
  const opened=await openPortableProjectArchive(archive);
  assert.deepEqual(opened.project.tracks,project.tracks);
});

test('transport time displays precise elapsed minutes and seconds without wrapping at an hour',()=>{
  assert.equal(formatTransportTime(0),'00:00.000');
  assert.equal(formatTransportTime(2.5),'00:02.500');
  assert.equal(formatTransportTime(59.999),'00:59.999');
  assert.equal(formatTransportTime(60),'01:00.000');
  assert.equal(formatTransportTime(3661.125),'61:01.125');
  assert.equal(formatTransportTime(-1),'00:00.000');assert.equal(formatTransportTime(NaN),'00:00.000');
});
