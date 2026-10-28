import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyProject,createProjectTrack,normalizeProjectSchema,parseProject,serializeProject} from '../src/project-state.js';
import {createInstrumentClip,migrateInstrumentArrangement,resizeInstrumentClip} from '../src/instrument-clips.js';
import {assignPadSource,assignSamplerSource,resetPad} from '../src/instrument-source.js';
import {addPad} from '../src/drum-pads.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';

const make=type=>createProjectTrack({name:type,color:'#aabbcc',type},type,{instrumentClipModel:true});
test('new instrument tracks need no samples or clips and do not migrate into full-song patterns',()=>{
  for(const type of ['sampler','drumRack']){
    const track=make(type),project={...createEmptyProject(),tracks:[track]};
    migrateInstrumentArrangement(project);normalizeProjectSchema(project);
    assert.deepEqual(track.clips,[]);assert.deepEqual(track.patterns,[]);
    if(track.sampler)assert.equal(track.sampler.asset,null);
    else assert.ok(track.drumRack.pads.every(pad=>pad.asset===null));
    assert.deepEqual(parseProject(serializeProject(project)).tracks,[track]);
  }
});
test('new rack source initializes only first pad and assignments never replace other pads',()=>{
  const rack=createProjectTrack({name:'Kit',color:'#abcdef',type:'drumRack',assetId:'kick'},'rack',{instrumentClipModel:true}).drumRack;
  assert.equal(rack.pads.length,1);assert.equal(rack.pads[0].asset,'kick');
  addPad({drumRack:rack,patterns:[]});assert.equal(rack.pads.length,2);assert.equal(rack.pads[1].asset,null);
  assignPadSource(rack.pads[1],{id:'snare',name:'Snare.wav'});
  assert.equal(rack.pads[1].name,'Snare');assert.equal(rack.pads[0].asset,'kick');
  assignPadSource(rack.pads[1],{id:'hat',name:'Hat.mp3'});assert.equal(rack.pads[1].asset,'hat');
  Object.assign(rack.pads[1],{volume:.2,pitch:12,pan:1,mute:true});resetPad(rack.pads[1]);
  assert.deepEqual([rack.pads[1].volume,rack.pads[1].pitch,rack.pads[1].pan,rack.pads[1].mute],[1,0,0,false]);
  assert.equal(rack.pads[1].asset,'hat');assignPadSource(rack.pads[1],null);
  assert.equal(rack.pads[1].asset,null);assert.equal(rack.pads[0].asset,'kick');
});
test('sampler clear is explicit and unavailable source assignment is atomic',()=>{
  const sampler=make('sampler').sampler;
  assert.throws(()=>assignSamplerSource(sampler,'missing'),/not loaded/);assert.equal(sampler.asset,null);
  Object.assign(sampler,{asset:'old',detected:'C4',confidence:1,start:.1,end:1});
  assignSamplerSource(sampler,null);assert.equal(sampler.asset,null);assert.equal(sampler.end,0);assert.equal(sampler.detected,null);
});
test('four-bar independent pattern boundaries retain notes and phase when trimmed',()=>{
  const track=make('sampler');let id=0;
  const clip=createInstrumentClip(track,8,()=>String(++id),{lengthBeats:16});
  track.patterns[0].notes.push({id:'note',beat:12,midi:60,durationBeats:4,velocity:.8});
  resizeInstrumentClip(clip,'start',12,track.patterns[0]);
  assert.equal(clip.bar,3);assert.equal(clip.offsetBeats,4);assert.equal(clip.durationBeats,12);
  resizeInstrumentClip(clip,'end',16,track.patterns[0]);assert.equal(track.patterns[0].notes[0].beat,12);
});
test('deleting the last typed clip safely returns autosave to schema one',()=>{
  const track=make('sampler'),project={...createEmptyProject(),tracks:[track]};
  let id=0;createInstrumentClip(track,0,()=>String(++id));normalizeProjectSchema(project);
  assert.equal(project.schemaVersion,2);track.clips=[];normalizeProjectSchema(project);
  assert.equal(project.schemaVersion,1);assert.equal(parseProject(serializeProject(project)).schemaVersion,1);
});
test('empty instruments survive portable archives with no invented audio references',async()=>{
  const project={...createEmptyProject(),tracks:[make('sampler'),make('drumRack')]};
  const archive=await createPortableProjectArchive(project);
  const restored=await openPortableProjectArchive(archive);
  assert.deepEqual(restored.project.tracks,project.tracks);
});
