import test from 'node:test';
import assert from 'node:assert/strict';
import {SampleEditor} from '../src/sample-editor.js';

function fixture(values,sampleRate=100){
  const data=Float32Array.from(values);
  const channel={length:data.length,getChannelData:()=>data};
  return {length:data.length,sampleRate,duration:data.length/sampleRate,numberOfChannels:1,getChannelData:()=>data,createBuffer:undefined};
}

function context(){
  return {createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {length,sampleRate,numberOfChannels:channels,getChannelData:index=>data[index]}}};
}

test('sample editor crop, split, delete, and undo preserve source audio',()=>{
  const source=fixture([0,.1,.2,.3,.4,.5,.6,.7,.8,.9]);
  const editor=new SampleEditor(source);
  editor.setSelection(2,8);
  assert.equal(editor.cropSelection(),true);
  assert.equal(editor.frameCount,6);
  assert.ok(Math.abs(editor.render(context()).getChannelData(0)[0]-.2)<1e-6);
  assert.equal(editor.splitAt(3),true);
  assert.equal(editor.regions.length,2);
  editor.setSelection(1,3);
  editor.deleteSelection();
  assert.equal(editor.frameCount,4);
  editor.undo();
  assert.equal(editor.frameCount,6);
  assert.equal(source.length,10);
});

test('sample editor reverse, gain, fades, and normalization affect rendered PCM',()=>{
  const editor=new SampleEditor(fixture([0,.25,.5,.25]));
  editor.reverse();
  editor.setGainDb(-6);
  editor.setFades(.01,.01);
  const output=editor.render(context()).getChannelData(0);
  assert.equal(output[0],0);
  assert.ok(output[2]>.12&&output[2]<.13);
  assert.equal(output[3],0);
  assert.equal(editor.normalize(-3),true);
  assert.ok(Math.abs(editor.gainDb-3.0206)<.01);
});

test('sample editor removes edge silence and snaps selections near zero crossings',()=>{
  const editor=new SampleEditor(fixture([0,0,-.5,.5,.6,-.6,0,0]));
  assert.equal(editor.trimSilence(-40),true);
  assert.equal(editor.frameCount,4);
  assert.equal(editor.nearestZeroCrossing(2,2),1);
});

test('sample editor rejects invalid normalization targets and supports redo',()=>{
  const editor=new SampleEditor(fixture([0,.5,-.5]));
  assert.throws(()=>editor.normalize(1),RangeError);
  editor.setGainDb(-3);
  editor.undo();
  assert.equal(editor.gainDb,0);
  editor.redo();
  assert.equal(editor.gainDb,-3);
});

test('sample fades are restored by a single undo and redo',()=>{
  const editor=new SampleEditor(fixture(Array(100).fill(.5)));
  editor.setFades(.1,.2);
  assert.equal(editor.undoStack.length,1);
  assert.equal(editor.undo(),true);
  assert.equal(editor.fadeInFrames,0);
  assert.equal(editor.fadeOutFrames,0);
  assert.equal(editor.redo(),true);
  assert.equal(editor.fadeInFrames,10);
  assert.equal(editor.fadeOutFrames,20);
});

test('sample editor normalizes a quiet signal to the requested peak',()=>{
  const editor=new SampleEditor(fixture([.0001,-.00005]));
  assert.equal(editor.normalize(-3),true);
  const peak=Math.max(...editor.render(context()).getChannelData(0).map(Math.abs));
  assert.ok(Math.abs(20*Math.log10(peak)-(-3))<.01);
});
