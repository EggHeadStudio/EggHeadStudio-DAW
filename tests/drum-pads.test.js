import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createProjectTrack,parseProject,serializeProject,createEmptyProject} from '../src/project-state.js';
import {addPad,createPad,normalizeDrumRack,nextFreeNote,padReferenceCount,removePad,visiblePadCount,visiblePads,MAX_DRUM_PADS} from '../src/drum-pads.js';
import {BASE_ROW_HEIGHT,PITCH_HIGH,PITCH_LOW,isBlackKey,keyboardKeys,midiAtY,pitchName,rowTop} from '../src/piano-layout.js';

const rackTrack=()=>({...createProjectTrack({name:'Kit',color:'#abcdef',type:'drumRack'},'kit',{instrumentClipModel:true}),patterns:[{id:'p1',notes:[]}]});
const legacyTrack=()=>({...createProjectTrack({name:'Kit',color:'#abcdef',type:'drumRack',assetId:'kick'},'kit'),patterns:[{id:'p1',notes:[]}]});

test('new Drum Rack starts with exactly one pad with a stable id',()=>{
  const track=rackTrack();
  assert.equal(track.drumRack.pads.length,1);
  assert.equal(visiblePads(track).length,1);
  assert.ok(track.drumRack.pads[0].id);
});

test('added pads get unique ids and never reuse a note number used by a pattern',()=>{
  const track=rackTrack();
  track.patterns[0].notes.push({id:'n',beat:0,midi:37,durationBeats:.25,velocity:1});
  const pad=addPad(track);
  assert.notEqual(pad.note,37);
  assert.equal(new Set(track.drumRack.pads.map(p=>p.id)).size,track.drumRack.pads.length);
  assert.equal(nextFreeNote(track),Math.min(...[38,39,40].filter(n=>![36,pad.note].includes(n))));
});

test('pad count is capped',()=>{
  const track=rackTrack();
  while(visiblePadCount(track)<MAX_DRUM_PADS)addPad(track);
  assert.throws(()=>addPad(track),/at most/);
});

test('removing a referenced pad requires a choice; keep preserves notes, delete removes them',()=>{
  const keep=rackTrack(),pad=addPad(keep);
  keep.patterns[0].notes.push({id:'a',beat:0,midi:pad.note,durationBeats:.25,velocity:1});
  assert.equal(padReferenceCount(keep,pad),1);
  assert.throws(()=>removePad(keep,pad.id),e=>e.code==='PAD_IN_USE'&&e.references===1);
  const result=removePad(keep,pad.id,{notes:'keep'});
  assert.equal(result.orphaned,1);assert.equal(keep.patterns[0].notes.length,1);

  const del=rackTrack(),other=addPad(del);
  del.patterns[0].notes.push({id:'a',beat:0,midi:other.note,durationBeats:.25,velocity:1},{id:'b',beat:1,midi:36,durationBeats:.25,velocity:1});
  assert.equal(removePad(del,other.id,{notes:'delete'}).deleted,1);
  assert.deepEqual(del.patterns[0].notes.map(n=>n.id),['b']);
});

test('the last visible pad cannot be removed',()=>{
  const track=rackTrack();
  assert.throws(()=>removePad(track,track.drumRack.pads[0].id),/at least one pad/);
});

test('legacy 16-pad racks load non-destructively and hide only trailing untouched pads',()=>{
  const track=legacyTrack();
  assert.equal(track.drumRack.pads.length,16);
  track.patterns[0].notes.push({id:'n',beat:0,midi:36+5,durationBeats:.25,velocity:1});
  for(const pad of track.drumRack.pads){delete pad.id;pad.asset=null}
  track.drumRack.pads[2].asset='snare';
  normalizeDrumRack(track);
  assert.equal(track.drumRack.pads.length,16);
  assert.equal(visiblePadCount(track),6);
  assert.ok(track.drumRack.pads.every(p=>typeof p.id==='string'&&p.id));
  assert.equal(track.drumRack.pads[2].asset,'snare');
  // hidden legacy pads are revealed before new ones are created
  const revealed=addPad(track);
  assert.equal(revealed,track.drumRack.pads[6]);assert.equal(track.drumRack.pads.length,16);
});

test('pad ids and visibility survive JSON serialization',()=>{
  const project=createEmptyProject();
  const track=rackTrack();addPad(track);
  project.tracks=[track];
  const restored=parseProject(serializeProject(project)).tracks[0];
  assert.deepEqual(restored.drumRack.pads.map(p=>p.id),track.drumRack.pads.map(p=>p.id));
  assert.equal(restored.drumRack.pads.length,2);
});

test('createPad produces independent ids',()=>{
  assert.notEqual(createPad().id,createPad().id);
});

test('Piano Roll pitch mapping places C4 on its row with C#4 directly above and is zoom independent',()=>{
  for(const h of [BASE_ROW_HEIGHT*.7,BASE_ROW_HEIGHT,BASE_ROW_HEIGHT*1.6]){
    assert.ok(Math.abs(rowTop(60,h)-rowTop(61,h)-h)<1e-9);
    assert.ok(rowTop(62,h)<rowTop(61,h));
    for(let midi=PITCH_LOW;midi<=PITCH_HIGH;midi++)assert.equal(midiAtY(rowTop(midi,h)+h/2,h),midi);
  }
  assert.equal(pitchName(60),'C4');assert.equal(pitchName(61),'C#4');
  assert.ok(isBlackKey(61)&&!isBlackKey(60));
  const keys=keyboardKeys();
  assert.equal(keys[0].midi,PITCH_HIGH);assert.equal(keys.at(-1).midi,PITCH_LOW);
  assert.ok(keys.findIndex(k=>k.midi===61)+1===keys.findIndex(k=>k.midi===60));
});

test('track header no longer renders a redundant Instrument button or Drum Rack Open Piano Roll',()=>{
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/data-open-instrument/);
  assert.doesNotMatch(readFileSync(new URL('../src/drum-rack-ui.js',import.meta.url),'utf8'),/rackPiano|Open Piano Roll/);
});
