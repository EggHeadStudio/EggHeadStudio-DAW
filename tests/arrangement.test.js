import test from 'node:test';
import assert from 'node:assert/strict';
import {ArrangementHistory,duplicateClip,moveClipTo,resizeClipBoundary,splitClipAtTime} from '../src/arrangement.js';

const fixture=()=>[{id:'audio',clips:[{id:'clip',bar:0,start:0,end:4,rate:1,gain:1}]},{id:'other',clips:[]}];
const ids=(()=>{let next=0;return()=>`copy-${++next}`})();

test('split uses timeline time, playback rate, and preserves both source ranges',()=>{
  const tracks=fixture(),right=splitClipAtTime(tracks,'audio','clip',.5,120,ids);
  assert.ok(right);
  assert.equal(tracks[0].clips[0].end,.5);
  assert.equal(right.start,.5);
  assert.equal(right.bar,.25);
  assert.equal(right.end,4);
});

test('split and duplicate preserve loop source bounds while using timeline loop duration',()=>{
  const tracks=fixture(),clip=tracks[0].clips[0];
  clip.start=1;clip.end=2;clip.bar=1;clip.loop=true;clip.duration=8;
  const right=splitClipAtTime(tracks,'audio','clip',5,120,ids);
  assert.ok(right);
  assert.equal(clip.start,1);
  assert.equal(clip.end,2);
  assert.equal(clip.duration,3);
  assert.equal(right.start,1);
  assert.equal(right.end,2);
  assert.equal(right.duration,5);
  const copy=duplicateClip(tracks,'audio',right.id,120,ids);
  assert.equal(copy.bar,5);
  assert.equal(copy.duration,5);
});

test('move and duplicate keep clip data and place the copy after source duration',()=>{
  const tracks=fixture();
  assert.equal(moveClipTo(tracks,'clip','other',2),true);
  const copy=duplicateClip(tracks,'other','clip',120,ids);
  assert.equal(copy.bar,4);
  assert.equal(copy.start,0);
  assert.equal(tracks[0].clips.length,0);
  assert.equal(tracks[1].clips.length,2);
});

test('trim boundaries constrain source time and move the left edge on the timeline',()=>{
  const clip={bar:1,start:1,end:3,rate:2};
  assert.equal(resizeClipBoundary(clip,'start',2,5,120),true);
  assert.equal(clip.start,2);
  assert.equal(clip.bar,1.25);
  assert.equal(resizeClipBoundary(clip,'end',8,5,120),true);
  assert.equal(clip.end,5);
});

test('arrangement history restores clip edits and supports redo',()=>{
  const tracks=fixture(),history=new ArrangementHistory();
  history.checkpoint(tracks);
  tracks[0].clips[0].bar=3;
  assert.equal(history.undo(tracks),true);
  assert.equal(tracks[0].clips[0].bar,0);
  assert.equal(history.redo(tracks),true);
  assert.equal(tracks[0].clips[0].bar,3);
});
