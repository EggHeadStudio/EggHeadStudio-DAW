import {AudioEngine,createTrackEffect,drawWave,estimateProjectRender} from '../src/audio.js';
import {normalizeMasteringSettings} from '../src/mastering.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {encodeExport} from '../src/export.js';

export const PERFORMANCE_WORKLOADS={small:{tracks:4,seconds:30},medium:{tracks:12,seconds:180},large:{tracks:24,seconds:300}};

async function benchmarkAssetFiles(buffers){
 const assets=new Map();
 for(const[id,buffer]of buffers){
  const {blob}=await encodeExport(buffer,{format:'wav',bitDepth:32,sampleRate:44100,channels:2,dither:false});
  blob.name=`${id}.wav`;assets.set(id,blob);
 }
 return assets;
}

export function createPerformanceProject(size,createBuffer){
 const workload=PERFORMANCE_WORKLOADS[size];
 if(!workload)throw new RangeError(`Unknown workload: ${size}`);
 const sampleRate=44100,buffers=new Map();
 for(let asset=0;asset<4;asset++){
  const seconds=asset===0?workload.seconds:1,buffer=createBuffer(2,seconds*sampleRate,sampleRate);
  for(let channel=0;channel<2;channel++){
   const data=buffer.getChannelData(channel),frequency=[110,55,440,70][asset]+channel*2;
   for(let frame=0;frame<data.length;frame++)data[frame]=.05*Math.sin(2*Math.PI*frequency*frame/sampleRate)*(asset===3?Math.exp(-frame/sampleRate*20):1);
  }
  buffers.set(`asset-${asset}`,buffer);
 }
 const tracks=Array.from({length:workload.tracks},(_,index)=>{
  const track={id:`track-${index}`,name:`Benchmark ${index+1}`,volume:.4,pan:(index%3-1)*.2,mute:false,solo:false,clips:[],fx:{effects:[]},pattern:{notes:[]}};
  if(index%4===0){
   track.clips=Array.from({length:Math.ceil(workload.seconds/10)},(_,clip)=>({id:`clip-${index}-${clip}`,asset:'asset-0',bar:clip*5,start:clip*10,end:Math.min(workload.seconds,(clip+1)*10),gain:1,rate:1}));
   track.fx.effects=[createTrackEffect('eq',`eq-${index}`)];
  }else if(index%4===3){
   track.drumRack={steps:16,pads:Array.from({length:16},(_,pad)=>({note:36+pad,name:`Pad ${pad}`,asset:pad<2?`asset-${3-pad}`:null,volume:1,pan:0,pitch:0,mute:false}))};
   track.pattern.notes=Array.from({length:8},(_,note)=>({id:`note-${index}-${note}`,beat:note*.5,midi:36+note%2,durationBeats:.25,velocity:.6}));
  }else{
   track.sampler={asset:`asset-${index%2+1}`,rootNote:60,start:0,end:1,mode:'melodic',attack:.005,decay:.1,sustain:.8,release:.03};
   track.pattern.notes=Array.from({length:8},(_,note)=>({id:`note-${index}-${note}`,beat:note*2,midi:60+note%5,durationBeats:1,velocity:.6}));
   if(index===1){
    const compressor=createTrackEffect('compressor','sidechain');
    compressor.params.sidechain={enabled:true,sourceTrackId:'track-3',position:'pre',ghost:true,detectorGain:0,lowCut:35};
    track.fx.effects=[compressor];
   }else if(index===2){
    const delay=createTrackEffect('delay','delay');delay.params.mix=.1;
    track.fx.effects=[delay];
   }
  }
  return track;
 });
 const project={id:`benchmark-${size}`,name:`Benchmark ${size}`,schemaVersion:1,bpm:120,patternBeats:16,tracks,mastering:normalizeMasteringSettings({saturation:{enabled:true},imager:{enabled:true},multiband:{enabled:true},limiter:{enabled:true}})};
 return{project,buffers,workload};
}

