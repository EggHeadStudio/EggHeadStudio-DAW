import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine,clipDurationSeconds,estimateProjectRender} from '../src/audio.js';
import {createInstrumentClip,migrateInstrumentArrangement,patternForClip,resizeInstrumentClip,validateInstrumentData} from '../src/instrument-clips.js';
import {ArrangementHistory,copyTimeRange,deleteTimeRange,duplicateClip,moveClipTo,pasteTimeRange,resizeClipAtBeat,splitClipAtTime} from '../src/arrangement.js';
import {instrumentEvents,scheduleInstrumentEvent} from '../src/instrument-playback.js';
import {instrumentFixture} from './instrument-fixture.js';

const buffers=new Map([['tone',{duration:1}],['hit',{duration:.1}]]);
const events=(track,from=0,to=16)=>[...instrumentEvents(track,buffers,120,16,from,to)];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

function recordingContext(){
  const sources=[],param=()=>({value:0,events:[],setValueAtTime(value,time){this.events.push([value,time])},linearRampToValueAtTime(value,time){this.events.push([value,time])}});
  const node=()=>({connections:[],gain:param(),pan:param(),frequency:param(),Q:param(),delayTime:param(),playbackRate:param(),connect(target){this.connections.push(target);return target},disconnect(){},getFloatTimeDomainData(data){data.fill(0)},start(...args){this.startArgs=args},stop(time){this.stopTime=time}});
  return{sources,currentTime:0,sampleRate:48000,createGain:node,createStereoPanner:node,createBiquadFilter:node,createDelay:node,createChannelSplitter:node,createAnalyser:()=>({...node(),fftSize:32}),createBufferSource(){const source=node();sources.push(source);return source}};
}

test('independent Sampler clips retain different melodies and stable pattern identities',()=>{
  const {sampler}=instrumentFixture(),[verse,chorus]=sampler.clips;
  assert.notEqual(verse.patternId,chorus.patternId);
  patternForClip(sampler,verse).notes[0].midi=65;
  assert.equal(patternForClip(sampler,chorus).notes[0].midi,72);
  assert.deepEqual(events(sampler).map(event=>[event.at,event.note.midi]),[[2,65],[6,72]]);
  validateInstrumentData(sampler);
});

test('independent Drum Rack clips keep distinct steps and shared pad assignments',()=>{
  const {drums}=instrumentFixture();
  assert.deepEqual(events(drums).map(event=>event.at),[2,6.5]);
  assert.equal(events(drums)[0].voice.buffer,buffers.get('hit'));
  assert.equal(events(drums)[1].voice.level,.5);
  validateInstrumentData(drums);
});

test('instrument timing follows BPM and clip length rather than a whole-track cycle',()=>{
  const {sampler}=instrumentFixture();
  assert.equal(clipDurationSeconds(sampler.clips[0],60),4);
  assert.deepEqual([...instrumentEvents(sampler,buffers,60,16)].map(event=>event.at),[4,12]);
  sampler.clips[0].durationBeats=8;
  assert.deepEqual(events(sampler).map(event=>event.at),[2,4,6]);
  sampler.clips[0].loop=false;
  assert.deepEqual(events(sampler).map(event=>event.at),[2,6]);
});

test('legacy migration is idempotent and keeps notes, configuration and existing audio',()=>{
  let serial=0;const id=()=>`legacy-${++serial}`;
  const project={bpm:120,patternBeats:16,tracks:[{id:'old',name:'Old',clips:[{id:'a',asset:'tone',bar:8,start:0,end:1}],sampler:{asset:'tone',rootNote:62},pattern:{notes:[{beat:2,midi:64,durationBeats:2,velocity:.4},{beat:3}]}}]};
  const config=structuredClone(project.tracks[0].sampler);
  migrateInstrumentArrangement(project,id);
  const track=project.tracks[0],before=JSON.stringify(project);
  migrateInstrumentArrangement(project,id);
  assert.equal(JSON.stringify(project),before);assert.deepEqual(track.sampler,config);
  assert.equal(track.pattern,undefined);assert.equal(track.patterns[0].notes[0].velocity,.4);
  assert.equal(track.patterns[0].notes[1].midi,62);assert.equal(track.patterns[0].notes[1].velocity,.85);
  assert.equal(track.clips[0].asset,'tone');assert.equal(track.clips[1].durationBeats,34);
  validateInstrumentData(track);
});

