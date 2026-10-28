import test from 'node:test';
import assert from 'node:assert/strict';
import {SamplePreview} from '../src/sample-preview.js';
import {SampleEditor} from '../src/sample-editor.js';
import {createTrackEffect,sampleEffectTailSeconds} from '../src/audio.js';
import {isTransportSpace,mountTransportShortcuts} from '../src/transport-shortcuts.js';

function context(){
  const param=()=>({value:0,setTargetAtTime(value){this.value=value}});
  const node=()=>({connect(target){return target},disconnect(){this.disconnected=true},gain:param(),pan:param(),frequency:param(),Q:param(),delayTime:param(),feedback:param()});
  const ctx={sampleRate:48000,currentTime:0,destination:node(),createGain:node,createBiquadFilter:node,createStereoPanner:node,createDelay:node,createChannelSplitter:node,createAnalyser:()=>({...node(),fftSize:32})};
  ctx.createBufferSource=()=>({...node(),playbackRate:param(),start(when,offset){this.offset=offset},stop(){this.stopped=true}});
  ctx.createBuffer=(channels,length,rate)=>{const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate:rate,numberOfChannels:channels,duration:length/rate,getChannelData:channel=>data[channel]}};
  return ctx;
}
test('live sample parameter edits preserve source and graph; gain is smoothed',()=>{
  const ctx=context(),preview=new SamplePreview(ctx),effect=createTrackEffect('eq','eq');
  preview.play({duration:3},{effects:[effect],loop:true});const source=preview.source,graph=preview.graph;
  effect.params.bands[1].gain=6;preview.update([effect],-6);
  assert.equal(preview.source,source);assert.equal(preview.graph,graph);assert.equal(graph.instances.get('eq').nodes[1].gain.value,6);
  assert.ok(Math.abs(preview.level.gain.value-10**(-6/20))<1e-12);preview.stop();assert.equal(source.stopped,true);
});
test('live sample topology changes retain transport and retire old graph',()=>{
  const ctx=context(),preview=new SamplePreview(ctx),eq=createTrackEffect('eq','eq'),delay=createTrackEffect('delay','delay');
  preview.play({duration:3},{effects:[eq,delay],loop:true});const source=preview.source,first=preview.graph;
  preview.update([delay,eq],0);assert.equal(preview.source,source);assert.notEqual(preview.graph,first);assert.equal(first.input.disconnected,true);
  eq.enabled=false;preview.update([delay,eq],0);assert.equal(preview.source,source);
  assert.equal(preview.graph.eqTaps.get('eq').pre,preview.graph.eqTaps.get('eq').post);preview.stop();
});
test('sample pause/resume preserves loop phase and stop resets/disposes resources',()=>{
  const ctx=context(),preview=new SamplePreview(ctx);
  preview.play({duration:3},{loop:true});ctx.currentTime=4.25;preview.pause();assert.equal(preview.position,1.25);assert.equal(preview.graph,null);
  preview.resume();assert.equal(preview.source.offset,1.25);ctx.currentTime=4.5;assert.equal(preview.position,1.5);
  preview.stop();preview.stop();assert.equal(preview.position,0);assert.equal(preview.source,null);
});
test('original A/B and all-bypassed preview are raw paths without a hidden legacy filter',()=>{
  const ctx=context(),preview=new SamplePreview(ctx),eq=createTrackEffect('eq','eq');
  preview.play({duration:3},{effects:[eq],gainDb:12,original:true});
  assert.equal(preview.graph.instances.size,0);assert.equal(preview.level.gain.value,1);
  preview.stop();eq.enabled=false;preview.play({duration:3},{effects:[eq]});
  assert.equal(preview.graph.instances.size,0);assert.equal(preview.graph.eqTaps.size,1);preview.stop();
});
test('dry preview preparation omits only gain while normal Save renders it once',()=>{
  const ctx=context(),buffer=ctx.createBuffer(1,8,48000);buffer.getChannelData(0).fill(.1);
  const editor=new SampleEditor(buffer);editor.setGainDb(6);
  const dry=editor.renderSelection(ctx,{applyGain:false}),saved=editor.renderSelection(ctx);
  assert.ok(Math.abs(dry.getChannelData(0)[0]-.1)<1e-8);
  assert.ok(Math.abs(saved.getChannelData(0)[0]-.1*10**(6/20))<1e-8);
  assert.equal(buffer.getChannelData(0)[0],dry.getChannelData(0)[0]);
});
test('sample effect tails respect enabled devices and original defaults',()=>{
  assert.equal(sampleEffectTailSeconds([],120),0);
  const reverb=createTrackEffect('reverb','r');assert.equal(sampleEffectTailSeconds([reverb]),2.25);
  reverb.enabled=false;assert.equal(sampleEffectTailSeconds([reverb]),0);
});
test('Space routing excludes modifiers, repeat and focused native/editable controls',()=>{
  const space={code:'Space',target:{closest:()=>false}};
  assert.equal(isTransportSpace(space),true);
  for(const key of ['defaultPrevented','repeat','ctrlKey','metaKey','altKey'])assert.equal(isTransportSpace({...space,[key]:true}),false);
  assert.equal(isTransportSpace({...space,target:{closest:()=>true}}),false);
  assert.equal(isTransportSpace({...space,code:'Enter'}),false);
});
test('central transport serializes starts, protects recording and disposes its handler',async()=>{
  const target=new EventTarget();let starts=0,blocked=false,warnings=0,finish;
  const dispose=mountTransportShortcuts(target,{toggle:()=>{starts++;return new Promise(resolve=>finish=resolve)},blocked:()=>blocked,onBlocked:()=>warnings++,onError:error=>{throw error}});
  const key=()=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'code',{value:'Space'});target.dispatchEvent(event);return event};
  assert.equal(key().defaultPrevented,true);key();assert.equal(starts,1);finish();await Promise.resolve();
  blocked=true;key();assert.equal(warnings,1);assert.equal(starts,1);
  dispose();assert.equal(key().defaultPrevented,false);
});
test('transport reports failures and permits the next start',async()=>{
  const target=new EventTarget(),failure=new Error('Audio unavailable'),errors=[];let calls=0;
  const dispose=mountTransportShortcuts(target,{toggle:async()=>{calls++;if(calls===1)throw failure},blocked:()=>false,onBlocked:()=>{},onError:error=>errors.push(error)});
  const press=()=>{const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:' '});target.dispatchEvent(event)};
  press();await Promise.resolve();assert.deepEqual(errors,[failure]);
  press();await Promise.resolve();assert.equal(calls,2);dispose();
});
test('sample preview startup failure releases source and graph before surfacing error',()=>{
  const ctx=context(),create=ctx.createBufferSource,failure=new Error('Source failed');
  ctx.createBufferSource=()=>({...create(),start(){throw failure}});
  const preview=new SamplePreview(ctx);
  assert.throws(()=>preview.play({duration:3}),error=>error===failure);
  assert.equal(preview.source,null);assert.equal(preview.graph,null);assert.equal(preview.state,'stopped');
});
test('natural preview completion preserves effect tails and bypass re-evaluates their clock deadline',()=>{
  const ctx=context(),delay=createTrackEffect('delay','delay');let completed=0;
  const preview=new SamplePreview(ctx,{onEnded:()=>completed++});preview.play({duration:2},{effects:[delay]});
  ctx.currentTime=2;preview.source.onended();assert.equal(preview.state,'playing');assert.equal(completed,0);
  delay.enabled=false;preview.update([delay],0);assert.equal(preview.state,'stopped');assert.equal(preview.graph,null);assert.equal(completed,1);
});
test('tempo-synced sample delay follows BPM updates without replacing source or graph',()=>{
  const ctx=context(),delay=createTrackEffect('delay','delay');delay.params.sync=true;
  const preview=new SamplePreview(ctx,{bpm:120});preview.play({duration:3},{effects:[delay],loop:true});
  const graph=preview.graph,source=preview.source;assert.equal(graph.instances.get('delay').delay.delayTime.value,.5);
  preview.bpm=90;preview.update([delay],0);
  assert.equal(preview.source,source);assert.equal(preview.graph,graph);assert.equal(graph.instances.get('delay').delay.delayTime.value,2/3);preview.stop();
});