export async function runPerformanceBenchmark(size,{exportAudio=false,playback=true,observePlaybackMs=1000}={}){
 const status={size,stage:'prepare'};globalThis.performanceBenchmarkStatus=status;
 const started=performance.now(),engine=new AudioEngine(),context=new OfflineAudioContext(2,1,44100);
 const fixture=createPerformanceProject(size,(channels,frames,rate)=>context.createBuffer(channels,frames,rate));
 const preparationMs=performance.now()-started,{project,buffers,workload}=fixture;
 const canvas=document.createElement('canvas');canvas.style.cssText='width:1000px;height:180px';document.body.append(canvas);
 const waveform=[];
 for(let iteration=0;iteration<6;iteration++){const start=performance.now();drawWave(canvas,buffers.get('asset-0'));waveform.push(performance.now()-start)}
 canvas.remove();
 const longTasks=[],observer=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(entry=>({duration:entry.duration,startTime:entry.startTime})))):null;
 observer?.observe({type:'longtask',buffered:false});
 let maxHeartbeatDelay=0,lastHeartbeat=performance.now();
 const heartbeat=setInterval(()=>{const now=performance.now();maxHeartbeatDelay=Math.max(maxHeartbeatDelay,now-lastHeartbeat-10);lastHeartbeat=now},10);
 let heapPeak=performance.memory?.usedJSHeapSize||0;
 const memory=setInterval(()=>heapPeak=Math.max(heapPeak,performance.memory?.usedJSHeapSize||0),20);
 try{
  status.stage='encode-assets';
  const assets=await benchmarkAssetFiles(buffers);

  let start=performance.now();status.stage='create-archive';
  const archive=await createPortableProjectArchive(project,{assetFiles:assets});
  const archiveCreateMs=performance.now()-start;
  start=performance.now();status.stage='import-archive';const restored=await openPortableProjectArchive(archive);const archiveImportMs=performance.now()-start;
  let restoredBytes=0;
  for(const file of restored.assetFiles.values())restoredBytes+=file.size;
  start=performance.now();
  const decoded=new Map();
  for(const[id,file]of restored.assetFiles){
   const hash=restored.assetMetadata.get(id).sha256;
   if(!decoded.has(hash))decoded.set(hash,await context.decodeAudioData(await file.arrayBuffer()));
  }
  const audioRestoreMs=performance.now()-start;
  start=performance.now();JSON.parse(JSON.stringify(project));const metadataLoadMs=performance.now()-start;
  let audioInitMs=null,playbackInitMs=null,scheduledSources=null,sourcesAfterStop=null;
  const schedulerMs=[],nodesCreated={};
  if(playback){
   start=performance.now();status.stage='audio-init';await engine.init();engine.setMastering(project.mastering);audioInitMs=performance.now()-start;
   for(const method of ['createBufferSource','createGain','createStereoPanner','createBiquadFilter','createAnalyser','createDelay','createChannelSplitter','createChannelMerger']){
    const original=engine.ctx[method].bind(engine.ctx);engine.ctx[method]=(...args)=>{nodesCreated[method]=(nodesCreated[method]||0)+1;return original(...args)};
   }
   const schedule=engine.scheduleAhead.bind(engine);
   engine.scheduleAhead=()=>{const at=performance.now();schedule();schedulerMs.push(performance.now()-at)};
   start=performance.now();status.stage='schedule-playback';await engine.play(project,buffers);playbackInitMs=performance.now()-start;scheduledSources=engine.sources.length;
   await new Promise(resolve=>setTimeout(resolve,observePlaybackMs));
   engine.stop(true);sourcesAfterStop={sources:engine.sources.length};
  }
  let renderMs=null,encodeMs=null,outputFrames=null,outputPeak=null,outputChecksum=null,outputHashes=null;
  if(exportAudio){
   start=performance.now();status.stage='render';const rendered=await engine.render(project,buffers);renderMs=performance.now()-start;outputFrames=rendered.length;
   let peak=0,sum=0;
   for(let channel=0;channel<rendered.numberOfChannels;channel++){const data=rendered.getChannelData(channel);for(let frame=0;frame<data.length;frame++){peak=Math.max(peak,Math.abs(data[frame]));sum+=data[frame]*(frame%17+1)}}
   outputPeak=peak;outputChecksum=sum;
   outputHashes=await Promise.all(Array.from({length:rendered.numberOfChannels},async(_,channel)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rendered.getChannelData(channel)))).map(value=>value.toString(16).padStart(2,'0')).join('')));
   start=performance.now();status.stage='encode-export';await encodeExport(rendered,{format:'wav',bitDepth:24,sampleRate:44100,channels:2,dither:false});encodeMs=performance.now()-start;
  }
  await new Promise(resolve=>setTimeout(resolve,30));
  status.stage='complete';return{size,tracks:workload.tracks,programSeconds:workload.seconds,sampleRate:44100,preparationMs,metadataLoadMs,audioRestoreMs,waveformMs:waveform,archiveCreateMs,archiveImportMs,archiveBytes:archive.size,restoredBytes,audioInitMs,playbackInitMs,scheduledSources,sourcesAfterStop,nodesCreated,schedulerMs,renderMs,encodeMs,outputFrames,outputPeak,outputChecksum,outputHashes,heapPeak,maxHeartbeatDelay,longTasks,expectedRender:estimateProjectRender(project,buffers),environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,visibility:document.visibilityState}};
 }finally{
  clearInterval(heartbeat);clearInterval(memory);observer?.disconnect();engine.stop(true);
  for(const graph of engine.trackNodes.values())graph.disconnect();
  engine.masteringGraph?.disconnect();await engine.ctx?.close();
 }
}

