import test from 'node:test';
import assert from 'node:assert/strict';
import {instrumentEvents,scheduleInstrumentEvent} from '../src/instrument-playback.js';

function parameter(value=0){
 return{
  value,
  events:[],
  setValueAtTime(next,time){this.value=next;this.events.push(['set',next,time])},
  linearRampToValueAtTime(next,time){this.value=next;this.events.push(['ramp',next,time])}
 };
}

function makeContext(){
 const sources=[];
 return{
  sources,
  createBufferSource(){
   const source={
    connections:[],starts:[],stops:[],playbackRate:parameter(1),
    connect(node){this.connections.push(node);return node},
    start(...args){this.starts.push(args)},
    stop(time){this.stops.push(time)}
   };
   sources.push(source);return source;
  },
  createGain(){return{gain:parameter(1),connections:[],connect(node){this.connections.push(node);return node}}},
  createStereoPanner(){return{pan:parameter(0),connections:[],connect(node){this.connections.push(node);return node}}}
 };
}

function samplerTrack(){
 return{
  id:'sampler',sampler:{
   asset:'sample',start:.1,end:.8,mode:'melodic',rootNote:60,
   transpose:2,fineTune:-25,attack:.01,decay:.08,sustain:.7,release:.2
  },
  pattern:{notes:[
   {id:'c4',beat:0,midi:60,durationBeats:.5,velocity:.8},
   {id:'e4',beat:0,midi:64,durationBeats:.5,velocity:.6}
  ]}
 };
}

test('Sampler performance routes simultaneous pitched notes through the shared voice path',()=>{
 const context=makeContext(),track=samplerTrack(),buffer={duration:1},buffers=new Map([['sample',buffer]]);
 const events=[...instrumentEvents(track,buffers,120,4)];
 assert.equal(events.length,2);
 const scheduled=events.map(event=>scheduleInstrumentEvent(context,{},event,0,1,0,true));
 assert.ok(scheduled.every(Boolean));
 assert.equal(context.sources.length,2);
 assert.ok(Math.abs(context.sources[0].playbackRate.value-2**((2-.25)/12))<1e-10);
 assert.ok(Math.abs(context.sources[1].playbackRate.value-2**((4+2-.25)/12))<1e-10);
 assert.deepEqual(context.sources.map(source=>source.starts),[[[0,.1]],[[0,.1]]]);
 assert.deepEqual(context.sources.map(source=>source.stops),[[.25],[.25]]);
 assert.ok(context.sources.every(source=>source.connections[0].gain.events.length>0));
});

test('Drum Rack performance resolves the assigned pad sample and applies pad pitch, gain and pan',()=>{
 const context=makeContext(),buffer={duration:1},pad={
  id:'pad-17',note:53,asset:'snare',volume:.35,pitch:12,pan:-.4,mute:false
 };
 const track={id:'rack',drumRack:{pads:[pad]},pattern:{notes:[
  {id:'hit',beat:0,midi:53,durationBeats:.25,velocity:.8}
 ]}};
 const events=[...instrumentEvents(track,new Map([['snare',buffer]]),120,4)];
 assert.equal(events.length,1);
 const voice=scheduleInstrumentEvent(context,{},events[0],0,1,0,true);
 const [source]=context.sources,gain=source.connections[0],pan=gain.connections[0];
 assert.ok(voice);
 assert.equal(source.buffer,buffer);
 assert.equal(source.playbackRate.value,2);
 assert.equal(gain.gain.value,.8*.35);
 assert.equal(pan.pan.value,-.4);
 assert.equal(source.stops[0],.5);
});

test('Drum Rack performance does not schedule muted or unassigned pads',()=>{
 const buffer={duration:1},track={id:'rack',drumRack:{pads:[
  {id:'muted',note:36,asset:'kick',volume:1,pitch:0,pan:0,mute:true}
 ]},pattern:{notes:[
  {id:'muted-hit',beat:0,midi:36,durationBeats:.25,velocity:1},
  {id:'unassigned-hit',beat:1,midi:60,durationBeats:.25,velocity:1}
 ]}};
 assert.deepEqual([...instrumentEvents(track,new Map([['kick',buffer]]),120,4)],[]);
});
