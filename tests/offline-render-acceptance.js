import {AudioEngine,createTrackEffect} from '../src/audio.js';
import {analyzeMasterBufferAsync,createMasteringGraph,normalizeMasteringSettings} from '../src/mastering.js';
import {instrumentFixture,instrumentBuffers} from './instrument-fixture.js';

const check=(condition,message)=>{if(!condition)throw new Error(message)};
function difference(a,b){
 check(a.length===b.length,'Audio lengths differ.');let maximum=0,squares=0;
 for(let ch=0;ch<a.numberOfChannels;ch++)for(let frame=0;frame<a.length;frame++){
  const error=a.getChannelData(ch)[frame]-b.getChannelData(ch)[frame];maximum=Math.max(maximum,Math.abs(error));squares+=error*error;
 }
 return{maximum,rms:Math.sqrt(squares/(a.length*a.numberOfChannels))};
}

export async function runOfflineRenderAcceptance(){
 const context=new OfflineAudioContext(2,1,44100),engine=new AudioEngine();
 const stereo=[];
 for(const [name,width,polarity]of [['stereo',1,1],['mono',0,1],['opposite',1,-1]]){
  const ctx=new OfflineAudioContext(2,44100,44100),source=ctx.createBufferSource(),buffer=ctx.createBuffer(2,44100,44100);
  for(let frame=0;frame<buffer.length;frame++){
   buffer.getChannelData(0)[frame]=.2*Math.sin(2*Math.PI*440*frame/44100);
   buffer.getChannelData(1)[frame]=polarity<0?-buffer.getChannelData(0)[frame]:.1*Math.sin(2*Math.PI*660*frame/44100);
  }
  source.buffer=buffer;
  const graph=createMasteringGraph(ctx,normalizeMasteringSettings({imager:{enabled:true,width}}),ctx.destination);
  source.connect(graph.input);source.start();
  const result=await ctx.startRendering(),left=result.getChannelData(0),right=result.getChannelData(1);graph.disconnect();
  let delta=0,opposite=0,leftEnergy=0,rightEnergy=0;
  for(let frame=22050;frame<result.length;frame++){delta=Math.max(delta,Math.abs(left[frame]-right[frame]));opposite=Math.max(opposite,Math.abs(left[frame]+right[frame]));leftEnergy+=left[frame]**2;rightEnergy+=right[frame]**2}
  if(name==='stereo')check(delta>.1&&Math.abs(Math.sqrt(leftEnergy/rightEnergy)-2)<.01,'Mastering lost stereo separation or balance.');
  if(name==='mono')check(delta<1e-7,'Width zero did not produce mono.');
  if(name==='opposite')check(opposite<1e-7&&leftEnergy>1,'Opposite-polarity stereo was lost.');
  stereo.push({name,delta,opposite,leftEnergy,rightEnergy});
 }
 const {project}=instrumentFixture(),buffers=instrumentBuffers(context);
 const delay=createTrackEffect('delay','delay');delay.params={time:.2,feedback:.5,mix:.3};
 project.tracks[1].fx.effects=[delay];
 project.mastering=normalizeMasteringSettings({multiband:{enabled:true},limiter:{enabled:true},saturation:{enabled:true},imager:{enabled:true,width:1.15}});
 const original=await engine.render(project,buffers);
 let edited=false;
 const snapshotted=await engine.render(project,buffers,{onProgress:()=>{
  if(edited)return;edited=true;project.tracks[1].patterns[1].notes=[];project.tracks[1].volume=0;buffers.clear();
 }});
 const snapshotDifference=difference(original,snapshotted);
 check(snapshotDifference.maximum<1e-7,'Edits during export altered the captured project.');
 const analysis=await analyzeMasterBufferAsync(original);
 check(analysis.rms>.001&&!analysis.clipping,'Instrument fixture was silent or clipped.');
 const controller=new AbortController(),NativeOffline=globalThis.OfflineAudioContext;
 let liveSources=0,cancelContext;
 globalThis.OfflineAudioContext=class extends NativeOffline{
  constructor(...args){super(...args);cancelContext=this;const create=this.createBufferSource.bind(this);
   this.createBufferSource=()=>{const source=create(),disconnect=source.disconnect.bind(source);let released=false;liveSources++;source.disconnect=()=>{if(!released){released=true;liveSources--}disconnect()};return source};
  }
 };
 let cancellation;
 try{
  const fixture=instrumentFixture(),assets=instrumentBuffers(context),at=performance.now();
  try{await engine.render(fixture.project,assets,{signal:controller.signal,onProgress:()=>controller.abort()})}catch(error){cancellation={name:error.name,elapsedMs:performance.now()-at,state:cancelContext.state,sources:liveSources}}
  check(cancellation?.name==='AbortError'&&liveSources===0&&cancelContext.state==='closed','Cancelled render retained its source graph/context or returned audio.');
 }finally{globalThis.OfflineAudioContext=NativeOffline}
 return{stereo,snapshotDifference,instrumentFrames:original.length,instrumentDuration:original.duration,analysis:{rms:analysis.rms,peak:analysis.samplePeak,truePeakDbtp:analysis.truePeakDbtp},cancellation};
}

