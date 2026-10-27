import test from 'node:test';
import assert from 'node:assert/strict';
import {pitchShiftBuffer,renderSampleProcessing,resampleBuffer,timeStretchBuffer} from '../src/sample-dsp.js';
import {TimelineScale,timelineBeatsAtClientX,timelineContentOrigin,timelinePixelsAtClientX} from '../src/timeline.js';
import {clampFrame,frameToX,getWaveformPeaks,xToFrame} from '../src/waveform.js';

function fixture(data,sampleRate=22050){
  const channel=Float32Array.from(data);
  return {length:channel.length,sampleRate,duration:channel.length/sampleRate,numberOfChannels:1,getChannelData:()=>channel};
}

function context(){
  return {createBuffer(channels,length,sampleRate){
    const data=Array.from({length:channels},()=>new Float32Array(length));
    return {length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:index=>data[index]};
  }};
}

function zeroCrossingFrequency(buffer){
  const data=buffer.getChannelData(0);
  let crossings=0;
  for(let frame=1;frame<data.length;frame++)if(data[frame-1]<=0&&data[frame]>0)crossings++;
  return crossings/buffer.duration;
}

test('sample resampling changes duration and pitch according to speed',()=>{
  const rate=22050,input=fixture(Array.from({length:rate},(_,frame)=>Math.sin(2*Math.PI*440*frame/rate)),rate);
  const output=resampleBuffer(context(),input,2);
  assert.equal(output.length,rate/2);
  assert.equal(output.duration,.5);
  assert.ok(Math.abs(zeroCrossingFrequency(output)-880)<3);
});

test('time stretching changes duration while pitch shift preserves duration',()=>{
  const rate=22050,input=fixture(Array.from({length:rate},(_,frame)=>Math.sin(2*Math.PI*440*frame/rate)),rate);
  const stretched=timeStretchBuffer(context(),input,1.5);
  const pitched=pitchShiftBuffer(context(),input,12);
  assert.equal(stretched.length,rate*1.5);
  assert.ok(Math.abs(zeroCrossingFrequency(stretched)-440)<3);
  assert.equal(pitched.length,rate);
  assert.ok(Math.abs(zeroCrossingFrequency(pitched)-880)<8);
  assert.ok([...pitched.getChannelData(0)].every(Number.isFinite));
});

test('render sample processing validates pitch mode and processes repitch speed',()=>{
  const rate=1000,input=fixture(Array.from({length:rate},(_,frame)=>Math.sin(2*Math.PI*50*frame/rate)),rate);
  const output=renderSampleProcessing(context(),input,{speed:2,mode:'repitch'});
  assert.equal(output.length,rate/2);
  assert.throws(()=>renderSampleProcessing(context(),input,{mode:'invalid'}),RangeError);
});

test('timeline conversions round trip across tempo and zoom scales',()=>{
  const scale=new TimelineScale(97,48.5);
  const seconds=12.345;
  assert.ok(Math.abs(scale.pixelsToTime(scale.timeToPixels(seconds))-seconds)<1e-10);
  assert.equal(scale.barsToPixels(2),388);
  assert.equal(scale.pixelsToBars(388),2);
  assert.throws(()=>new TimelineScale(0,20),RangeError);
});

test('timeline coordinates are relative to the visible ruler and recover content origin',()=>{
  const ruler={getBoundingClientRect:()=>({left:145})};
  const container={scrollLeft:240,getBoundingClientRect:()=>({left:20})};
  assert.equal(timelinePixelsAtClientX(300,ruler,container),155);
  assert.equal(timelineContentOrigin(ruler,container),365);
});

test('timeline seeking converts visible ruler coordinates to beats and seconds once',()=>{
  for(const [bpm,pixelsPerBeat,headerWidth,scrollLeft] of [[120,39,115,0],[100,48.75,165,120]]){
    const container={scrollLeft,getBoundingClientRect:()=>({left:0})};
    const ruler={getBoundingClientRect:()=>({left:headerWidth-scrollLeft})};
    const scale=new TimelineScale(bpm,pixelsPerBeat);
    const clientX=ruler.getBoundingClientRect().left+pixelsPerBeat*4;
    const beats=timelineBeatsAtClientX(clientX,ruler,container,scale);
    assert.ok(Math.abs(beats-4)<1e-10);
    assert.ok(Math.abs(beats*60/bpm-240/bpm)<1e-10);
  }
});

test('timeline origin follows mobile and desktop track headers through horizontal scrolling',()=>{
  for(const headerWidth of [115,165])for(const scrollLeft of [0,240]){
    const container={scrollLeft,getBoundingClientRect:()=>({left:20})};
    const ruler={getBoundingClientRect:()=>({left:20+headerWidth-scrollLeft})};
    assert.equal(timelineContentOrigin(ruler,container),headerWidth);
  }
});

test('waveform frame conversions clamp and cache per-channel peaks',()=>{
  const audio=fixture([-1,.5,.75,-.25]);
  assert.equal(frameToX(2,4,100),50);
  assert.equal(xToFrame(150,4,100),4);
  assert.equal(clampFrame(-2,4),0);
  assert.equal(clampFrame(6,4),4);
  const first=getWaveformPeaks(audio);
  assert.equal(first,getWaveformPeaks(audio));
  assert.equal(first.channels[0].minimum[0],-1);
  assert.equal(first.channels[0].maximum[0],.75);
});
