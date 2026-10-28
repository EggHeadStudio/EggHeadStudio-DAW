import {AudioEngine,estimateProjectRender} from '../src/audio.js';
import {createPerformanceProject} from './performance-fixture.js';
import {analyzeMasterBufferAsync} from '../src/mastering.js';
import {encodeExport} from '../src/export.js';
import {instrumentEvents} from '../src/instrument-playback.js';

const now=()=>performance.now();

export async function profileOfflineRender(size='small',{variant='full',encode=false,reference=false,compare=false,legacyStereo=false,compareAnalysis=false}={}){
 const NativeOffline=globalThis.OfflineAudioContext,NativeNode=globalThis.AudioWorkletNode;
 const timings={},nodeCounts={},engine=new AudioEngine(),started=now();
 globalThis.offlineProfileStatus={size,variant,stage:'fixture'};
 const status=stage=>{globalThis.offlineProfileStatus.stage=stage};
 const fixtureContext=new NativeOffline(2,1,44100);
 const {project,buffers}=createPerformanceProject(size,(...args)=>fixtureContext.createBuffer(...args));
 timings.fixtureMs=now()-started;
 let at=now(),eventCount=0;
 const {programSeconds}=estimateProjectRender(project,buffers);
 timings.estimateMs=now()-at;at=now();
 for(const track of project.tracks)for(const event of instrumentEvents(track,buffers,project.bpm,programSeconds*project.bpm/60,0,programSeconds*project.bpm/60,project.patternBeats||16))eventCount++;
 timings.instrumentEventsMs=now()-at;
 if(variant==='no-track-effects')for(const track of project.tracks)track.fx={effects:[]};
 if(variant==='no-sidechain')for(const track of project.tracks)track.fx.effects=track.fx.effects.filter(effect=>!effect.params?.sidechain?.enabled);
 for(const name of ['eq','saturation','imager'])if(variant===`no-${name}`)project.mastering[name].enabled=false;
 let renderStarted,graphStarted,moduleMs=0,liveSources=0,maxLiveSources=0,suspensions=0;
 const gainNodes=[];
 globalThis.OfflineAudioContext=class extends NativeOffline{
  constructor(...args){
   super(...args);graphStarted=now();
   const addModule=this.audioWorklet.addModule.bind(this.audioWorklet);
   this.audioWorklet.addModule=async(...input)=>{const at=now();await addModule(...input);moduleMs+=now()-at};
   for(const method of ['createBufferSource','createGain','createStereoPanner','createBiquadFilter','createAnalyser','createDelay','createChannelSplitter','createChannelMerger','createWaveShaper','createDynamicsCompressor']){
    const original=this[method].bind(this);
    this[method]=(...input)=>{
     nodeCounts[method]=(nodeCounts[method]||0)+1;const node=original(...input);
     if(method==='createGain')gainNodes.push(node);
     if(method==='createBufferSource'){
      liveSources++;maxLiveSources=Math.max(maxLiveSources,liveSources);
      const disconnect=node.disconnect.bind(node);let released=false;
      node.disconnect=(...args)=>{if(!released){released=true;liveSources--}return disconnect(...args)};
     }
     return node;
    };
   }
   const suspend=this.suspend.bind(this);this.suspend=(...args)=>{suspensions++;return suspend(...args)};
   const render=this.startRendering.bind(this);
   this.startRendering=()=>{
    if(legacyStereo){
     const inverted=gainNodes.filter(node=>node.gain.value===-1);
     if(inverted.length!==2)throw new Error('Legacy stereo comparison requires the unmodified benchmark imager.');
     inverted[1].gain.value=1;
    }
    timings.graphMs=now()-graphStarted;timings.moduleMs=moduleMs;renderStarted=now();status('render');return render().then(buffer=>{timings.contextRenderMs=now()-renderStarted;return buffer});
   };
  }
 };
 globalThis.AudioWorkletNode=function(ctx,name,options){
  nodeCounts[name]=(nodeCounts[name]||0)+1;
  if(variant==='no-multiband'&&name==='egghead-mastering-multiband')options={...options,processorOptions:{...options.processorOptions,settings:{enabled:false}}};
  if(variant==='no-limiter'&&name==='egghead-lookahead-limiter'){
   const delay=ctx.createDelay(1);
   delay.delayTime.value=(Math.round(options.processorOptions.lookaheadSeconds*ctx.sampleRate)+8)/ctx.sampleRate;
   delay.port={postMessage(){},start(){}};
   return delay;
  }
  const node=new NativeNode(ctx,name,options);
  if(variant==='no-multiband'&&name==='egghead-mastering-multiband'){
   const post=node.port.postMessage.bind(node.port);
   node.port.postMessage=message=>post(message.type==='settings'?{...message,settings:{enabled:false}}:message);
  }
  return node;
 };
 let maxHeartbeatDelay=0,last=now(),heapPeak=0;
 const heartbeat=setInterval(()=>{const at=now();maxHeartbeatDelay=Math.max(maxHeartbeatDelay,at-last-20);last=at;heapPeak=Math.max(heapPeak,performance.memory?.usedJSHeapSize||0)},20);
 let comparedChannels;
 try{
  status('graph');at=now();
  const rendered=await engine.render(project,buffers,{bypassMastering:variant==='bypass'});
  timings.renderTotalMs=now()-at;
  const channels=Array.from({length:rendered.numberOfChannels},(_,index)=>rendered.getChannelData(index));
  status('hash');const hashes=await Promise.all(channels.map(async channel=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',channel))).map(byte=>byte.toString(16).padStart(2,'0')).join('')));
  let comparison=null;
  if(reference||compare){
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('ehs-render-reference',1);request.onupgradeneeded=()=>request.result.createObjectStore('pcm');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
   try{
    const tx=db.transaction('pcm',reference?'readwrite':'readonly'),store=tx.objectStore('pcm');
    const key=`${size}-${variant}`;
    if(reference)store.put({channels:channels.map(channel=>new Float32Array(channel)),sampleRate:rendered.sampleRate},key);
    else{
     const saved=await new Promise((resolve,reject)=>{const request=store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
     if(!saved||saved.channels[0].length!==rendered.length)throw new Error('Reference PCM is missing or has a different length.');
     let maxError=0,squares=0,peakBefore=0,peakAfter=0;
     for(let ch=0;ch<channels.length;ch++)for(let frame=0;frame<rendered.length;frame++){
      const before=saved.channels[ch][frame],after=channels[ch][frame],error=after-before;
      maxError=Math.max(maxError,Math.abs(error));squares+=error*error;peakBefore=Math.max(peakBefore,Math.abs(before));peakAfter=Math.max(peakAfter,Math.abs(after));
     }
     comparison={maxError,rmsError:Math.sqrt(squares/(channels.length*rendered.length)),peakDifference:peakAfter-peakBefore};
     comparedChannels=saved.channels;
    }
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
   }finally{db.close()}
   if(compareAnalysis&&comparedChannels){
    const before={length:rendered.length,numberOfChannels:comparedChannels.length,sampleRate:rendered.sampleRate,getChannelData:index=>comparedChannels[index]};
    const [a,b]=await Promise.all([analyzeMasterBufferAsync(before),analyzeMasterBufferAsync(rendered)]);
    let bestLag=0,bestError=Infinity;
    for(let lag=-4;lag<=4;lag++){
     let error=0;
     for(let frame=4410;frame<88200;frame+=8)error+=(channels[0][frame+lag]-comparedChannels[0][frame])**2;
     if(error<bestError){bestError=error;bestLag=lag}
    }
    Object.assign(comparison,{loudnessDifference:b.integratedLufs-a.integratedLufs,truePeakDifference:b.truePeak-a.truePeak,alignmentFrames:bestLag});
   }
  }
  let analysis=null,encoded={};
  if(encode){
   status('analysis');at=now();
   const measured=await analyzeMasterBufferAsync(rendered);timings.analysisMs=now()-at;
   analysis={integratedLufs:measured.integratedLufs,truePeakDbtp:measured.truePeakDbtp,samplePeak:measured.samplePeak,rms:measured.rms,clippedSamples:measured.clippedSamples,stereo:measured.stereo};
   for(const format of ['wav','mp3']){
    status(`encode-${format}`);at=now();const result=await encodeExport(rendered,{format,bitDepth:24,bitrate:320,sampleRate:44100,channels:2,dither:false});timings[`${format}Ms`]=now()-at;
    status(`decode-${format}`);at=now();const decoded=await fixtureContext.decodeAudioData(await result.blob.arrayBuffer());timings[`${format}DecodeMs`]=now()-at;
    let squares=0,peak=0;for(let ch=0;ch<decoded.numberOfChannels;ch++)for(const value of decoded.getChannelData(ch)){squares+=value*value;peak=Math.max(peak,Math.abs(value))}
    encoded[format]={bytes:result.blob.size,frames:decoded.length,sampleRate:decoded.sampleRate,channels:decoded.numberOfChannels,rms:Math.sqrt(squares/(decoded.length*decoded.numberOfChannels)),peak};
   }
  }
  status('complete');await new Promise(resolve=>setTimeout(resolve,30));
  return{size,variant,legacyStereo,timings,frames:rendered.length,duration:rendered.duration,eventCount,hashes,comparison,analysis,encoded,nodeCounts,maxLiveSources,liveSourcesAfterRender:liveSources,suspensions,heapPeak,maxHeartbeatDelay,totalMs:now()-started};
 }finally{clearInterval(heartbeat);globalThis.OfflineAudioContext=NativeOffline;globalThis.AudioWorkletNode=NativeNode}
}

export function profileInstrumentGeneration(size){
 const context=new OfflineAudioContext(2,1,44100);
 const {project,buffers}=createPerformanceProject(size,(...args)=>context.createBuffer(...args));
 const at=now(),estimate=estimateProjectRender(project,buffers),estimateMs=now()-at,start=now(),beats=estimate.programSeconds*project.bpm/60;
 let count=0;
 for(const track of project.tracks)for(const event of instrumentEvents(track,buffers,project.bpm,beats,0,beats,project.patternBeats||16))count++;
 return{size,count,estimateMs,eventGenerationMs:now()-start};
}

export async function compareLegacyStereoReference(){
 return profileOfflineRender('small',{compare:true,compareAnalysis:true,legacyStereo:true});
}