export async function runOfflineBoundarySignalAcceptance(){
 const engine=new AudioEngine(),ctx=new OfflineAudioContext(2,1,44100);
 const tone=ctx.createBuffer(1,44100,44100),trigger=ctx.createBuffer(1,8820,44100);
 for(let frame=0;frame<tone.length;frame++)tone.getChannelData(0)[frame]=.3*Math.sin(2*Math.PI*110*frame/44100);
 trigger.getChannelData(0).fill(.8);
 const compressor=createTrackEffect('compressor','duck');
 Object.assign(compressor.params,{threshold:-30,ratio:8,knee:0,attack:.001,release:.1,sidechain:{enabled:true,sourceTrackId:'trigger',position:'pre',ghost:true,detectorGain:0,lowCut:0}});
 const project={bpm:120,tracks:[
  {id:'bass',volume:.5,pan:0,clips:[{id:'bass-clip',asset:'tone',bar:0,start:0,end:1,loop:true,duration:8,gain:1}],fx:{effects:[compressor]}},
  {id:'trigger',volume:1,mute:true,pan:0,clips:[.45,1.45].map((bar,index)=>({id:`trigger-${index}`,asset:'trigger',bar,start:0,end:.2,gain:1})),fx:{effects:[]}}
 ]},buffers=new Map([['tone',tone],['trigger',trigger]]);
 const ducked=await engine.render(project,buffers,{bypassMastering:true});
 compressor.enabled=false;
 const dry=await engine.render(project,buffers,{bypassMastering:true});
 const rms=(buffer,from,to)=>{
  const data=buffer.getChannelData(0),start=Math.round(from*44100),end=Math.round(to*44100);
  let squares=0;for(let frame=start;frame<end;frame++)squares+=data[frame]**2;
  return Math.sqrt(squares/(end-start));
 };
 const ducking=[.98,2.98].map(start=>20*Math.log10(rms(ducked,start,start+.06)/rms(dry,start,start+.06)));
 check(ducking.every(db=>db< -15),'Sidechain state or ghost routing was lost across offline boundaries.');
 project.mastering=normalizeMasteringSettings({outputGainDb:24,saturation:{enabled:true},imager:{enabled:true},multiband:{enabled:true},limiter:{enabled:true,ceiling:-2}});
 const limited=await engine.render(project,buffers),analysis=await analyzeMasterBufferAsync(limited);
 check(analysis.truePeakDbtp<=-1.95&&analysis.truePeakDbtp>-4&&!analysis.clipping,'Active mastering limiter did not control the amplified signal.');
 return{duckingDb:ducking,limitedTruePeakDbtp:analysis.truePeakDbtp,limitedSamplePeak:analysis.samplePeak,clippedSamples:analysis.clippedSamples,frames:limited.length};
}