test('instrument creation rejects invalid destinations and geometry without mutation',()=>{
  const {sampler,audio,id}=instrumentFixture(),before=JSON.stringify(sampler);
  assert.throws(()=>createInstrumentClip(audio,0,id),/Sampler/);
  for(const beat of [-1,NaN,Infinity])assert.throws(()=>createInstrumentClip(sampler,beat,id),RangeError);
  assert.throws(()=>createInstrumentClip(sampler,0,id,{lengthBeats:65}),RangeError);
  assert.equal(JSON.stringify(sampler),before);
});

test('invalid legacy notes abort migration without partially replacing earlier tracks',()=>{
  const project={bpm:120,tracks:[
    {name:'Valid',sampler:{asset:'tone'},clips:[],pattern:{notes:[{midi:60,beat:0}]}},
    {name:'Invalid',sampler:{asset:'tone'},clips:[],pattern:{notes:[{midi:200,beat:0}]}}
  ]},before=JSON.stringify(project);
  let sequence=0;
  assert.throws(()=>migrateInstrumentArrangement(project,()=>`migration-${++sequence}`),/Invalid instrument note/);
  assert.equal(JSON.stringify(project),before);
});

test('duplicate creates an independent pattern by default and supports explicit linked copies',()=>{
  const {project,sampler,id}=instrumentFixture(),source=sampler.clips[0];
  const independent=duplicateClip(project.tracks,sampler.id,source.id,120,id);
  assert.notEqual(independent.patternId,source.patternId);assert.equal(independent.bar,2);
  assert.notEqual(patternForClip(sampler,independent).notes[0].id,patternForClip(sampler,source).notes[0].id);
  const linked=duplicateClip(project.tracks,sampler.id,source.id,120,id,true);
  assert.equal(linked.patternId,source.patternId);
});

test('split and trim preserve pattern identity and source phase with beat-based duration',()=>{
  const {project,sampler,id}=instrumentFixture(),source=sampler.clips[0];
  const right=splitClipAtTime(project.tracks,sampler.id,source.id,3,120,id);
  assert.equal(right.offsetBeats,2);assert.equal(right.durationBeats,2);assert.equal(source.durationBeats,2);
  assert.equal(right.patternId,source.patternId);
  resizeClipAtBeat(right,'start',7,0,120,patternForClip(sampler,right));
  assert.equal(right.bar,1.75);assert.equal(right.offsetBeats,3);assert.equal(right.durationBeats,1);
  right.loop=false;resizeInstrumentClip(right,'end',20,patternForClip(sampler,right));
  assert.equal(right.durationBeats,1);
});

test('mixed range clipboard preserves gaps, sliced phase and independent pattern snapshots',()=>{
  const {project,sampler,id}=instrumentFixture(),selection={startBeat:1,endBeat:14,firstTrack:0,lastTrack:2};
  const clipboard=copyTimeRange(project.tracks,selection,120);
  assert.equal(clipboard.trackCount,3);assert.equal(clipboard.durationBeats,13);
  assert.equal(clipboard.entries[0].clip.asset,'tone');
  patternForClip(sampler,sampler.clips[0]).notes[0].midi=65;
  const pasted=pasteTimeRange(project.tracks,clipboard,20,0,id);
  assert.equal(pasted[0].bar,5);
  const melody=pasted.find(clip=>clip.kind==='instrument');
  assert.equal(melody.bar,23/4);assert.notEqual(melody.patternId,sampler.clips[0].patternId);
  assert.equal(patternForClip(sampler,melody).notes[0].midi,60);
});

test('copy preserves intentional sharing within a section without linking to original patterns',()=>{
  const {project,sampler,id}=instrumentFixture(),source=sampler.clips[0];
  duplicateClip(project.tracks,sampler.id,source.id,120,id,true);
  const clipboard=copyTimeRange(project.tracks,{startBeat:4,endBeat:12,firstTrack:1,lastTrack:1},120);
  const pasted=pasteTimeRange(project.tracks,clipboard,20,1,id);
  assert.equal(pasted.length,2);assert.equal(pasted[0].patternId,pasted[1].patternId);
  assert.notEqual(pasted[0].patternId,source.patternId);
});

