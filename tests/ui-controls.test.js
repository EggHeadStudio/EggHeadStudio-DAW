import test from 'node:test';
import assert from 'node:assert/strict';
import {parameterValue,draggedParameter,formatParameter} from '../src/ui-controls.js';
import {arrangementActionState} from '../src/workspace-ui.js';

test('parameter values clamp and quantize without floating point drift',()=>{
  const spec={min:-60,max:24,step:.5};
  assert.equal(parameterValue(-100,spec),-60);
  assert.equal(parameterValue(30,spec),24);
  assert.equal(parameterValue(-5.6,spec),-5.5);
  assert.equal(parameterValue(.2999999999,{min:0,max:1,step:.1}),.3);
});
test('invalid numeric entry is rejected, never silently replaced',()=>{
  for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>parameterValue(value,{min:0,max:1,step:.01}),/finite/);
});
test('vertical pointer drag supports fine movement and range boundaries',()=>{
  const spec={min:-1,max:1,step:.01};
  assert.equal(draggedParameter(0,20,spec),.2);
  assert.equal(draggedParameter(0,20,spec,true),.02);
  assert.equal(draggedParameter(0,-500,spec),-1);
});
test('parameter units follow step precision',()=>{
  assert.equal(formatParameter(-6,'dB',.5),'-6.0 dB');
  assert.equal(formatParameter(.25,'',.01),'0.25');
  assert.equal(formatParameter(120,'Hz',1),'120 Hz');
});
test('audio and empty-track action contexts do not expose pattern commands',()=>{
  const track={clips:[{id:'audio'}]},clip=track.clips[0];
  assert.deepEqual(arrangementActionState(track,clip,null),{selected:true,instrument:false,pattern:false,range:false,shared:false});
  assert.equal(arrangementActionState(null,null,null).selected,false);
});
test('linked-pattern and mixed time-range contexts are independent',()=>{
  const clip={kind:'instrument',patternId:'p'},track={sampler:{},clips:[clip,{kind:'instrument',patternId:'p'}]};
  assert.deepEqual(arrangementActionState(track,clip,{startBeat:1,endBeat:4}),{selected:true,instrument:true,pattern:true,shared:true,range:true});
  assert.equal(arrangementActionState(track,null,{startBeat:1,endBeat:1}).range,false);
});
