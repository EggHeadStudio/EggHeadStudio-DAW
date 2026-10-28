import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedPanelHeight,boundedTrackHeight,COMPACT_TRACK_HEIGHT,EXPANDED_TRACK_HEIGHT,trackHeight} from '../src/workspace-layout.js';

test('Arrangement defaults to 84-pixel tracks without adding project fields',()=>{
  const project={tracks:[{id:'one'},{id:'two'}]},before=structuredClone(project),state={};
  assert.equal(trackHeight(state,'one'),84);assert.deepEqual(project,before);
});

test('expanded track height follows stable track identity across ordering and insertion',()=>{
  const state={trackHeights:{one:EXPANDED_TRACK_HEIGHT,two:320}};
  assert.deepEqual(['two','new','one'].map(id=>trackHeight(state,id)),[320,COMPACT_TRACK_HEIGHT,240]);
});

test('track resizing is finite, rounded and bounded independently of compact mode',()=>{
  assert.equal(boundedTrackHeight(260.8),261);assert.equal(boundedTrackHeight(1),220);
  assert.equal(boundedTrackHeight(1000),400);
  for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>boundedTrackHeight(value),RangeError);
});

test('Device Panel resizing enforces practical bounds without a project migration',()=>{
  assert.equal(boundedPanelHeight(10),160);assert.equal(boundedPanelHeight(800),600);
  assert.equal(boundedPanelHeight(321.2),321);assert.throws(()=>boundedPanelHeight(NaN),RangeError);
});
