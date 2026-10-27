import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyProject,deleteProjectTrack,isTrackAudible,parseProject,planProjectReset,serializeProject} from '../src/project-state.js';
import {createEmptySampleSession,resolveRecordingChunks,shouldConfirmSampleDiscard} from '../src/sample-lifecycle.js';

test('new project resets arrangement, patterns, BPM and master settings',()=>{
  const project=createEmptyProject();
  assert.equal(project.name,'Untitled Project');
  assert.equal(project.bpm,120);
  assert.equal(project.tracks.length,0);
  assert.deepEqual(project.masterSettings,{eq:0,threshold:-12,makeup:0,volume:1});
});

test('cancelled project reset preserves the active project and serialized state',()=>{
  const active={name:'Current',bpm:96,tracks:[{id:'one',clips:[{asset:'sample'}]}]};
  const plan=planProjectReset(active,'cancel');
  assert.equal(plan.project,null);
  assert.equal(plan.serialized,null);
  assert.equal(active.tracks.length,1);
});

test('saving before project reset serializes the previous project and creates an empty one',()=>{
  const active={name:'Song',bpm:100,tracks:[{id:'track',pattern:{notes:[{midi:60}]}}]};
  const plan=planProjectReset(active,'save');
  const restored=parseProject(plan.serialized),{id,schemaVersion,...legacyProject}=restored;
  assert.deepEqual(legacyProject,active);
  assert.equal(schemaVersion,1);
  assert.equal(typeof id,'string');
  assert.equal(plan.project.tracks.length,0);
});

test('project serialization preserves effects, sidechain routing, mixer and arrangement data',()=>{
  const project={id:'song-project',schemaVersion:1,name:'Song',bpm:128,tracks:[{id:'a',volume:.7,pan:-.2,mute:true,solo:false,clips:[{id:'clip',asset:'sample',bar:2}],fx:{effects:[{id:'eq-a',type:'eq',enabled:true,params:{bands:[{frequency:120,gain:2,q:1}]}},{id:'duck-a',type:'compressor',enabled:true,params:{threshold:-18,sidechain:{enabled:true,sourceTrackId:'kick',position:'pre',ghost:true,detectorGain:3,lowCut:90}}}]},pattern:{notes:[{midi:60,beat:0}]}},{id:'kick',clips:[]}]};
  const restored=parseProject(serializeProject(project));
  assert.deepEqual(restored,project);
  assert.equal(restored.schemaVersion,project.schemaVersion);
  assert.equal(restored.id,project.id);
  assert.throws(()=>parseProject('{"tracks":[]}'),/Invalid project/);
});

test('mute and solo routing supports multiple solos and excludes muted tracks',()=>{
  const tracks=[{mute:false,solo:false},{mute:true,solo:false},{mute:false,solo:true},{mute:false,solo:true}];
  assert.deepEqual(tracks.map(track=>isTrackAudible(track,tracks)),[false,false,true,true]);
  tracks[2].solo=false;
  tracks[3].solo=false;
  assert.deepEqual(tracks.map(track=>isTrackAudible(track,tracks)),[true,false,true,true]);
});

test('track deletion removes the track and clears dependent sidechain references without deleting samples',()=>{
  const project={tracks:[{id:'a',clips:[{asset:'shared'}]},{id:'b',sampler:{asset:'shared'},fx:{effects:[{type:'compressor',params:{sidechain:{sourceTrackId:'a'}}}]}}]};
  assert.equal(deleteProjectTrack(project,0),true);
  assert.deepEqual(project.tracks,[{id:'b',sampler:{asset:'shared'},fx:{effects:[{type:'compressor',params:{sidechain:{sourceTrackId:''}}}]}}]);
  assert.equal(deleteProjectTrack(project,4),false);
});

test('discarding an active recording never yields sample chunks for import',()=>{
  const chunks=[new Blob(['temporary'])];
  assert.equal(resolveRecordingChunks(chunks,true),null);
  assert.equal(resolveRecordingChunks([],false),null);
  assert.equal(resolveRecordingChunks(chunks,false),chunks);
});

test('sample discard confirmation depends on unsaved working audio',()=>{
  assert.equal(shouldConfirmSampleDiscard({hasBuffer:true,saved:false}),true);
  assert.equal(shouldConfirmSampleDiscard({hasBuffer:true,saved:true}),false);
  assert.equal(shouldConfirmSampleDiscard({hasBuffer:false,saved:false}),false);
  assert.deepEqual(createEmptySampleSession(),{buffer:null,editor:null,filename:'My_Sample.wav',savedSampleId:null});
});