test('mixed paste and moves reject incompatible destinations atomically',()=>{
  const {project,sampler,drums,id}=instrumentFixture(),before=JSON.stringify(project);
  const clipboard=copyTimeRange(project.tracks,{startBeat:0,endBeat:16,firstTrack:1,lastTrack:1},120);
  assert.throws(()=>pasteTimeRange(project.tracks,clipboard,0,2,id),/Incompatible/);
  assert.throws(()=>moveClipTo(project.tracks,sampler.clips[0].id,drums.id,0),/Incompatible/);
  assert.equal(JSON.stringify(project),before);
});

test('compatible cross-track move transfers pattern data without changing instrument configuration',()=>{
  const {project,sampler,id}=instrumentFixture(),target={...structuredClone(sampler),id:'target',patterns:[],clips:[]};
  target.sampler.transpose=7;project.tracks.push(target);
  const clip=sampler.clips[0],pattern=patternForClip(sampler,clip);
  assert.equal(moveClipTo(project.tracks,clip.id,target.id,5),true);
  assert.equal(target.clips[0].bar,5);assert.deepEqual(patternForClip(target,clip),pattern);
  assert.notEqual(patternForClip(target,clip),pattern);assert.equal(target.sampler.transpose,7);
  assert.equal(sampler.clips.includes(clip),false);
  assert.equal(events(target,20,24)[0].at,10);
  assert.equal(events(target,20,24)[0].voice.rate,2**(7/12));
});

test('adding or moving clips cannot silently replace an unmigrated legacy melody',()=>{
  const {project,sampler,id}=instrumentFixture(),target={id:'legacy',sampler:{asset:'tone'},clips:[],pattern:{notes:[{midi:60,beat:0}]}};
  project.tracks.push(target);const before=JSON.stringify(project);
  assert.throws(()=>createInstrumentClip(target,0,id),/Migrate/);
  assert.throws(()=>moveClipTo(project.tracks,sampler.clips[0].id,target.id,0),/Migrate/);
  const clipboard=copyTimeRange(project.tracks,{startBeat:4,endBeat:8,firstTrack:1,lastTrack:1},120);
  assert.throws(()=>pasteTimeRange(project.tracks,clipboard,0,3,id),/Migrate/);
  assert.equal(JSON.stringify(project),before);
});

test('history restores pattern edits, generated identities, clipped ranges and project loops',()=>{
  const {project,sampler,id}=instrumentFixture(),history=new ArrangementHistory(),before=JSON.stringify(project);
  history.checkpoint(project.tracks,project);
  duplicateClip(project.tracks,sampler.id,sampler.clips[0].id,120,id);
  sampler.patterns[0].notes[0].midi=67;project.loop=true;
  deleteTimeRange(project.tracks,{startBeat:5,endBeat:7,firstTrack:1,lastTrack:2},120,id);
  const edited=JSON.stringify(project);
  assert.equal(history.undo(project.tracks,project),true);assert.equal(JSON.stringify(project),before);
  assert.equal(history.redo(project.tracks,project),true);assert.equal(JSON.stringify(project),edited);
});

test('partial sustained-note copies resume source and envelope instead of retriggering',()=>{
  const {project,sampler,id}=instrumentFixture();
  sampler.patterns[0].notes[0].durationBeats=2;
  const clipboard=copyTimeRange(project.tracks,{startBeat:5,endBeat:6,firstTrack:1,lastTrack:1},120);
  const [copy]=pasteTimeRange(project.tracks,clipboard,20,1,id);
  const event=events(sampler,20,21).find(event=>event.clipId===copy.id),ctx=recordingContext();
  near(event.at,9.5);near(event.visibleFrom,10);
  const voice=scheduleInstrumentEvent(ctx,ctx.createGain(),event,10,10.15,30,true);
  assert.deepEqual(voice.source.startArgs,[30,.5]);near(voice.source.stopTime,30.5);
  near(voice.nodes[0].gain.events[0][0],.8);
});

test('clip boundaries stop voices, while scheduler windows do not truncate them',()=>{
  const {sampler}=instrumentFixture();sampler.clips[0].durationBeats=.25;
  const event=events(sampler)[0],ctx=recordingContext();
  const voice=scheduleInstrumentEvent(ctx,ctx.createGain(),event,2,2.15,10,true);
  near(voice.source.stopTime,10.125);
  assert.equal(scheduleInstrumentEvent(ctx,ctx.createGain(),event,2.15,2.3,10.15,false),null);
});

