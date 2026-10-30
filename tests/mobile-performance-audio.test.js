import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../src/audio.js';

function parameter(value=0){
 return{
  value,
  events:[],
  setValueAtTime(next,time){this.value=next;this.events.push(['set',next,time])},
  linearRampToValueAtTime(next,time){this.value=next;this.events.push(['ramp',next,time])},
  cancelScheduledValues(time){this.events.push(['cancel',time])}
 };
}

function makeEngine(){
 const sources=[];
 const context={
  currentTime:1,
  createBufferSource(){
   const source={
    connections:[],starts:[],stops:[],
    playbackRate:parameter(1),
    connect(node){this.connections.push(node);return node},
    start(...args){this.starts.push(args)},
    stop(time){this.stops.push(time)},
    disconnect(){}
   };
   sources.push(source);return source;
  },
  createGain(){return{gain:parameter(1),connections:[],connect(node){this.connections.push(node);return node},disconnect(){}}},
  createStereoPanner(){return{pan:parameter(0),connections:[],connect(node){this.connections.push(node);return node},disconnect(){}}}
 };
 const engine=new AudioEngine();
 engine.ctx=context;
 engine.init=async()=>context;
 engine.syncTracks=()=>{};
 return{engine,context,sources};
}

test('Sampler performance routes the pitched voice through the live track and releases gated notes',async()=>{
 const {engine,context,sources}=makeEngine(),input={connections:[],connect(node){this.connections.push(node);return node}};
 const track={id:'sampler',sampler:{asset:'sample',start:.1,end:.8,mode:'loop',rootNote:60,transpose:2,fineTune:-25,attack:.01,decay:.08,sustain:.7,release:.2}};
 engine.trackNodes.set(track.id,{input});
 const sample={duration:1},voice=await engine.startPreviewNote(track,new Map([['sample',sample]]),72,.5,[track]);
 const source=sources[0],gain=source.connections[0],pan=gain.connections[0];
 assert.equal(source.buffer,sample);
 assert.ok(Math.abs(source.playbackRate.value-2**((12+2-.25)/12))<1e-10);
 assert.equal(source.loop,true);
 assert.deepEqual(source.starts,[[1,.1]]);
 assert.equal(pan.connections[0],input);
 context.currentTime=1.1;
 voice.release();
 assert.deepEqual(source.stops,[1.3]);
 assert.ok(gain.gain.events.some(([type,value])=>type==='ramp'&&value===0));
 source.onended();
 assert.equal(engine.sources.length,0);
});

test('Drum performance applies the selected pad sample, gain, pitch and pan; cancellation fades the voice',async()=>{
 const {engine,context,sources}=makeEngine(),input={connections:[],connect(node){this.connections.push(node);return node}};
 const track={id:'rack',drumRack:{pads:[{id:'pad-1',asset:'kick',volume:.5,pitch:12,pan:-.25,mute:false}]}};
 engine.trackNodes.set(track.id,{input});
 const sample={duration:1},voice=await engine.startPreviewPad(track,new Map([['kick',sample]]),'pad-1',[track]);
 const source=sources[0],gain=source.connections[0],pan=gain.connections[0];
 assert.equal(source.buffer,sample);
 assert.equal(source.playbackRate.value,2);
 assert.equal(gain.gain.value,.4);
 assert.equal(pan.pan.value,-.25);
 assert.equal(pan.connections[0],input);
 voice.release({cancelled:false});
 assert.deepEqual(source.stops,[]);
 context.currentTime=2;
 voice.release({cancelled:true});
 assert.deepEqual(source.stops,[2.008]);
 assert.ok(gain.gain.events.some(([type,value])=>type==='ramp'&&value===0));
 source.onended();
 assert.equal(engine.sources.length,0);
});

test('Sampler and Drum performance report missing samples without creating voices',async()=>{
 const {engine,sources}=makeEngine(),track={id:'track',sampler:{asset:'missing',start:0,end:1}};
 engine.trackNodes.set(track.id,{input:{}});
 assert.equal(await engine.startPreviewNote(track,new Map(),60,.8,[track]),null);
 track.drumRack={pads:[{id:'pad',asset:'missing'}]};
 assert.equal(await engine.startPreviewPad(track,new Map(),'pad',[track]),null);
 assert.equal(sources.length,0);
});
