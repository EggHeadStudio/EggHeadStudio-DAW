import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine,createTrackEffect} from '../src/audio.js';
import {pianoBeatAtClientX} from '../src/timeline.js';
import {renderSamplerHTML} from '../src/sampler-ui.js';

function fixture(){
  const sources=[],param=()=>({value:0,events:[],setValueAtTime(value,time){this.events.push([value,time])},linearRampToValueAtTime(value,time){this.events.push([value,time])}});
  const node=()=>({connections:[],gain:param(),pan:param(),frequency:param(),Q:param(),delayTime:param(),playbackRate:param(),
    connect(target){this.connections.push(target);return target},disconnect(target){this.connections=target?this.connections.filter(item=>item!==target):[]},
    getFloatTimeDomainData(data){data.fill(0)},start(...args){this.startArgs=args},stop(time){this.stopTime=time}});
  const ctx={currentTime:0,sampleRate:48000,createGain:node,createStereoPanner:node,createBiquadFilter:node,createDelay:node,createChannelSplitter:node,createAnalyser:()=>({...node(),fftSize:32}),createBufferSource(){const source=node();sources.push(source);return source}};
  const engine=new AudioEngine();engine.ctx=ctx;engine.eq=node();engine.playing=true;
  const track={id:'audio',volume:1,pan:0,clips:[{id:'clip',asset:'a',bar:0,start:0,end:4,gain:1}],pattern:{notes:[]},fx:{effects:[]}};
  const project={bpm:120,loop:false,loopStart:0,loopEnd:1,tracks:[track]};
  const buffers=new Map([['a',{duration:4}]]);
  engine.syncTracks(project.tracks);engine.updatePlayback(project,buffers,0);
  return{engine,ctx,sources,project,track,buffers};
}

test('silent non-loop transport keeps advancing beyond the final clip',()=>{
  const {engine,ctx}=fixture();
  ctx.currentTime=1000;engine.scheduleAhead();
  assert.equal(engine.playing,true);assert.equal(engine.position(),1000);
});

test('empty loops wrap on audio time independent of the last clip',()=>{
  const {engine,ctx,project,buffers}=fixture();
  project.tracks[0].clips=[];project.loop=true;project.loopStart=2;project.loopEnd=3;
  engine.updatePlayback(project,buffers,0);
  assert.equal(engine.position(),4);
  ctx.currentTime=10.25;engine.scheduleAhead();
  assert.equal(engine.position(),4.25);assert.equal(engine.playing,true);
});

test('loop audio is scheduled before the boundary and cut at its exact end',()=>{
  const {engine,ctx,sources,project,buffers}=fixture();
  project.loop=true;engine.updatePlayback(project,buffers,0);
  const first=sources.at(-1);assert.equal(first.stopTime,2);
  ctx.currentTime=1.9;engine.scheduleAhead();
  const next=sources.at(-1);
  assert.deepEqual(next.startArgs,[2,0]);assert.equal(next.stopTime,4);
  ctx.currentTime=2.037;assert.ok(Math.abs(engine.position()-.037)<1e-10);
});

test('short loops schedule multiple exact repeats within one lookahead',()=>{
  const {engine,project,buffers,sources}=fixture();
  project.loop=true;project.loopEnd=.025;engine.updatePlayback(project,buffers,0);
  const starts=sources.slice(1).map(source=>source.startArgs[0]);
  assert.ok(starts.length>=3);assert.ok(Math.abs(starts[1]-.05)<1e-10);assert.ok(Math.abs(starts[2]-.1)<1e-10);
});

test('lookahead underrun recovery replaces old voices instead of doubling them',()=>{
  const {engine,ctx,sources}=fixture(),old=sources[0];
  ctx.currentTime=.8;engine.scheduleAhead();
  assert.equal(old.stopTime,undefined);
  assert.equal(engine.sources.length,1);assert.deepEqual(engine.sources[0].startArgs,[.8,.8]);
});

test('stop freezes the current loop-relative position',()=>{
  const {engine,ctx,project,buffers}=fixture();
  project.loop=true;engine.updatePlayback(project,buffers,0);ctx.currentTime=2.3;engine.stop();
  assert.ok(Math.abs(engine.position()-.3)<1e-10);
  ctx.currentTime=4;assert.ok(Math.abs(engine.position()-.3)<1e-10);
});

test('effect-chain rebuild keeps the input connected to an already playing source',()=>{
  const {engine,track,sources}=fixture(),source=sources[0],input=engine.trackNodes.get(track.id).input;
  track.fx.effects.push(createTrackEffect('eq','eq'));engine.syncTracks([track]);
  const graph=engine.trackNodes.get(track.id);
  assert.equal(graph.input,input);assert.equal(source.connections[0].connections[0],input);
  assert.ok(input.connections.includes(graph.gain));
  track.volume=.23;track.pan=-.4;track.fx.effects[0].params.bands[0].gain=9;engine.syncTracks([track]);
  assert.equal(graph.gain.gain.value,.23);assert.equal(graph.pan.pan.value,-.4);assert.equal(graph.instances.get('eq').nodes[0].gain.value,9);
  track.fx.effects=[];engine.syncTracks([track]);assert.equal(engine.trackNodes.get(track.id).input,input);
});

test('mixer/effect edits do not restart sources; clip edits reschedule at current position',()=>{
  const {engine,track,ctx,project,buffers,sources}=fixture();
  const source=sources[0];ctx.currentTime=.5;track.volume=.2;engine.syncTracks([track]);engine.updatePlayback(project,buffers);
  assert.equal(sources.length,1);assert.equal(source.stopTime,4);
  track.clips[0].gain=.4;engine.updatePlayback(project,buffers);
  assert.equal(source.stopTime,undefined);assert.deepEqual(sources.at(-1).startArgs,[.5,.5]);
  assert.equal(sources.at(-1).connections[0].gain.events[0][0],.4);assert.equal(engine.position(),.5);
});

test('live gated-note edits resume the active note instead of waiting for its next onset',()=>{
  const {engine,track,ctx,project,buffers,sources}=fixture();
  track.clips=[];track.sampler={asset:'a',rootNote:60,mode:'melodic',sustain:.8};
  track.pattern.notes=[{midi:60,beat:0,durationBeats:4,velocity:1}];
  engine.updatePlayback(project,buffers,0);ctx.currentTime=.5;
  track.sampler.transpose=12;engine.updatePlayback(project,buffers);
  assert.deepEqual(sources.at(-1).startArgs,[.5,1]);assert.equal(sources.at(-1).playbackRate.value,2);
});

test('piano-roll placement uses the scrolled lane rectangle exactly once for mouse and touch',()=>{
  for(const pixelsPerBeat of [20,40,100]){
    const laneLeft=200-640,clientX=200;
    assert.equal(pianoBeatAtClientX(clientX,laneLeft,pixelsPerBeat),640/pixelsPerBeat);
    assert.equal(pianoBeatAtClientX(laneLeft+pixelsPerBeat*3.25,laneLeft,pixelsPerBeat),3.25);
  }
});

test('piano notes render at the top of their own pitch lane, not a second global pitch offset',()=>{
  const html=renderSamplerHTML({id:'piano',name:'Piano',sampler:{asset:'a',rootNote:60},pattern:{notes:[{id:'placed',beat:3,midi:60,durationBeats:1}]}},new Map(),new Map(),.25);
  const lane=html.match(/data-midi="60"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(lane.includes('data-note-id="placed"'));
  assert.match(lane,/left:120px/);assert.match(lane,/top:0;/);
  assert.doesNotMatch(lane,/top:770px/);
});