test('partial looping selections retain pattern phase across multiple cycles',()=>{
  const {project,sampler,id}=instrumentFixture();
  sampler.clips[0].durationBeats=12;sampler.patterns[0].notes[0].beat=1;
  const clipboard=copyTimeRange(project.tracks,{startBeat:10,endBeat:16,firstTrack:1,lastTrack:1},120);
  const [copy]=pasteTimeRange(project.tracks,clipboard,24,1,id);
  assert.equal(copy.offsetBeats,6);
  assert.deepEqual(events(sampler,24,30).filter(event=>event.clipId===copy.id).map(event=>event.at),[13.5]);
});

test('lookahead enumerates sustained tails rather than restarting notes in every window',()=>{
  const {sampler}=instrumentFixture(),ctx=recordingContext();
  sampler.sampler.mode='loop';sampler.patterns[0].notes[0].durationBeats=8;sampler.clips[0].durationBeats=8;
  const event=events(sampler,6,6.3)[0];
  assert.equal(event.at,2);
  assert.equal(scheduleInstrumentEvent(ctx,ctx.createGain(),event,3,3.15,10,false),null);
  const resumed=scheduleInstrumentEvent(ctx,ctx.createGain(),event,3,3.15,10,true);
  assert.deepEqual(resumed.source.startArgs,[10,0]);assert.equal(resumed.source.loop,true);
  near(resumed.source.stopTime,13);
});

test('a transport loop boundary cuts instrument voices at the same exact audio time',()=>{
  const {sampler}=instrumentFixture(),event=events(sampler)[0],ctx=recordingContext();
  const voice=scheduleInstrumentEvent(ctx,ctx.createGain(),event,2,2.15,10,true,2.2);
  near(voice.source.stopTime,10.2);
});

test('new pattern collections are removed on undo and recreated on redo',()=>{
  const {sampler,id}=instrumentFixture(),track={...sampler,clips:[]},history=new ArrangementHistory();
  delete track.patterns;history.checkpoint([track]);
  createInstrumentClip(track,0,id);assert.equal(track.patterns.length,1);
  history.undo([track]);assert.equal(track.patterns,undefined);assert.equal(track.clips.length,0);
  history.redo([track]);assert.equal(track.patterns.length,1);assert.equal(track.clips.length,1);
});

test('lookahead schedules each clip note once and pattern edits resume at current position',()=>{
  const {project,sampler}=instrumentFixture(),ctx=recordingContext(),engine=new AudioEngine();
  engine.ctx=ctx;engine.eq=ctx.createGain();engine.playing=true;
  engine.syncTracks(project.tracks);engine.updatePlayback(project,buffers,2);
  assert.equal(ctx.sources.length,2);
  ctx.currentTime=.1;engine.scheduleAhead();assert.equal(ctx.sources.length,2);
  sampler.patterns[0].notes[0].velocity=.3;
  engine.updatePlayback(project,buffers);
  near(engine.position(),2.1);
  const melody=ctx.sources.at(-1);near(melody.startArgs[1],.1);
  near(melody.connections[0].gain.events[0][0],.3);
  engine.stop();assert.equal(engine.sources.length,0);
});

test('render duration includes positioned instrument clips and configured effect tails',()=>{
  const {project,sampler}=instrumentFixture();
  sampler.clips[1].bar=20;
  const plan=estimateProjectRender(project,buffers);
  assert.equal(plan.programSeconds,42);
});

test('invalid references, duplicate notes and malformed geometry are explicitly rejected',()=>{
  const {sampler}=instrumentFixture();
  for(const change of [
    track=>{delete track.patterns},
    track=>{track.clips[0].patternId='missing'},
    track=>{track.patterns[0].notes.push({...track.patterns[0].notes[0]})},
    track=>{track.clips[0].offsetBeats=-1},
    track=>{track.patterns[0].notes[0].velocity=2}
  ]){
    const track=structuredClone(sampler);change(track);
    assert.throws(()=>validateInstrumentData(track),/Instrument|instrument/);
  }
});