export async function compareArchiveImport(size){
 const context=new OfflineAudioContext(2,1,44100),{project,buffers}=createPerformanceProject(size,(channels,frames,rate)=>context.createBuffer(channels,frames,rate));
 const archive=await createPortableProjectArchive(project,{assetFiles:await benchmarkAssetFiles(buffers)}),results=[];
 for(const useWorker of [false,true]){
  let maxHeartbeatDelay=0,last=performance.now(),heapPeak=performance.memory?.usedJSHeapSize||0;
  const timer=setInterval(()=>{const now=performance.now();maxHeartbeatDelay=Math.max(maxHeartbeatDelay,now-last-10);last=now;heapPeak=Math.max(heapPeak,performance.memory?.usedJSHeapSize||0)},10);
  const start=performance.now();
  try{
   const restored=await openPortableProjectArchive(archive,{useWorker});
   const elapsedMs=performance.now()-start;
   await new Promise(resolve=>setTimeout(resolve,30));
   results.push({useWorker,elapsedMs,maxHeartbeatDelay,heapPeak,assets:restored.assetFiles.size,payloadBytes:restored.manifest.limits.payloadBytes});
  }finally{clearInterval(timer)}
 }
 return{size,archiveBytes:archive.size,results};
}

export function compareWaveformDrawing(size){
 const context=new OfflineAudioContext(2,1,44100),{buffers}=createPerformanceProject(size,(channels,frames,rate)=>context.createBuffer(channels,frames,rate));
 const buffer=buffers.get('asset-0'),canvas=document.createElement('canvas');canvas.style.cssText='width:1000px;height:180px';document.body.append(canvas);canvas.getContext('2d',{willReadFrequently:true});
 const reference=()=>{
  const dpr=Math.min(devicePixelRatio||1,2),width=canvas.clientWidth,height=canvas.clientHeight;
  canvas.width=width*dpr;canvas.height=height*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);ctx.strokeStyle='#79d5c1';ctx.lineWidth=1;
  const data=buffer.getChannelData(0),step=Math.max(1,Math.floor(data.length/width));
  for(let x=0;x<width;x++){
   let minimum=1,maximum=-1;
   for(let frame=x*step;frame<Math.min(data.length,(x+1)*step);frame++){const sample=data[frame]||0;if(sample<minimum)minimum=sample;if(sample>maximum)maximum=sample}
   ctx.beginPath();ctx.moveTo(x,(1-maximum)*height/2);ctx.lineTo(x,(1-minimum)*height/2);ctx.stroke();
  }
 };
 const measure=draw=>Array.from({length:6},()=>{const start=performance.now();draw();return performance.now()-start});
 try{
  const baselineMs=measure(reference),baselinePixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  const optimizedMs=measure(()=>drawWave(canvas,buffer)),optimizedPixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let pixelDifferences=0;for(let index=0;index<baselinePixels.length;index++)if(baselinePixels[index]!==optimizedPixels[index])pixelDifferences++;
  return{size,baselineMs,optimizedMs,pixelDifferences,pcmBytes:buffer.length*buffer.numberOfChannels*4};
 }finally{canvas.remove()}
}
