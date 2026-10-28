import {AudioEngine} from '../src/audio.js';

export async function runAudioFaultAcceptance(){
 const check=(value,message)=>{if(!value)throw new Error(message)},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const engine=new AudioEngine(),errors=[];
 engine.onError=error=>errors.push(error.message);
 const ctx=await engine.init(),buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
 for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=.2*Math.sin(2*Math.PI*220*i/ctx.sampleRate);
 const buffers=new Map([['tone',buffer]]),project={bpm:120,loop:true,loopStart:0,loopEnd:.25,tracks:[{id:'audio',volume:1,pan:0,clips:[{id:'clip',asset:'tone',bar:0,start:0,end:1,gain:1}],fx:{effects:[]}}]};
 const NativeNode=globalThis.AudioWorkletNode,NativeOffline=globalThis.OfflineAudioContext;
 const url=URL.createObjectURL(new Blob(["registerProcessor('ehs-acceptance-crash',class extends AudioWorkletProcessor{process(){throw new Error('Injected DSP failure')}})"],{type:'text/javascript'}));
 try{
  await engine.play(project,buffers);await wait(100);
  await ctx.suspend();const frozen=engine.position();await wait(100);
  check(engine.position()===frozen,'Suspension changed the audio-clock position.');
  await ctx.resume();clearInterval(engine.timer);
  await wait(400);engine.scheduleAhead();
  check(engine.sources.length<=2,'Scheduler recovery duplicated voices.');
  engine.updatePlayback(project,buffers,.2);
  check(Math.abs(engine.position()-.2)<.03,'Seeking lost its transport position.');
  const recoveredSources=engine.sources.length;
  await ctx.audioWorklet.addModule(url);
  engine.stop();engine.masteringGraph.disconnect();engine.masteringGraph=null;engine.master.disconnect();
  globalThis.AudioWorkletNode=function(context,name,options){return new NativeNode(context,name==='egghead-lookahead-limiter'?'ehs-acceptance-crash':name,options)};
  await engine.play(project,buffers);
  for(let i=0;i<100&&!errors.length;i++)await wait(10);
  check(errors.length===1&&!engine.playing&&engine.sources.length===0,'Failed live Worklet did not stop and surface an error.');
  globalThis.AudioWorkletNode=NativeNode;
  await engine.play(project,buffers);await wait(150);
  const peak=engine.readMeters().audio.leftPeak;
  check(engine.playing&&peak>.01,'Retry did not rebuild an audible graph.');
  engine.stop();
  globalThis.OfflineAudioContext=class extends NativeOffline{
   constructor(...args){
    super(...args);const add=this.audioWorklet.addModule.bind(this.audioWorklet);let registered=false;
    this.audioWorklet.addModule=async(...input)=>{await add(...input);if(!registered){await add(url);registered=true}};
   }
  };
  globalThis.AudioWorkletNode=function(context,name,options){return new NativeNode(context,name==='egghead-lookahead-limiter'?'ehs-acceptance-crash':name,options)};
  let offlineError=null;
  try{await engine.render(project,buffers)}catch(error){offlineError=error.message}
  check(offlineError?.includes('AudioWorklet processing failed'),'Export silently accepted a failed processor.');
  return{suspendedPosition:frozen,recoveredSources,liveError:errors[0],retryPeak:peak,offlineError,sourcesAfterStop:engine.sources.length};
 }finally{
  globalThis.AudioWorkletNode=NativeNode;globalThis.OfflineAudioContext=NativeOffline;
  engine.stop(true);for(const graph of engine.trackNodes.values())graph.disconnect();
  engine.masteringGraph?.disconnect();await ctx.close();URL.revokeObjectURL(url);
 }
}
