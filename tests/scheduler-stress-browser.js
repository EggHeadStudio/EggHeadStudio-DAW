import {AudioEngine,createTrackEffect} from '../src/audio.js';
import {instrumentFixture,instrumentBuffers} from './instrument-fixture.js';

export async function runSchedulerStress({milliseconds=120000}={}){
 const engine=new AudioEngine(),errors=[],ctx=await engine.init(),buffers=instrumentBuffers(ctx);
 const {project}=instrumentFixture();
 project.loop=true;project.loopStart=0;project.loopEnd=1;
 const sampler=project.tracks[1],drums=project.tracks[2];
 for(const [index,track]of [sampler,drums].entries()){
  for(const [patternIndex,pattern]of track.patterns.entries()){
   pattern.lengthBeats=2;
   pattern.notes=Array.from({length:16},(_,note)=>({id:`stress-${index}-${patternIndex}-${note}`,beat:Math.floor(note/(index?1:2))*.125,midi:index?36:60+note%2*7,durationBeats:index ? .125 : .75,velocity:.25+patternIndex*.25}));
   track.clips[patternIndex].bar=patternIndex*.5;track.clips[patternIndex].durationBeats=2;
  }
 }
 drums.patterns[1].notes=drums.patterns[1].notes.filter((_,index)=>index%2===0);
 const duck=createTrackEffect('compressor','stress-sidechain');
 duck.params.sidechain={enabled:true,sourceTrackId:drums.id,position:'pre',ghost:true,detectorGain:0,lowCut:35};
 sampler.fx.effects=[duck];
 const connections=new WeakMap(),starts=new WeakMap(),keys=new WeakMap(),bufferIds=new WeakMap(),active=new Map();
 let sequence=0,duplicates=0,registrations=0,maximumSources=0,seeks=0,suspensions=0,bpmChanges=0;
 for(const method of ['createGain','createStereoPanner','createBufferSource']){
  const create=ctx[method].bind(ctx);
  ctx[method]=(...args)=>{
   const node=create(...args),connect=node.connect.bind(node);
   node.connect=(target,...ports)=>{connections.set(node,target);return connect(target,...ports)};
   if(method==='createBufferSource'){const start=node.start.bind(node);node.start=(when,...args)=>{starts.set(node,[when,args[0]||0]);return start(when,...args)}}
   return node;
  };
 }
 const register=engine.registerSource.bind(engine),release=engine.releaseSource.bind(engine);
 engine.registerSource=(source,nodes)=>{
  const input=connections.get(nodes.at(-1)),trackId=[...engine.trackNodes].find(([,graph])=>graph.input===input)?.[0];
  if(!bufferIds.has(source.buffer))bufferIds.set(source.buffer,++sequence);
  const [when,offset]=starts.get(source),key=`${trackId}:${when.toFixed(7)}:${offset.toFixed(7)}:${source.playbackRate.value}:${bufferIds.get(source.buffer)}`;
  if(active.has(key))duplicates++;
  active.set(key,source);keys.set(source,key);registrations++;register(source,nodes);
 };
 engine.releaseSource=source=>{const key=keys.get(source);if(active.get(key)===source)active.delete(key);release(source)};
 engine.onError=error=>errors.push(error.message);
 const started=performance.now(),scheduler=[],schedule=engine.scheduleAhead.bind(engine);
 engine.scheduleAhead=()=>{const at=performance.now();schedule();scheduler.push(performance.now()-at);maximumSources=Math.max(maximumSources,engine.sources.length)};
 try{
  await engine.play(project,buffers);
  let step=0;
  while(performance.now()-started<milliseconds){
   await new Promise(resolve=>setTimeout(resolve,500));step++;
   if(step%10===0){engine.updatePlayback(project,buffers,step%20===0 ? .1 : 1.6);seeks++}
   if(step%20===0){await ctx.suspend();const position=engine.position();await new Promise(resolve=>setTimeout(resolve,60));if(engine.position()!==position)throw new Error('Suspension advanced the clock.');await ctx.resume();suspensions++}
   if(step%30===0){project.bpm=project.bpm===120?137:120;engine.updatePlayback(project,buffers);bpmChanges++}
   if(errors.length)throw new Error(errors.join('; '));
   if(engine.sources.length>100)throw new Error('Voice count accumulated across loops.');
  }
  engine.stop(true);
  if(engine.sources.length||active.size||duplicates)throw new Error(`Stuck/duplicate sources: ${engine.sources.length}/${active.size}/${duplicates}`);
  return{elapsedMs:performance.now()-started,registrations,duplicates,maximumSources,seeks,suspensions,bpmChanges,schedulerCalls:scheduler.length,schedulerMaxMs:Math.max(...scheduler),schedulerMeanMs:scheduler.reduce((sum,value)=>sum+value,0)/scheduler.length,sourcesAfterStop:engine.sources.length,errors};
 }finally{
  engine.stop(true);for(const graph of engine.trackNodes.values())graph.disconnect();engine.masteringGraph?.disconnect();await ctx.close();
 }
}
