import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedPatternContext,setPatternLength} from '../src/pattern-editor.js';
import {instrumentFixture} from './instrument-fixture.js';
import {duplicateClip,splitClipAtTime} from '../src/arrangement.js';
import {renderSamplerHTML} from '../src/sampler-ui.js';
import {renderDrumRackHTML} from '../src/drum-rack-ui.js';
import {PianoNoteEditor} from '../src/piano-model.js';

test('selected editor binds the exact pattern and retains real routing identity',()=>{
  const {sampler}=instrumentFixture(),[first,second]=sampler.clips;
  const context=selectedPatternContext(sampler,second.id);
  assert.equal(context.adapter.id,sampler.id);assert.equal(context.clip,second);
  context.adapter.pattern={notes:[{id:'edited',beat:1,midi:67,durationBeats:.5,velocity:.4}]};
  context.commit();
  assert.equal(context.pattern.id,second.patternId);
  assert.equal(context.pattern.lengthBeats,4);
  assert.equal(context.pattern.notes[0].midi,67);
  assert.equal(selectedPatternContext(sampler,first.id).pattern.notes[0].midi,60);
});

test('linked editor commits propagate only through explicit pattern references',()=>{
  const {project,sampler,id}=instrumentFixture(),source=sampler.clips[0];
  const linked=duplicateClip(project.tracks,sampler.id,source.id,120,id,true);
  const independent=duplicateClip(project.tracks,sampler.id,source.id,120,id);
  const context=selectedPatternContext(sampler,linked.id);
  assert.equal(context.shared,2);context.adapter.pattern.notes[0].velocity=.2;context.commit();
  assert.equal(selectedPatternContext(sampler,source.id).pattern.notes[0].velocity,.2);
  assert.equal(selectedPatternContext(sampler,independent.id).pattern.notes[0].velocity,.8);
});

test('splitting a migrated clip removes tail escape metadata from both resulting regions',()=>{
  const {project,sampler,id}=instrumentFixture(),clip=sampler.clips[0];
  clip.legacyTail=true;
  const right=splitClipAtTime(project.tracks,sampler.id,clip.id,3,120,id);
  assert.equal(clip.legacyTail,undefined);assert.equal(right.legacyTail,undefined);
});

test('editor cursor converts Arrangement position to looped source phase',()=>{
  const {sampler}=instrumentFixture(),context=selectedPatternContext(sampler,sampler.clips[0].id);
  context.clip.offsetBeats=1;
  assert.equal(context.localBeat(2,120),1);
  assert.equal(context.localBeat(4,120),1);
  context.clip.loop=false;
  assert.equal(context.localBeat(4,120),5);
});

test('pattern length changes reject out-of-range note loss atomically',()=>{
  const {sampler}=instrumentFixture(),pattern=sampler.patterns[0];
  setPatternLength(pattern,8);pattern.notes[0].beat=7;
  assert.throws(()=>setPatternLength(pattern,4),/Move or delete/);
  assert.equal(pattern.lengthBeats,8);
  for(const length of [0,-1,65,NaN])assert.throws(()=>setPatternLength(pattern,length),RangeError);
});

test('quantizing a sustained note after shortening a pattern never produces a negative beat',()=>{
  const notes=[{id:'sustained',beat:1,midi:60,durationBeats:8,velocity:.8}],editor=new PianoNoteEditor(notes);
  editor.select(['sustained']);editor.quantize(.25,4);
  assert.equal(notes[0].beat,0);assert.equal(notes[0].durationBeats,8);
});

test('Piano Roll renders selected pattern length without changing legacy default',()=>{
  const {sampler}=instrumentFixture(),context=selectedPatternContext(sampler,sampler.clips[0].id);
  const html=renderSamplerHTML(context.adapter,new Map(),new Map(),.25);
  assert.match(html,/width:160px/);
  const legacy=renderSamplerHTML({...sampler,pattern:{notes:[]}},new Map(),new Map(),.25);
  assert.match(legacy,/width:2560px/);
});

test('Drum Sequencer draws the full selected pattern at its own step resolution',()=>{
  const {drums}=instrumentFixture(),context=selectedPatternContext(drums,drums.clips[0].id);
  context.pattern.lengthBeats=8;context.pattern.steps=32;context.pattern.notes[0].beat=7.75;
  const html=renderDrumRackHTML(context.adapter,new Map());
  assert.match(html,/8 beats/);assert.match(html,/--step-count:32/);
  assert.match(html,/drum-step step-active" data-step-pad="0" data-step="31"/);
});
