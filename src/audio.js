import {isTrackAudible} from './project-state.js';
import {createMasteringGraph,DEFAULT_MASTERING_SETTINGS,disposeProcessor,normalizeMasteringSettings} from './mastering.js';
import {getWaveformRangePeaks} from './waveform.js';
import {isInstrumentClip} from './instrument-clips.js';
import {instrumentEvents,scheduleInstrumentEvent} from './instrument-playback.js';
import {renderOfflineWindows} from './offline-scheduler.js';

export const uid=()=>crypto.randomUUID();
export function patternLengthBeats(track){
 const notes=track.pattern?.notes||[];
 const lastBeat=notes.reduce((end,note)=>Math.max(end,Number(note.beat)||0, (Number(note.beat)||0)+(Number(note.durationBeats)||0)),4);
 return Math.min(64,Math.max(4,Math.ceil(lastBeat/4)*4));
}
export function trackPatternCycleBeats(track,defaultBeats=16){
 return track.drumRack?patternLengthBeats(track):Math.max(1,Number(defaultBeats)||16);
}
export const TRACK_EFFECT_DEFAULTS={
 eq:{lowCut:20,highCut:20000,bands:[{frequency:120,gain:0,q:1},{frequency:500,gain:0,q:1},{frequency:2500,gain:0,q:1},{frequency:10000,gain:0,q:1}]},
 compressor:{threshold:-24,ratio:4,attack:.01,release:.2,knee:12,makeup:0,sidechain:{enabled:false,sourceTrackId:'',position:'pre',ghost:false,detectorGain:0,lowCut:0}},
 delay:{time:.25,feedback:.25,mix:.25,sync:false,division:1},
 reverb:{decay:1.5,mix:.2,predelay:0},
 saturation:{drive:2,mix:.35},
 limiter:{threshold:-1},
 utility:{gain:0,pan:0,width:1,invert:false}
};
export function createTrackEffect(type,id=uid()){
 const params=TRACK_EFFECT_DEFAULTS[type];
 if(!params)throw new RangeError(`Unknown track effect: ${type}`);
 const cloned=Object.fromEntries(Object.entries(params).map(([key,value])=>[key,Array.isArray(value)?value.map(item=>({...item})):value&&typeof value==='object'?{...value}:value]));
 return {id,type,enabled:true,params:cloned};
}
function delayTimeSeconds(params,bpm){
 const division=Number.isFinite(Number(params?.division))?Number(params.division):1;
 return params?.sync?(60/Math.max(1,Number(bpm)||120))*Math.max(.0625,Math.min(16,division)):Number(params?.time)||.25;
}
function setEffectValues(instance,effect,bpm=120){
 const p=effect.params||{};
 const value=(key,fallback)=>Number.isFinite(Number(p[key]))?Number(p[key]):fallback;
 if(instance.type==='eq'){
  const bands=Array.isArray(p.bands)?p.bands:[{frequency:p.frequency??1000,gain:p.gain??0,q:p.q??1},{frequency:500,gain:0,q:1},{frequency:2500,gain:0,q:1},{frequency:10000,gain:0,q:1}];
  const maxFrequency=Math.min(20000,(instance.ctx?.sampleRate||40000)/2);
  instance.lowCut.frequency.value=Math.min(maxFrequency,Math.max(20,value('lowCut',20)));
  instance.highCut.frequency.value=Math.min(maxFrequency,Math.max(20,value('highCut',maxFrequency)));
  instance.nodes.forEach((node,index)=>{const band=bands[index]||{};node.frequency.value=Math.max(20,Math.min(maxFrequency,Number.isFinite(Number(band.frequency))?Number(band.frequency):[120,500,2500,10000][index]));node.gain.value=Math.max(-24,Math.min(24,Number.isFinite(Number(band.gain))?Number(band.gain):0));node.Q.value=Math.max(.1,Math.min(18,Number.isFinite(Number(band.q))?Number(band.q):1))});
 }else if(instance.type==='compressor'){
  const threshold=Math.max(-60,Math.min(0,value('threshold',-24)));
  const ratio=Math.max(1,Math.min(20,value('ratio',4)));
  const attack=Math.max(.001,Math.min(1,value('attack',.01)));
  const release=Math.max(.01,Math.min(2,value('release',.2)));
  const knee=Math.max(0,Math.min(40,value('knee',12)));
  if(instance.externalSidechain){const sidechain=p.sidechain||{};instance.node.port.postMessage({type:'settings',settings:{threshold,ratio,attack,release,knee,detectorGain:Math.max(-24,Math.min(24,Number(sidechain.detectorGain)||0)),lowCut:Math.max(0,Math.min(1000,Number(sidechain.lowCut)||0))}})}
  else{instance.node.threshold.value=threshold;instance.node.ratio.value=ratio;instance.node.attack.value=attack;instance.node.release.value=release;instance.node.knee.value=knee}
  instance.makeup.gain.value=10**(Math.max(-24,Math.min(24,value('makeup',0)))/20);
 }else if(instance.type==='delay'){
  const delayTime=delayTimeSeconds(p,bpm);
  instance.delay.delayTime.value=Math.max(.01,Math.min(2,delayTime));
  instance.feedback.gain.value=Math.max(0,Math.min(.85,value('feedback',.25)));
  const mix=Math.max(0,Math.min(1,value('mix',.25)));
  instance.dry.gain.value=1-mix;instance.wet.gain.value=mix;
 }else if(instance.type==='reverb'){
  const decay=Math.max(.1,Math.min(5,value('decay',1.5)));
  instance.predelay.delayTime.value=Math.max(0,Math.min(.25,value('predelay',0)));
  if(instance.decay!==decay){
   const impulse=instance.ctx.createBuffer(2,Math.ceil(instance.ctx.sampleRate*decay),instance.ctx.sampleRate);
   for(let channel=0;channel<impulse.numberOfChannels;channel++){const data=impulse.getChannelData(channel);for(let i=0;i<data.length;i++){const seed=Math.sin((i+1)*(channel+1)*12.9898)*43758.5453;data[i]=(seed-Math.floor(seed))*2*Math.pow(1-i/data.length,3)}}
   instance.convolver.buffer=impulse;instance.decay=decay;
  }
  const mix=Math.max(0,Math.min(1,value('mix',.2)));
  instance.dry.gain.value=1-mix;instance.wet.gain.value=mix;
 }else if(instance.type==='saturation'){
   const drive=Math.max(1,Math.min(20,value('drive',2))),mix=Math.max(0,Math.min(1,value('mix',.35)));
   if(instance.drive!==drive){const curve=new Float32Array(2048),normalizer=Math.tanh(drive);for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(drive*x)/normalizer}instance.node.curve=curve;instance.drive=drive}
   instance.dry.gain.value=1-mix;instance.wet.gain.value=mix;
  }else if(instance.type==='limiter'){
   const threshold=Math.max(-12,Math.min(0,value('threshold',-1)));
   instance.node.knee.value=0;instance.node.ratio.value=20;instance.node.attack.value=.001;instance.node.release.value=.05;
   instance.node.threshold.value=threshold;
   if(instance.threshold!==threshold){const ceiling=10**(threshold/20),curve=new Float32Array(4096);for(let i=0;i<curve.length;i++){const sample=i*2/(curve.length-1)-1;curve[i]=Math.max(-ceiling,Math.min(ceiling,sample))}instance.clipper.curve=curve;instance.threshold=threshold}
 }else if(instance.type==='utility'){
  const width=Math.max(0,Math.min(2,value('width',1))),scale=10**(Math.max(-60,Math.min(24,value('gain',0)))/20)*(p.invert?-1:1);
  instance.ll.gain.value=(1+width)*.5*scale;instance.lr.gain.value=(1-width)*.5*scale;
  instance.rl.gain.value=(1-width)*.5*scale;instance.rr.gain.value=(1+width)*.5*scale;
  instance.pan.pan.value=Math.max(-1,Math.min(1,value('pan',0)));
 }
}
function makeTrackEffect(ctx,effect,bpm=120){
 const type=effect.type;
 if(type==='eq'){const lowCut=ctx.createBiquadFilter(),nodes=Array.from({length:4},()=>{const node=ctx.createBiquadFilter();node.type='peaking';return node}),highCut=ctx.createBiquadFilter();lowCut.type='highpass';highCut.type='lowpass';lowCut.connect(nodes[0]);nodes.slice(0,-1).forEach((node,index)=>node.connect(nodes[index+1]));nodes.at(-1).connect(highCut);const instance={type,lowCut,nodes,highCut,ctx};setEffectValues(instance,effect,bpm);return{input:lowCut,output:highCut,instance}}
 if(type==='compressor'){
  const externalSidechain=Boolean(effect.params?.sidechain?.enabled);
  if(externalSidechain&&typeof globalThis.AudioWorkletNode!=='function')throw new Error('External sidechain compression requires AudioWorklet support in this browser.');
  const node=externalSidechain?new globalThis.AudioWorkletNode(ctx,'feed-forward-compressor',{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{sampleRate:ctx.sampleRate}}):ctx.createDynamicsCompressor(),makeup=ctx.createGain();
  node.connect(makeup);const instance={type,node,makeup,externalSidechain,reductionDb:0};
  if(externalSidechain)node.port.onmessage=event=>{if(event.data?.type==='reduction')instance.reductionDb=Math.max(0,Number(event.data.db)||0)};
  setEffectValues(instance,effect,bpm);return{input:node,output:makeup,instance}
 }
 if(type==='limiter'){const node=ctx.createDynamicsCompressor(),clipper=ctx.createWaveShaper();node.connect(clipper);clipper.oversample='4x';const instance={type,node,clipper};setEffectValues(instance,effect,bpm);return{input:node,output:clipper,instance}}
 if(type==='delay'){
  const input=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain(),delay=ctx.createDelay(2),feedback=ctx.createGain(),output=ctx.createGain();
  input.connect(dry).connect(output);input.connect(delay).connect(wet).connect(output);delay.connect(feedback).connect(delay);
  const instance={type,delay,feedback,dry,wet};setEffectValues(instance,effect,bpm);return{input,output,instance}
 }
 if(type==='reverb'){
  const input=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain(),predelay=ctx.createDelay(.25),convolver=ctx.createConvolver(),output=ctx.createGain();
  input.connect(dry).connect(output);input.connect(predelay).connect(convolver).connect(wet).connect(output);
  const instance={type,dry,wet,predelay,convolver,ctx};setEffectValues(instance,effect,bpm);return{input,output,instance}
 }
 if(type==='saturation'){
  const input=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain(),node=ctx.createWaveShaper(),output=ctx.createGain();
  node.oversample='2x';input.connect(dry).connect(output);input.connect(node).connect(wet).connect(output);
  const instance={type,node,dry,wet};setEffectValues(instance,effect,bpm);return{input,output,instance}
 }
 if(type==='utility'){
  const input=ctx.createGain(),splitter=ctx.createChannelSplitter(2),merger=ctx.createChannelMerger(2),ll=ctx.createGain(),lr=ctx.createGain(),rl=ctx.createGain(),rr=ctx.createGain(),pan=ctx.createStereoPanner(),output=ctx.createGain();
  input.connect(splitter);splitter.connect(ll,0);splitter.connect(lr,0);splitter.connect(rl,1);splitter.connect(rr,1);ll.connect(merger,0,0);lr.connect(merger,0,1);rl.connect(merger,0,0);rr.connect(merger,0,1);merger.connect(pan).connect(output);
  const instance={type,ll,lr,rl,rr,pan};setEffectValues(instance,effect,bpm);return{input,output,instance}
 }
 throw new RangeError(`Unknown track effect: ${type}`);
}
export function createTrackGraph(ctx,track,output,stableInput=null,bpm=120){
 const input=stableInput||ctx.createGain(),gain=ctx.createGain(),sidechainPre=ctx.createGain(),sidechainPost=ctx.createGain(),pan=ctx.createStereoPanner(),filter=ctx.createBiquadFilter(),legacyDelay=ctx.createDelay(1),feedback=ctx.createGain(),wet=ctx.createGain(),dry=ctx.createGain(),sum=ctx.createGain(),instances=new Map(),nodes=[input,gain,sidechainPre,sidechainPost,pan,filter,legacyDelay,feedback,wet,dry,sum];
 const meterSplitter=ctx.createChannelSplitter(2),leftMeter=ctx.createAnalyser(),rightMeter=ctx.createAnalyser(),meterSink=ctx.createGain();
 leftMeter.fftSize=rightMeter.fftSize=256;leftMeter.smoothingTimeConstant=rightMeter.smoothingTimeConstant=0;
 meterSink.gain.value=0;leftMeter.connect(meterSink);rightMeter.connect(meterSink);meterSink.connect(output);
 nodes.push(meterSplitter,leftMeter,rightMeter,meterSink);
 const leftSamples=new Float32Array(leftMeter.fftSize),rightSamples=new Float32Array(rightMeter.fftSize);
 input.connect(gain);input.connect(sidechainPre);gain.connect(sidechainPost);gain.connect(pan).connect(filter);filter.connect(dry).connect(sum);filter.connect(legacyDelay).connect(wet).connect(sum);legacyDelay.connect(feedback).connect(legacyDelay);
 const chain=track.fx?.effects||[];let previous=sum;
 for(const effect of chain){
  if(!effect.enabled)continue;
  const device=makeTrackEffect(ctx,effect,bpm);previous.connect(device.input);previous=device.output;instances.set(effect.id,device.instance);nodes.push(device.input,device.output,...Object.values(device.instance).flatMap(value=>Array.isArray(value)?value:[value]).filter(value=>value&&typeof value.disconnect==='function'));
 }
 previous.connect(output);previous.connect(meterSplitter);meterSplitter.connect(leftMeter,0);meterSplitter.connect(rightMeter,1);
 const update=(current,hasSolo=false,currentBpm=bpm,audible=null)=>{
  const fx=current.fx||{};
  const isAudible=audible??(!current.mute&&(!hasSolo||current.solo));
  gain.gain.value=isAudible?Number(current.volume??1):0;
  pan.pan.value=Number(current.pan)||0;
  filter.type=fx.filterType||'lowpass';filter.frequency.value=Math.min((ctx.sampleRate||40000)/2,Math.max(20,Number(fx.cutoff)||20000));filter.Q.value=Number(fx.resonance)||.7;
  legacyDelay.delayTime.value=Number(fx.delayTime)||.25;feedback.gain.value=Math.max(0,Math.min(.75,Number(fx.feedback)||0));wet.gain.value=Math.max(0,Math.min(1,Number(fx.delay)||0));dry.gain.value=1;
  for(const effect of fx.effects||[]){const instance=instances.get(effect.id);if(instance)setEffectValues(instance,effect,currentBpm)}
 };
 update(track);
 return{input,gain,sidechainPre,sidechainPost,sidechainConnections:[],pan,filter,legacyDelay,feedback,wet,dry,instances,update,readMeter(){leftMeter.getFloatTimeDomainData(leftSamples);rightMeter.getFloatTimeDomainData(rightSamples);let leftPeak=0,rightPeak=0,leftSquare=0,rightSquare=0;for(let i=0;i<leftSamples.length;i++){const left=leftSamples[i],right=rightSamples[i];leftPeak=Math.max(leftPeak,Math.abs(left));rightPeak=Math.max(rightPeak,Math.abs(right));leftSquare+=left*left;rightSquare+=right*right}const reductions={};for(const[id,instance]of instances)if(instance.type==='compressor'||instance.type==='limiter')reductions[id]=instance.externalSidechain?instance.reductionDb:Math.max(0,-Number(instance.node.reduction||0));return{leftPeak,rightPeak,leftRms:Math.sqrt(leftSquare/leftSamples.length),rightRms:Math.sqrt(rightSquare/leftSamples.length),reductions}},signature:trackGraphSignature(track),disconnectSidechains(){for(const connection of this.sidechainConnections){try{connection.source.disconnect(connection.send)}catch{}try{connection.send.disconnect()}catch{}}this.sidechainConnections.length=0},disconnect(){this.disconnectSidechains();for(const node of new Set(nodes)){disposeProcessor(node);try{node.disconnect()}catch{}}}};
}
function trackGraphSignature(track){
 return(track.fx?.effects||[]).filter(effect=>effect.enabled).map(effect=>{
  const sidechain=effect.type==='compressor'&&effect.params?.sidechain?.enabled?effect.params.sidechain:null;
  return`${effect.id}:${effect.type}${sidechain?`:${sidechain.sourceTrackId}:${sidechain.ghost?'ghost':sidechain.position||'pre'}`:''}`;
 }).join('|');
}
function connectTrackSidechains(tracks,trackNodes,ctx){
 const audibility=new Map(tracks.map(track=>[track.id,isTrackAudible(track,tracks)]));
 for(const track of tracks){
  const destination=trackNodes.get(track.id);
  for(const effect of track.fx?.effects||[]){
   const sidechain=effect.params?.sidechain;
   if(!effect.enabled||effect.type!=='compressor'||!sidechain?.enabled||!sidechain.sourceTrackId||sidechain.sourceTrackId===track.id)continue;
   const instance=destination?.instances.get(effect.id),sourceTrack=tracks.find(item=>item.id===sidechain.sourceTrackId),source=trackNodes.get(sidechain.sourceTrackId);
   if(!instance?.externalSidechain||!sourceTrack||!source)continue;
   const ghost=Boolean(sidechain.ghost),position=ghost?'pre':sidechain.position==='post'?'post':'pre';
   const sourceBus=position==='post'?source.sidechainPost:source.sidechainPre,send=ctx.createGain();
   send.gain.value=position==='pre'&&!ghost&&!audibility.get(sourceTrack.id)?0:1;
   sourceBus.connect(send);send.connect(instance.node,0,1);
   destination.sidechainConnections.push({source:sourceBus,send});
  }
 }
}
export async function renderSampleEffectChain(buffer,effects,bpm=120){
 const enabled=(effects||[]).filter(effect=>effect.enabled);
 if(!enabled.length)return buffer;
 const tail=Math.max(0,...enabled.map(effect=>effect.type==='reverb'?Math.max(.1,Number(effect.params?.decay)||1.5)*1.5:effect.type==='delay'?Math.min(20,delayTimeSeconds(effect.params,bpm)/(1-Math.min(.85,Number(effect.params?.feedback)||0))):0));
 const frames=Math.ceil((buffer.duration+tail)*buffer.sampleRate),Context=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!Context)throw new Error('Offline audio processing is not supported in this browser.');
 const context=new Context(2,frames,buffer.sampleRate),track={id:'sample-preview',volume:1,pan:0,mute:false,solo:false,fx:{effects:enabled}};
 const graph=createTrackGraph(context,track,context.destination,null,bpm),source=context.createBufferSource();
 source.buffer=buffer;source.connect(graph.input);source.start(0);
 return context.startRendering();
}
export function clipDurationSeconds(clip,bpm=120){if(isInstrumentClip(clip))return clip.durationBeats*60/bpm;const sourceDuration=Math.max(0,(clip.end-clip.start)/(clip.rate||1));return clip.loop?Math.max(0,Number(clip.duration)||sourceDuration):sourceDuration}
export function scheduleClipSource(ctx,source,gain,clip,when,skip=0,duration=clipDurationSeconds(clip)){
 const rate=clip.rate||1,total=clip.envelopeDuration??clipDurationSeconds(clip),level=Number(clip.gain??1),envelopeSkip=skip+(clip.envelopeOffset||0);
 let fadeIn=Math.max(0,Number(clip.fadeIn)||0),fadeOut=Math.max(0,Number(clip.fadeOut)||0);
 const fadeTotal=fadeIn+fadeOut;
 if(fadeTotal>total&&fadeTotal>0){const scale=total/fadeTotal;fadeIn*=scale;fadeOut*=scale}
 source.loop=Boolean(clip.loop);
 if(source.loop){source.loopStart=clip.start;source.loopEnd=clip.end}
 const fadeOutStart=total-fadeOut,atSkip=level*Math.min(fadeIn?Math.min(1,envelopeSkip/fadeIn):1,fadeOut?Math.max(0,Math.min(1,(total-envelopeSkip)/fadeOut)):1),endEnvelope=envelopeSkip+duration;
 gain.gain.setValueAtTime(atSkip,when);
 if(fadeIn>envelopeSkip){
  const point=Math.min(endEnvelope,fadeIn);
  gain.gain.linearRampToValueAtTime(level*Math.min(1,point/fadeIn),when+point-envelopeSkip);
 }
 if(fadeOut>0&&endEnvelope>fadeOutStart){
  if(fadeOutStart>envelopeSkip)gain.gain.setValueAtTime(level,when+fadeOutStart-envelopeSkip);
  gain.gain.linearRampToValueAtTime(level*Math.max(0,(total-endEnvelope)/fadeOut),when+duration);
 }
 const phase=(clip.loopOffset||0)+skip*rate;
 source.start(when,clip.start+(clip.loop?phase%(clip.end-clip.start):skip*rate));
 source.stop(when+duration);
}
export function encodeWav(channels,sampleRate){const n=channels[0].length,c=channels.length,ab=new ArrayBuffer(44+n*c*2),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};str(0,'RIFF');v.setUint32(4,36+n*c*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,c,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*c*2,true);v.setUint16(32,c*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*c*2,true);let p=44;for(let i=0;i<n;i++)for(let j=0;j<c;j++){const x=Math.max(-1,Math.min(1,channels[j][i]||0));v.setInt16(p,x<0?x*32768:x*32767,true);p+=2}return new Blob([ab],{type:'audio/wav'})}
export function toWav(buffer){return encodeWav(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate)}
export function download(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
export function processSample(ctx,buffer,{start=0,end=buffer.duration,gain=1,fadeIn=0,fadeOut=0,reverse=false}={}){const s=Math.max(0,Math.floor(start*buffer.sampleRate)),e=Math.min(buffer.length,Math.ceil(end*buffer.sampleRate)),length=Math.max(1,e-s),out=ctx.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);for(let ch=0;ch<out.numberOfChannels;ch++){const src=buffer.getChannelData(ch),dst=out.getChannelData(ch);for(let i=0;i<length;i++){const t=i/buffer.sampleRate;let g=gain;if(fadeIn>0)g*=Math.min(1,t/fadeIn);if(fadeOut>0)g*=Math.min(1,(length/buffer.sampleRate-t)/fadeOut);dst[i]=(src[reverse?e-1-i:s+i]||0)*g}}return out}
export function drawWave(canvas,buffer,color='#79d5c1',start=0,end=buffer?.duration||0){if(!canvas||!buffer)return;const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth||300,h=canvas.clientHeight||80;canvas.width=w*dpr;canvas.height=h*dpr;const x=canvas.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);x.strokeStyle=color;x.lineWidth=1;const s=Math.floor(start*buffer.sampleRate),e=Math.min(buffer.length,Math.ceil(end*buffer.sampleRate)),step=Math.max(1,Math.floor((e-s)/w));for(let i=0;i<w;i++){const {minimum:lo,maximum:hi}=getWaveformRangePeaks(buffer,0,s+i*step,Math.min(e,s+(i+1)*step));x.beginPath();x.moveTo(i,(1-hi)*h/2);x.lineTo(i,(1-lo)*h/2);x.stroke()}}
export function estimateProjectRender(project,buffers){
 const beat=60/project.bpm,bar=beat*4,patternBeats=project.patternBeats||16;
 let end=bar*4;
 for(const track of project.tracks){
  for(const clip of track.clips){if(isInstrumentClip(clip)||buffers.get(clip.asset))end=Math.max(end,clip.bar*bar+clipDurationSeconds(clip,project.bpm))}
  if(!track.patterns&&(track.sampler?.asset||track.drumRack)&&track.pattern?.notes?.length)end=Math.max(end,bar*(track.drumRack?patternLengthBeats(track)/4:patternBeats/4));
 }
 let finalInstrumentAudioEnd=end;
 for(const track of project.tracks)for(const event of instrumentEvents(track,buffers,project.bpm,end/beat,0,end/beat,patternBeats))finalInstrumentAudioEnd=Math.max(finalInstrumentAudioEnd,Math.min(event.until,event.at+event.voice.duration));
 const tails=project.tracks.map(track=>Math.max(0,
  ...(track.fx?.effects||[]).filter(effect=>effect.enabled).map(effect=>effect.type==='reverb'
   ?Math.max(.1,Number(effect.params?.decay)||1.5)*1.5
   :effect.type==='delay'?Math.min(20,delayTimeSeconds(effect.params,project.bpm)/(1-Math.min(.85,Number(effect.params?.feedback)||0))):0),
  track.fx?.delay>0?(track.fx.delayTime||.25)/(1-Math.min(.75,track.fx.feedback||0)):0
 ));
 const effectTail=Math.max(.3,...tails),tail=effectTail+Math.max(0,finalInstrumentAudioEnd-end);
 return{programSeconds:end,tailSeconds:tail,durationSeconds:end+tail};
}
function watchGraphProcessors(graph,onError){
 const nodes=graph.nodes||[...graph.instances.values()].map(instance=>instance.node);
 for(const node of new Set(nodes))if(node?.port)node.onprocessorerror=()=>onError(new Error('AudioWorklet processing failed. Playback stopped; retry Play to rebuild the audio graph.'));
}
export class AudioEngine{
 handleProcessorError(error){
  this.stop();
  for(const graph of this.trackNodes.values())graph.disconnect();
  this.trackNodes.clear();
  this.masteringGraph?.disconnect();this.masteringGraph=null;this.master?.disconnect();
  if(this.onError)this.onError(error);else console.error(error);
 }
 constructor(){this.ctx=null;this.master=null;this.compressor=null;this.eq=null;this.masteringGraph=null;this.masteringSettings=normalizeMasteringSettings(DEFAULT_MASTERING_SETTINGS);this.trackNodes=new Map();this.sources=[];this.sourceNodes=new WeakMap();this.playing=false;this.startedAt=0;this.offset=0;this.timer=null;this.raf=null;this.onTick=()=>{};this.onMeter=()=>{};this.onEnd=()=>{};this.loop=false;this.bpm=120;this.masterSettings={eq:0,threshold:-12,makeup:0,volume:1};this.clipHoldUntil=new Map();this.sidechainReady=false;this.sidechainError=null;this.masteringLimiterReady=false;this.masteringLimiterError=null;}
 async init(){if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.audioWorklet&&typeof globalThis.AudioWorkletNode==='function'){try{await this.ctx.audioWorklet.addModule(new URL('./sidechain-processor.js',import.meta.url));this.sidechainReady=true}catch(error){this.sidechainError=error;console.error('External sidechain processor could not be loaded.',error)}try{await this.ctx.audioWorklet.addModule(new URL('./mastering-processor.js',import.meta.url));this.ctx.masteringLimiterReady=true}catch(error){this.masteringLimiterError=error;console.error('Mastering limiter processor could not be loaded.',error)}}else{this.sidechainError=new Error('AudioWorklet is unavailable in this browser.');this.masteringLimiterError=this.sidechainError}this.eq=this.ctx.createBiquadFilter();this.eq.type='highshelf';this.eq.frequency.value=4500;this.compressor=this.ctx.createDynamicsCompressor();this.master=this.ctx.createGain();this.eq.connect(this.compressor).connect(this.master);this.setMaster(this.masterSettings);this.setMastering(this.masteringSettings)}await this.ctx.resume();if(!this.masteringGraph)this.setMastering(this.masteringSettings);return this.ctx}
 setMaster(s){this.masterSettings={...this.masterSettings,...s};if(!this.ctx)return;const eq=Number(this.masterSettings.eq),threshold=Number(this.masterSettings.threshold),makeup=Number(this.masterSettings.makeup),volume=Number(this.masterSettings.volume);this.eq.gain.value=Number.isFinite(eq)?eq:0;this.compressor.threshold.value=Number.isFinite(threshold)?threshold:-12;this.compressor.ratio.value=3;this.master.gain.value=Math.max(0,Number.isFinite(volume)?volume:1)*Math.pow(10,(Number.isFinite(makeup)?makeup:0)/20)}
 setMastering(settings){const next=normalizeMasteringSettings(settings);if(!this.ctx||!this.master){this.masteringSettings=next;return}this.masteringLimiterReady=Boolean(this.ctx.masteringLimiterReady);if(this.masteringGraph){this.masteringGraph.update(next);this.masteringSettings=next;return}const graph=createMasteringGraph(this.ctx,next,this.ctx.destination);this.master.connect(graph.input);this.masteringGraph=graph;watchGraphProcessors(graph,error=>this.handleProcessorError(error));this.masteringSettings=next}
 syncTracks(tracks,bpm=this.bpm){
  if(!this.ctx)return;
  const needsSidechain=tracks.some(track=>(track.fx?.effects||[]).some(effect=>effect.enabled&&effect.type==='compressor'&&effect.params?.sidechain?.enabled));
  if(needsSidechain&&!this.sidechainReady)throw this.sidechainError||new Error('External sidechain compression is unavailable because its AudioWorklet processor has not been initialized.');
  this.bpm=Number.isFinite(Number(bpm))&&Number(bpm)>0?Number(bpm):120;
  const ids=new Set(tracks.map(track=>track.id)),solo=tracks.some(track=>track.solo);
  for(const graph of this.trackNodes.values())graph.disconnectSidechains();
  for(const [id,graph] of this.trackNodes)if(!ids.has(id)){graph.disconnect();this.trackNodes.delete(id);this.clipHoldUntil.delete(id)}
  for(const track of tracks){
   const signature=trackGraphSignature(track);
   let graph=this.trackNodes.get(track.id);
   if(!graph||graph.signature!==signature){const input=graph?.input;graph?.disconnect();graph=createTrackGraph(this.ctx,track,this.eq,input,this.bpm);watchGraphProcessors(graph,error=>this.handleProcessorError(error));this.trackNodes.set(track.id,graph)}
   graph.update(track,solo,this.bpm,isTrackAudible(track,tracks));
  }
  connectTrackSidechains(tracks,this.trackNodes,this.ctx);
 }
 registerSource(source,nodes=[]){
  this.sources.push(source);
  this.sourceNodes.set(source,nodes);
  source.onended=()=>this.releaseSource(source);
 }
 releaseSource(source){
  const index=this.sources.indexOf(source);
  if(index<0)return;
  this.sources.splice(index,1);
  for(const node of [source,...(this.sourceNodes.get(source)||[])])try{node.disconnect()}catch{}
  this.sourceNodes.delete(source);
 }
 stop(reset=false){this.offset=reset?0:this.position();this.playing=false;clearInterval(this.timer);if(this.raf!=null)globalThis.cancelAnimationFrame?.(this.raf);for(const source of [...this.sources]){try{source.stop()}catch{}this.releaseSource(source)}this.onTick(this.offset);this.onMeter(this.readMeters())}
 position(){
  const position=this.playing?this.offset+Math.max(0,this.ctx.currentTime-this.startedAt):this.offset;
  const loop=this.transportLoop;
  return this.playing&&loop&&position>=loop.end?loop.start+(position-loop.start)%(loop.end-loop.start):position;
 }
 readMeters(){const now=performance.now(),meters={};for(const[id,graph]of this.trackNodes){const levels=graph.readMeter(),clipped=levels.leftPeak>=.999||levels.rightPeak>=.999;if(clipped)this.clipHoldUntil.set(id,now+1000);meters[id]={...levels,clipped:(this.clipHoldUntil.get(id)||0)>now}}return meters}
 async previewNote(track,buffers,midi,duration=.35,tracks=[track]){await this.init();this.syncTracks(tracks);const rack=track.drumRack,pad=rack?.pads.find(item=>item.note===midi),sampler=track.sampler,asset=pad?.asset||(sampler&&!rack?sampler.asset:null),buffer=buffers.get(asset);if(!buffer||pad?.mute)return false;const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),pan=this.ctx.createStereoPanner(),rate=pad?2**((pad.pitch||0)/12):sampler.mode==='oneShot'?1:2**((midi-(sampler.rootNote||60)+(sampler.transpose||0)+(sampler.fineTune||0)/100)/12),start=pad?0:Math.max(0,sampler.start||0),end=pad?buffer.duration:Math.min(buffer.duration,sampler.end||buffer.duration),region=Math.max(.01,end-start),length=Math.min(duration,region/rate),now=this.ctx.currentTime; source.buffer=buffer;source.playbackRate.value=rate;if(sampler?.mode==='loop'&&!pad){source.loop=true;source.loopStart=start;source.loopEnd=end}pan.pan.value=pad?.pan||0;source.connect(gain).connect(pan).connect(this.trackNodes.get(track.id).input);if(pad||sampler.mode==='oneShot')gain.gain.value=(pad?.volume??1)*.8;else{const attack=Math.min(sampler.attack||.005,length*.4),decay=Math.min(sampler.decay||.1,Math.max(0,length-attack)*.4),sustain=Math.max(0,Math.min(1,sampler.sustain??.8)),release=Math.min(sampler.release||.03,length*.4),noteOff=now+length;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.8,now+attack);gain.gain.linearRampToValueAtTime(.8*sustain,now+attack+decay);gain.gain.setValueAtTime(.8*sustain,Math.max(now+attack+decay,noteOff-release));gain.gain.linearRampToValueAtTime(0,noteOff)}source.start(now,start);source.stop(now+length);this.registerSource(source,[gain,pan]);return true}
 async play(project,buffers,from=this.offset,{when}={}){
  await this.init();this.stop();this.syncTracks(project.tracks,project.bpm);
  this.playing=true;this.playbackSignature=null;this.updatePlayback(project,buffers,from,when);
  this.timer=setInterval(()=>this.scheduleAhead(),25);
  const tick=()=>{if(this.playing){this.onTick(this.position());this.onMeter(this.readMeters());this.raf=requestAnimationFrame(tick)}};tick();
 }
 updatePlayback(project,buffers,from,when){
  if(!this.playing)return;
  const signature=JSON.stringify([project.bpm,project.loop,project.loopStart,project.loopEnd,project.patternBeats,project.tracks.map(track=>[track.id,track.clips,track.pattern,track.patterns,track.sampler,track.drumRack])]);
  this.playbackProject=project;this.playbackBuffers=buffers;
  if(signature===this.playbackSignature&&from===undefined)return;
  const position=from??this.position(),bar=240/project.bpm,start=project.loopStart*bar,end=project.loopEnd*bar;
  this.transportLoop=project.loop&&Number.isFinite(start)&&Number.isFinite(end)&&end>start?{start,end}:null;
  this.offset=this.transportLoop&&(position<start||position>=end)?start:Math.max(0,position);
  this.startedAt=Math.max(this.ctx.currentTime,when??this.ctx.currentTime);this.scheduleTime=this.startedAt;this.schedulePosition=this.offset;this.scheduleInitial=true;
  for(const source of [...this.sources]){try{source.stop()}catch{}this.releaseSource(source)}
  this.playbackSignature=signature;this.scheduleAhead();
 }
 scheduleAhead(){
  if(!this.playing)return;
  const horizon=this.ctx.currentTime+.15;
  if(this.scheduleTime<this.ctx.currentTime){
   for(const source of [...this.sources]){try{source.stop()}catch{}this.releaseSource(source)}
   this.schedulePosition=this.position();this.scheduleTime=this.ctx.currentTime;this.scheduleInitial=true;
  }
  while(this.scheduleTime<horizon){
   const loop=this.transportLoop,remaining=loop?loop.end-this.schedulePosition:Infinity;
   const duration=Math.min(horizon-this.scheduleTime,remaining);
   if(duration>0)this.scheduleRange(this.playbackProject,this.playbackBuffers,this.schedulePosition,this.schedulePosition+duration,this.scheduleTime,this.scheduleInitial,loop?.end??Infinity);
   this.scheduleTime+=duration;this.schedulePosition+=duration;this.scheduleInitial=false;
   if(loop&&this.schedulePosition>=loop.end-1e-10){this.schedulePosition=loop.start;this.scheduleInitial=true}
   if(duration<=0&&!loop)break;
  }
 }
 scheduleRange(project,buffers,from,to,contextStart,initial,stopAt){
  const beat=60/project.bpm,bar=beat*4,patternBeats=project.patternBeats||16;let max=this.transportLoop?.end||0;
  for(const track of project.tracks){
   for(const clip of track.clips){const b=buffers.get(clip.asset);if(b||isInstrumentClip(clip))max=Math.max(max,clip.bar*bar+clipDurationSeconds(clip,project.bpm))}
   if(!track.patterns&&(track.sampler?.asset||track.drumRack)&&track.pattern?.notes?.length)max=Math.max(max,bar*(track.drumRack?patternLengthBeats(track)/4:patternBeats/4));
  }
  for(const track of project.tracks){
   const node=this.trackNodes.get(track.id);
   for(const clip of track.clips){
    const b=buffers.get(clip.asset);if(!b||clip.mute)continue;
    const at=clip.bar*bar,duration=clipDurationSeconds(clip);if(at>=to||at+duration<=from||(!initial&&at<from))continue;
     const skip=Math.max(0,from-at),source=this.ctx.createBufferSource(),g=this.ctx.createGain();source.buffer=b;source.playbackRate.value=clip.rate||1;source.connect(g).connect(node.input);
    const when=contextStart+Math.max(0,at-from),dur=Math.min(duration-skip,stopAt-Math.max(at,from));scheduleClipSource(this.ctx,source,g,clip,when,skip,dur);this.registerSource(source,[g]);
   }
   for(const event of instrumentEvents(track,buffers,project.bpm,max/beat,from/beat,to/beat,patternBeats)){
    const voice=scheduleInstrumentEvent(this.ctx,node.input,event,from,to,contextStart,initial,stopAt);
    if(voice)this.registerSource(voice.source,voice.nodes);
   }
  }
 }
 async render(project,buffers,{bypassMastering=false,signal,onProgress}={}){
  if(signal?.aborted)throw signal.reason||new DOMException('Offline rendering cancelled.','AbortError');
  project=structuredClone(project);buffers=new Map(buffers);
  const masterSettings={...this.masterSettings};
  const beat=60/project.bpm,bar=beat*4,patternBeats=project.patternBeats||16,{programSeconds:end,tailSeconds:tail}=estimateProjectRender(project,buffers);
  if(end>600)throw Error('Export is limited to 10 minutes in this prototype.');
  const sr=44100,masteringSettings=normalizeMasteringSettings(project.mastering||this.masteringSettings);
  const hasMasteringLimiter=!bypassMastering&&typeof globalThis.AudioWorkletNode==='function',latencyFrames=hasMasteringLimiter?Math.round(masteringSettings.limiter.lookaheadMs/1000*sr)+8:0,ctx=new OfflineAudioContext(2,Math.ceil((end+tail)*sr)+latencyFrames,sr),eq=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor(),master=ctx.createGain();
  const hasSidechain=project.tracks.some(track=>(track.fx?.effects||[]).some(effect=>effect.enabled&&effect.type==='compressor'&&effect.params?.sidechain?.enabled));
  const offlineTrackNodes=new Map(),voices=new Set();let masteringGraph=null,disposed=false;
  const releaseVoices=(time=Infinity)=>{
   for(const voice of voices)if(voice.endTime<=time){
    voice.source.disconnect();for(const node of voice.nodes)node.disconnect();voices.delete(voice);
   }
  };
  const dispose=()=>{
   if(disposed)return;disposed=true;
   releaseVoices();
   for(const graph of offlineTrackNodes.values())graph.disconnect();
   masteringGraph?.disconnect();eq.disconnect();comp.disconnect();master.disconnect();
  };
  try{
  if(hasSidechain){
   if(!ctx.audioWorklet||typeof globalThis.AudioWorkletNode!=='function')throw new Error('Offline sidechain rendering requires AudioWorklet support in this browser.');
   await ctx.audioWorklet.addModule(new URL('./sidechain-processor.js',import.meta.url));
  }
  if(hasMasteringLimiter){
   if(!ctx.audioWorklet)throw new Error('Offline mastering limiter rendering requires AudioWorklet support in this browser.');
   await ctx.audioWorklet.addModule(new URL('./mastering-processor.js',import.meta.url));
   ctx.masteringLimiterReady=true;
  }else if(!bypassMastering&&masteringSettings.limiter.enabled)throw this.masteringLimiterError||new Error('Offline mastering limiter rendering requires AudioWorklet support in this browser.');
  eq.type='highshelf';eq.frequency.value=4500;eq.gain.value=masterSettings.eq;comp.threshold.value=masterSettings.threshold;comp.ratio.value=3;master.gain.value=Math.max(0,Number(masterSettings.volume??1))*Math.pow(10,masterSettings.makeup/20);eq.connect(comp).connect(master);
  if(bypassMastering)master.connect(ctx.destination);
  if(!bypassMastering){masteringGraph=createMasteringGraph(ctx,masteringSettings,ctx.destination);master.connect(masteringGraph.input)}
  let rejectProcessor;
  const processorFailure=new Promise((_,reject)=>{rejectProcessor=reject});
  if(masteringGraph)watchGraphProcessors(masteringGraph,rejectProcessor);
  for(const track of project.tracks){
   const graph=createTrackGraph(ctx,track,eq,null,project.bpm);
   offlineTrackNodes.set(track.id,graph);
   watchGraphProcessors(graph,rejectProcessor);
   graph.update(track,project.tracks.some(item=>item.solo),project.bpm,isTrackAudible(track,project.tracks));
  }
  connectTrackSidechains(project.tracks,offlineTrackNodes,ctx);
  const schedule=(from,to)=>{
   if(signal?.aborted)throw signal.reason||new DOMException('Offline rendering cancelled.','AbortError');
   for(const track of project.tracks){
    const graph=offlineTrackNodes.get(track.id);
    for(const clip of track.clips){
     const when=clip.bar*bar,buffer=buffers.get(clip.asset);
     if(!buffer||clip.mute||when<from||when>=to)continue;
     const source=ctx.createBufferSource(),clipGain=ctx.createGain(),duration=clipDurationSeconds(clip);
     source.buffer=buffer;source.playbackRate.value=clip.rate||1;source.connect(clipGain).connect(graph.input);
     const voice={source,nodes:[clipGain],endTime:when+duration};voices.add(voice);
     scheduleClipSource(ctx,source,clipGain,clip,when,0,duration);
    }
    if(from>=end)continue;
    for(const event of instrumentEvents(track,buffers,project.bpm,end/beat,from/beat,Math.min(end,to)/beat,patternBeats)){
     const voice=scheduleInstrumentEvent(ctx,graph.input,event,from,Math.min(end,to),from,from===0);
     if(voice)voices.add(voice);
    }
   }
  };
  const rendered=await renderOfflineWindows(ctx,{schedule,release:releaseVoices,dispose,signal,failure:processorFailure,onProgress});
  if(!masteringGraph?.latencyFrames)return rendered;
  const trimFrames=masteringGraph.latencyFrames,trimmed=ctx.createBuffer(rendered.numberOfChannels,rendered.length-trimFrames,rendered.sampleRate);
  for(let channel=0;channel<rendered.numberOfChannels;channel++)trimmed.getChannelData(channel).set(rendered.getChannelData(channel).subarray(trimFrames));
  return trimmed;
  }finally{
   dispose();
  }
 }
}
