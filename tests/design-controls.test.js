import test from 'node:test';
import assert from 'node:assert/strict';
import {parameterValue,parameterToUnit,parameterFromUnit,draggedParameter,formatParameter} from '../src/ui-controls.js';
import {effectParameterOptions} from '../src/device-ui.js';

test('log frequency mapping reaches exact endpoints and geometric midpoint',()=>{
  const spec={min:20,max:20000,step:1,scale:'log'};
  assert.equal(parameterFromUnit(0,spec),20);
  assert.equal(parameterFromUnit(1,spec),20000);
  assert.equal(parameterFromUnit(.5,spec),632);
  assert.ok(Math.abs(parameterToUnit(2000,spec)-2/3)<1e-12);
});
test('mapping round trips linear, decibel, ratio and time parameter ranges',()=>{
  for(const spec of [{min:-60,max:24,step:.5},{min:0,max:1,step:.01},{min:1,max:20,step:.5},{min:.001,max:1,step:.001,scale:'log'}]){
    for(let i=0;i<=100;i++){
      const value=parameterFromUnit(i/100,spec);
      assert.equal(parameterFromUnit(parameterToUnit(value,spec),spec),value);
    }
  }
});
test('mapped pointer fine adjustment uses ten times finer normalized movement',()=>{
  const spec={min:20,max:20000,step:1,scale:'log'};
  assert.equal(draggedParameter(200,20,spec),399);
  assert.equal(draggedParameter(200,20,spec,true),214);
  assert.equal(draggedParameter(200,10000,spec),20000);
});
test('nonfinite positions and invalid logarithmic bounds fail explicitly',()=>{
  assert.throws(()=>parameterFromUnit(NaN,{min:0,max:1,step:.1}),/finite/);
  assert.throws(()=>parameterToUnit(1,{min:0,max:100,scale:'log'}),/positive/);
  assert.throws(()=>parameterFromUnit(.5,{min:-1,max:1,step:.1,scale:'log'}),/positive/);
  assert.equal(parameterValue(100,{min:0,max:.85,step:.01}),.85);
});
test('percentage, ratio and bipolar pan formatting does not alter stored values',()=>{
  assert.equal(formatParameter(.25,'',.01,'percent'),'25%');
  assert.equal(formatParameter(4,'',.5,'ratio'),'4:1');
  assert.equal(formatParameter(0,'',.01,'pan'),'C');
  assert.equal(formatParameter(-.25,'',.01,'pan'),'25% L');
  assert.equal(formatParameter(.5,'',.01,'pan'),'50% R');
});
const fakeInput=(key,value,min,scale=1)=>({dataset:{param:key,scale:String(scale)},value:String(value),min:String(min),closest:()=>({firstChild:{textContent:key}})});
test('device reset defaults use shared DSP definitions and millisecond UI scale',()=>{
  const options=effectParameterOptions({type:'delay'},fakeInput('time',100,.01,1000));
  assert.equal(options.reset,250);
  assert.equal(options.scale,'log');
  assert.equal(options.unit,'ms');
  assert.equal(effectParameterOptions({type:'utility'},fakeInput('width',1,0)).reset,1);
});
test('effect mappings choose applicable control semantics without extra DSP parameters',()=>{
  assert.equal(effectParameterOptions({type:'compressor'},fakeInput('attack',.003,.001)).scale,'log');
  assert.equal(effectParameterOptions({type:'compressor'},fakeInput('ratio',4,1)).format,'ratio');
  assert.equal(effectParameterOptions({type:'reverb'},fakeInput('mix',.2,0)).format,'percent');
  assert.equal(effectParameterOptions({type:'utility'},fakeInput('gain',0,-60)).scale,'linear');
});
