import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PianoNoteEditor} from '../src/piano-model.js';
import {VELOCITY_LANE_HEIGHT,applyVelocityDrag,clampVelocity,velocityAtY,velocityBarHeight,KEY_WIDTH} from '../src/piano-layout.js';
import {instrumentVoice,instrumentEvents} from '../src/instrument-playback.js';
import {createProjectTrack,createEmptyProject,parseProject,serializeProject} from '../src/project-state.js';
import {createInstrumentClip} from '../src/instrument-clips.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';

const buffers=new Map([['tone',{duration:1}]]);
const sampler=notes=>({sampler:{asset:'tone',rootNote:60,mode:'oneShot'},pattern:{notes,lengthBeats:16}});

test('velocity lane geometry: top is 1, bottom is 0, clamped, bars never vanish',()=>{
  assert.equal(velocityAtY(0),1);assert.equal(velocityAtY(VELOCITY_LANE_HEIGHT),0);
  assert.equal(velocityAtY(-50),1);assert.equal(velocityAtY(999),0);
  assert.equal(velocityBarHeight(0),2);assert.equal(velocityBarHeight(1),VELOCITY_LANE_HEIGHT);
  assert.equal(clampVelocity(NaN),.85);
});

test('single-note drag changes only that note when it is not selected',()=>{
  const notes=[{id:'a',velocity:.5},{id:'b',velocity:.5}];
  const initial={a:.5,b:.5};
  applyVelocityDrag(notes,new Set(['b']),'a',initial,.9);
  assert.deepEqual(notes.map(n=>n.velocity),[.9,.5]);
});

test('multi-note drag applies the same delta and preserves relative dynamics with per-note clamping',()=>{
  const notes=[{id:'a',velocity:.4},{id:'b',velocity:.8},{id:'c',velocity:.1}];
  const initial={a:.4,b:.8,c:.1};
  applyVelocityDrag(notes,new Set(['a','b']),'a',initial,.6);// +.2
  assert.ok(Math.abs(notes[0].velocity-.6)<1e-9);
  assert.equal(notes[1].velocity,1);
  assert.equal(notes[2].velocity,.1);
  applyVelocityDrag(notes,new Set(['a','b']),'a',initial,0);// -.4 from initial
  assert.equal(notes[0].velocity,0);assert.ok(Math.abs(notes[1].velocity-.4)<1e-9);
});

test('velocity gesture is a single undo step and redo restores it',()=>{
  const editor=new PianoNoteEditor([{id:'a',beat:0,midi:60,durationBeats:1,velocity:.5},{id:'b',beat:1,midi:62,durationBeats:1,velocity:.7}]);
  editor.select(['a','b']);
  const initial={a:.5,b:.7};
  editor.checkpoint();
  applyVelocityDrag(editor.notes,editor.selected,'a',initial,.6);
  applyVelocityDrag(editor.notes,editor.selected,'a',initial,.7);
  assert.ok(editor.undo());
  assert.deepEqual(editor.notes.map(n=>n.velocity),[.5,.7]);
  assert.ok(editor.redo());
  assert.ok(Math.abs(editor.notes[0].velocity-.7)<1e-9);
});

test('edited velocity changes actual Sampler playback level',()=>{
  const note={id:'n',beat:0,midi:60,durationBeats:1,velocity:.85};
  const track=sampler([note]);
  const before=instrumentVoice(track,note,buffers,120).level;
  applyVelocityDrag([note],new Set(),'n',{n:.85},.25);
  const after=instrumentVoice(track,note,buffers,120).level;
  assert.equal(before,.85);assert.equal(after,.25);
  const events=[...instrumentEvents(track,buffers,120,16)];
  assert.equal(events[0].voice.level,.25);
});

test('velocities persist through JSON and portable .ehs round trips',async()=>{
  const track=createProjectTrack({name:'Lead',color:'#aabbcc',type:'sampler'},'lead',{instrumentClipModel:true});
  let id=0;createInstrumentClip(track,0,()=>String(++id),{lengthBeats:16});
  track.patterns[0].notes.push({id:'n1',beat:0,midi:60,durationBeats:1,velocity:.31},{id:'n2',beat:2,midi:64,durationBeats:1,velocity:.97});
  const project={...createEmptyProject(),tracks:[track]};
  const json=parseProject(serializeProject(project)).tracks[0];
  assert.deepEqual(json.patterns[0].notes.map(n=>n.velocity),[.31,.97]);
  const restored=await openPortableProjectArchive(await createPortableProjectArchive(project));
  assert.deepEqual(restored.project.tracks[0].patterns[0].notes.map(n=>n.velocity),[.31,.97]);
});
test('velocity lane markup shares the Piano Roll key offset and has no separate velocity model',()=>{
  const ui=readFileSync(new URL('../src/sampler-ui.js',import.meta.url),'utf8');
  assert.match(ui,/KEY_WIDTH\+note\.beat\*beatWidth/);
  assert.match(ui,/id="velocityPanel"/);
  assert.equal(KEY_WIDTH,56);
});
