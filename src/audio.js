import {isTrackAudible} from './project-state.js';
import {createMasteringGraph,DEFAULT_MASTERING_SETTINGS,normalizeMasteringSettings} from './mastering.js';

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
export function createTrackGraph(ctx,track,output,inputGain=null,bpm=120){
 const input=ctx.createGain(),gain=inputGain||ctx.createGain(),sidechainPre=ctx.createGain(),sidechainPost=ctx.createGain(),pan=ctx.createStereoPanner(),filter=ctx.createBiquadFilter(),legacyDelay=ctx.createDelay(1),feedback=ctx.createGain(),wet=ctx.createGain(),dry=ctx.createGain(),sum=ctx.createGain(),instances=new Map(),nodes=[input,gain,sidechainPre,sidechainPost,pan,filter,legacyDelay,feedback,wet,dry,sum];
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
 return{input,gain,sidechainPre,sidechainPost,sidechainConnections:[],pan,filter,legacyDelay,feedback,wet,dry,instances,update,readMeter(){leftMeter.getFloatTimeDomainData(leftSamples);rightMeter.getFloatTimeDomainData(rightSamples);let leftPeak=0,rightPeak=0,leftSquare=0,rightSquare=0;for(let i=0;i<leftSamples.length;i++){const left=leftSamples[i],right=rightSamples[i];leftPeak=Math.max(leftPeak,Math.abs(left));rightPeak=Math.max(rightPeak,Math.abs(right));leftSquare+=left*left;rightSquare+=right*right}const reductions={};for(const[id,instance]of instances)if(instance.type==='compressor'||instance.type==='limiter')reductions[id]=instance.externalSidechain?instance.reductionDb:Math.max(0,-Number(instance.node.reduction||0));return{leftPeak,rightPeak,leftRms:Math.sqrt(leftSquare/leftSamples.length),rightRms:Math.sqrt(rightSquare/leftSamples.length),reductions}},signature:trackGraphSignature(track),disconnectSidechains(){for(const connection of this.sidechainConnections){try{connection.source.disconnect(connection.send)}catch{}try{connection.send.disconnect()}catch{}}this.sidechainConnections.length=0},disconnect(){this.disconnectSidechains();for(const node of new Set(nodes))try{node.disconnect()}catch{}}};
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
export function clipDurationSeconds(clip){const sourceDuration=Math.max(0,(clip.end-clip.start)/(clip.rate||1));return clip.loop?Math.max(0,Number(clip.duration)||sourceDuration):sourceDuration}
function scheduleClipSource(ctx,source,gain,clip,when,skip=0,duration=clipDurationSeconds(clip)){
 const rate=clip.rate||1,total=clipDurationSeconds(clip),level=Number(clip.gain??1);
 let fadeIn=Math.max(0,Number(clip.fadeIn)||0),fadeOut=Math.max(0,Number(clip.fadeOut)||0);
 const fadeTotal=fadeIn+fadeOut;
 if(fadeTotal>total&&fadeTotal>0){const scale=total/fadeTotal;fadeIn*=scale;fadeOut*=scale}
 source.loop=Boolean(clip.loop);
 if(source.loop){source.loopStart=clip.start;source.loopEnd=clip.end}
 const fadeOutStart=total-fadeOut,atSkip=level*Math.min(fadeIn?Math.min(1,skip/fadeIn):1,fadeOut?Math.max(0,Math.min(1,(total-skip)/fadeOut)):1);
 gain.gain.setValueAtTime(atSkip,when);
 if(fadeIn>skip&&fadeIn<=fadeOutStart)gain.gain.linearRampToValueAtTime(level,when+fadeIn-skip);
 if(fadeOut>0&&fadeOutStart>=skip){
  if(fadeOutStart>skip)gain.gain.setValueAtTime(level,when+fadeOutStart-skip);
  gain.gain.linearRampToValueAtTime(0,when+duration);
 }else if(fadeOut>0)gain.gain.linearRampToValueAtTime(0,when+Math.max(0,total-skip));
 source.start(when,clip.start+skip*rate);
 source.stop(when+duration);
}
export function encodeWav(channels,sampleRate){const n=channels[0].length,c=channels.length,ab=new ArrayBuffer(44+n*c*2),v=new DataView(ab);const str=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};str(0,'RIFF');v.setUint32(4,36+n*c*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,c,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*c*2,true);v.setUint16(32,c*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*c*2,true);let p=44;for(let i=0;i<n;i++)for(let j=0;j<c;j++){const x=Math.max(-1,Math.min(1,channels[j][i]||0));v.setInt16(p,x<0?x*32768:x*32767,true);p+=2}return new Blob([ab],{type:'audio/wav'})}
export function toWav(buffer){return encodeWav(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate)}
export function download(blob,name){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
export function processSample(ctx,buffer,{start=0,end=buffer.duration,gain=1,fadeIn=0,fadeOut=0,reverse=false}={}){const s=Math.max(0,Math.floor(start*buffer.sampleRate)),e=Math.min(buffer.length,Math.ceil(end*buffer.sampleRate)),length=Math.max(1,e-s),out=ctx.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);for(let ch=0;ch<out.numberOfChannels;ch++){const src=buffer.getChannelData(ch),dst=out.getChannelData(ch);for(let i=0;i<length;i++){const t=i/buffer.sampleRate;let g=gain;if(fadeIn>0)g*=Math.min(1,t/fadeIn);if(fadeOut>0)g*=Math.min(1,(length/buffer.sampleRate-t)/fadeOut);dst[i]=(src[reverse?e-1-i:s+i]||0)*g}}return out}
export function drawWave(canvas,buffer,color='#79d5c1',start=0,end=buffer?.duration||0){if(!canvas||!buffer)return;const dpr=Math.min(devicePixelRatio||1,2),w=canvas.clientWidth||300,h=canvas.clientHeight||80;canvas.width=w*dpr;canvas.height=h*dpr;const x=canvas.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,w,h);x.strokeStyle=color;x.lineWidth=1;const data=buffer.getChannelData(0),s=Math.floor(start*buffer.sampleRate),e=Math.min(data.length,Math.ceil(end*buffer.sampleRate)),step=Math.max(1,Math.floor((e-s)/w));for(let i=0;i<w;i++){let lo=1,hi=-1;for(let j=s+i*step;j<Math.min(e,s+(i+1)*step);j++){const z=data[j]||0;if(z<lo)lo=z;if(z>hi)hi=z}x.beginPath();x.moveTo(i,(1-hi)*h/2);x.lineTo(i,(1-lo)*h/2);x.stroke()}}
export class AudioEngine{
 constructor(){this.ctx=null;this.master=null;this.compressor=null;this.eq=null;this.masteringGraph=null;this.masteringSettings=normalizeMasteringSettings(DEFAULT_MASTERING_SETTINGS);this.trackNodes=new Map();this.sources=[];this.sourceNodes=new WeakMap();this.playing=false;this.startedAt=0;this.offset=0;this.timer=null;this.raf=null;this.onTick=()=>{};this.onMeter=()=>{};this.onEnd=()=>{};this.loop=false;this.bpm=120;this.masterSettings={eq:0,threshold:-12,makeup:0,volume:1};this.clipHoldUntil=new Map();this.sidechainReady=false;this.sidechainError=null;}
 async init(){if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.eq=this.ctx.createBiquadFilter();this.eq.type='highshelf';this.eq.frequency.value=4500;this.compressor=this.ctx.createDynamicsCompressor();this.master=this.ctx.createGain();this.eq.connect(this.compressor).connect(this.master);this.setMaster(this.masterSettings);this.setMastering(this.masteringSettings);if(this.ctx.audioWorklet&&typeof globalThis.AudioWorkletNode==='function'){try{await this.ctx.audioWorklet.addModule(new URL('./sidechain-processor.js',import.meta.url));this.sidechainReady=true}catch(error){this.sidechainError=error;console.error('External sidechain processor could not be loaded.',error)}}else this.sidechainError=new Error('AudioWorklet is unavailable in this browser.') }await this.ctx.resume();return this.ctx}
 setMaster(s){this.masterSettings={...this.masterSettings,...s};if(!this.ctx)return;const eq=Number(this.masterSettings.eq),threshold=Number(this.masterSettings.threshold),makeup=Number(this.masterSettings.makeup),volume=Number(this.masterSettings.volume);this.eq.gain.value=Number.isFinite(eq)?eq:0;this.compressor.threshold.value=Number.isFinite(threshold)?threshold:-12;this.compressor.ratio.value=3;this.master.gain.value=Math.max(0,Number.isFinite(volume)?volume:1)*Math.pow(10,(Number.isFinite(makeup)?makeup:0)/20)}
 setMastering(settings){this.masteringSettings=normalizeMasteringSettings(settings);if(!this.ctx||!this.master)return;if(this.masteringGraph){this.masteringGraph.update(this.masteringSettings);return}this.masteringGraph=createMasteringGraph(this.ctx,this.masteringSettings,this.ctx.destination);this.master.connect(this.masteringGraph.input)}
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
   if(!graph||graph.signature!==signature){const inputGain=graph?.gain;graph?.disconnect();graph=createTrackGraph(this.ctx,track,this.eq,inputGain,this.bpm);this.trackNodes.set(track.id,graph)}
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
 stop(reset=false){this.playing=false;clearInterval(this.timer);if(this.raf!=null)globalThis.cancelAnimationFrame?.(this.raf);for(const source of [...this.sources]){try{source.stop()}catch{}this.releaseSource(source)}if(reset)this.offset=0;this.onTick(this.offset);this.onMeter(this.readMeters())}
 position(){return this.playing?this.offset+(this.ctx.currentTime-this.startedAt):this.offset}
 readMeters(){const now=performance.now(),meters={};for(const[id,graph]of this.trackNodes){const levels=graph.readMeter(),clipped=levels.leftPeak>=.999||levels.rightPeak>=.999;if(clipped)this.clipHoldUntil.set(id,now+1000);meters[id]={...levels,clipped:(this.clipHoldUntil.get(id)||0)>now}}return meters}
 async previewNote(track,buffers,midi,duration=.35,tracks=[track]){await this.init();this.syncTracks(tracks);const rack=track.drumRack,pad=rack?.pads.find(item=>item.note===midi),sampler=track.sampler,asset=pad?.asset||(sampler&&!rack?sampler.asset:null),buffer=buffers.get(asset);if(!buffer||pad?.mute)return false;const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),pan=this.ctx.createStereoPanner(),rate=pad?2**((pad.pitch||0)/12):sampler.mode==='oneShot'?1:2**((midi-(sampler.rootNote||60)+(sampler.transpose||0)+(sampler.fineTune||0)/100)/12),start=pad?0:Math.max(0,sampler.start||0),end=pad?buffer.duration:Math.min(buffer.duration,sampler.end||buffer.duration),region=Math.max(.01,end-start),length=Math.min(duration,region/rate),now=this.ctx.currentTime; source.buffer=buffer;source.playbackRate.value=rate;if(sampler?.mode==='loop'&&!pad){source.loop=true;source.loopStart=start;source.loopEnd=end}pan.pan.value=pad?.pan||0;source.connect(gain).connect(pan).connect(this.trackNodes.get(track.id).input);if(pad||sampler.mode==='oneShot')gain.gain.value=(pad?.volume??1)*.8;else{const attack=Math.min(sampler.attack||.005,length*.4),decay=Math.min(sampler.decay||.1,Math.max(0,length-attack)*.4),sustain=Math.max(0,Math.min(1,sampler.sustain??.8)),release=Math.min(sampler.release||.03,length*.4),noteOff=now+length;gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.8,now+attack);gain.gain.linearRampToValueAtTime(.8*sustain,now+attack+decay);gain.gain.setValueAtTime(.8*sustain,Math.max(now+attack+decay,noteOff-release));gain.gain.linearRampToValueAtTime(0,noteOff)}source.start(now,start);source.stop(now+length);return true}
 async play(project,buffers,from=this.offset){
  await this.init();this.stop();this.syncTracks(project.tracks,project.bpm);this.playing=true;this.offset=from;this.startedAt=this.ctx.currentTime;
  const beat=60/project.bpm,bar=beat*4,patternBeats=project.patternBeats||16;let max=from;
  for(const track of project.tracks){
   for(const clip of track.clips){const b=buffers.get(clip.asset);if(b)max=Math.max(max,clip.bar*bar+clipDurationSeconds(clip))}
   if((track.sampler?.asset||track.drumRack)&&track.pattern?.notes?.length)max=Math.max(max,bar*(track.drumRack?patternLengthBeats(track)/4:patternBeats/4));
  }
  for(const track of project.tracks){
   const node=this.trackNodes.get(track.id);
   for(const clip of track.clips){
    const b=buffers.get(clip.asset);if(!b)continue;
    const at=clip.bar*bar,duration=clipDurationSeconds(clip);if(at+duration<=from)continue;
     const skip=Math.max(0,from-at),source=this.ctx.createBufferSource(),g=this.ctx.createGain();source.buffer=b;source.playbackRate.value=clip.rate||1;source.connect(g).connect(node.input);
    const when=this.ctx.currentTime+Math.max(0,at-from),dur=duration-skip;scheduleClipSource(this.ctx,source,g,clip,when,skip,dur);this.registerSource(source,[g]);
   }
   const sampler=track.sampler,rack=track.drumRack;if((!sampler?.asset&&!rack)||!track.pattern?.notes?.length)continue;
   const cycleBeats=trackPatternCycleBeats(track,patternBeats),cycles=Math.max(1,Math.ceil(max/(cycleBeats*beat)));
   for(let cycle=0;cycle<cycles;cycle++)for(const note of track.pattern.notes){
    const at=cycle*cycleBeats*beat+(note.beat||0)*beat;if(at<from||at>=max)continue;
    const pad=rack?.pads.find(item=>item.note===note.midi),buffer=buffers.get(pad?.asset||(rack?null:sampler?.asset));if(!buffer||pad?.mute)continue;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),voicePan=this.ctx.createStereoPanner(),rate=pad?2**((pad.pitch||0)/12):sampler.mode==='oneShot'?1:2**(((note.midi??sampler.rootNote??60)-(sampler.rootNote??60)+(sampler.transpose||0)+(sampler.fineTune||0)/100)/12),velocity=Math.max(0,Math.min(1,note.velocity??.85));
    source.buffer=buffer;source.playbackRate.value=rate;voicePan.pan.value=pad?.pan||0;
    const when=this.ctx.currentTime+at-from,start=pad?0:Math.max(0,sampler.start||0),end=pad?buffer.duration:Math.min(buffer.duration,sampler.end||buffer.duration),region=Math.max(.01,end-start);if(sampler?.mode==='loop'&&!pad){source.loop=true;source.loopStart=start;source.loopEnd=end}source.connect(gain).connect(voicePan).connect(node.input);
    source.start(when,start);
    if(pad){gain.gain.value=velocity*pad.volume;source.stop(when+region/rate)}
    else if(sampler.mode==='oneShot'){gain.gain.value=velocity;source.stop(when+region/rate)}
    else{const duration=Math.min(sampler.mode==='loop'?Math.max(.02,(note.durationBeats||.25)*beat):region/rate,Math.max(.02,(note.durationBeats||.25)*beat)),attack=Math.min(sampler.attack||.005,duration*.4),decay=Math.min(sampler.decay||.1,Math.max(0,duration-attack)*.4),sustain=Math.max(0,Math.min(1,sampler.sustain??.8)),release=Math.min(sampler.release||.03,duration*.4),noteOff=when+duration;gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(velocity,when+attack);gain.gain.linearRampToValueAtTime(velocity*sustain,when+attack+decay);gain.gain.setValueAtTime(velocity*sustain,Math.max(when+attack+decay,noteOff-release));gain.gain.linearRampToValueAtTime(0,noteOff);source.stop(noteOff)}
    this.registerSource(source,[gain,voicePan]);
   }
  }
  this.timer=setInterval(()=>{if(!this.playing)return;const p=this.position();if(project.loop&&p>=project.loopEnd*bar){this.play(project,buffers,project.loopStart*bar);return}if(p>max+.15){this.stop();this.onEnd()}},70);
  const tick=()=>{if(this.playing){this.onTick(this.position());this.onMeter(this.readMeters());this.raf=requestAnimationFrame(tick)}};tick();
 }
 async render(project,buffers,{bypassMastering=false}={}){
  const beat=60/project.bpm,bar=beat*4,patternBeats=project.patternBeats||16;let end=bar*4;
  for(const track of project.tracks){for(const clip of track.clips){const b=buffers.get(clip.asset);if(b)end=Math.max(end,clip.bar*bar+clipDurationSeconds(clip))}if((track.sampler?.asset||track.drumRack)&&track.pattern?.notes?.length)end=Math.max(end,bar*(track.drumRack?patternLengthBeats(track)/4:patternBeats/4))}
  if(end>600)throw Error('Export is limited to 10 minutes in this prototype.');
  const tail=Math.max(.3,...project.tracks.map(track=>Math.max(0,...(track.fx?.effects||[]).filter(effect=>effect.enabled).map(effect=>effect.type==='reverb'?Math.max(.1,Number(effect.params?.decay)||1.5)*1.5:effect.type==='delay'?Math.min(20,delayTimeSeconds(effect.params,project.bpm)/(1-Math.min(.85,Number(effect.params?.feedback)||0))):0),track.fx?.delay>0?(track.fx.delayTime||.25)/(1-Math.min(.75,track.fx.feedback||0)):0))),sr=44100,ctx=new OfflineAudioContext(2,Math.ceil((end+tail)*sr),sr),eq=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor(),master=ctx.createGain();
  const hasSidechain=project.tracks.some(track=>(track.fx?.effects||[]).some(effect=>effect.enabled&&effect.type==='compressor'&&effect.params?.sidechain?.enabled));
  if(hasSidechain){
   if(!ctx.audioWorklet||typeof globalThis.AudioWorkletNode!=='function')throw new Error('Offline sidechain rendering requires AudioWorklet support in this browser.');
   await ctx.audioWorklet.addModule(new URL('./sidechain-processor.js',import.meta.url));
  }
  eq.type='highshelf';eq.frequency.value=4500;eq.gain.value=this.masterSettings.eq;comp.threshold.value=this.masterSettings.threshold;comp.ratio.value=3;master.gain.value=Math.max(0,Number(this.masterSettings.volume??1))*Math.pow(10,this.masterSettings.makeup/20);eq.connect(comp).connect(master);
  if(bypassMastering)master.connect(ctx.destination);
  else master.connect(createMasteringGraph(ctx,project.mastering||this.masteringSettings,ctx.destination).input);
  const offlineTrackNodes=new Map();
  for(const track of project.tracks){
   const graph=createTrackGraph(ctx,track,eq,null,project.bpm);
   offlineTrackNodes.set(track.id,graph);
   graph.update(track,project.tracks.some(item=>item.solo),project.bpm,isTrackAudible(track,project.tracks));
   for(const clip of track.clips){const buffer=buffers.get(clip.asset);if(!buffer)continue;const source=ctx.createBufferSource(),clipGain=ctx.createGain(),when=clip.bar*bar,duration=clipDurationSeconds(clip);source.buffer=buffer;source.playbackRate.value=clip.rate||1;source.connect(clipGain).connect(graph.input);scheduleClipSource(ctx,source,clipGain,clip,when,0,duration)}
   const sampler=track.sampler,drumRack=track.drumRack;
   if((sampler?.asset||drumRack)&&track.pattern?.notes?.length){const cycleBeats=drumRack?patternLengthBeats(track):patternBeats,cycles=Math.max(1,Math.ceil(end/(cycleBeats*beat)));for(let cycle=0;cycle<cycles;cycle++)for(const note of track.pattern.notes){const when=cycle*cycleBeats*beat+(note.beat||0)*beat;if(when>=end)continue;const pad=drumRack?.pads.find(item=>item.note===note.midi),buffer=buffers.get(pad?.asset||(drumRack?null:sampler?.asset));if(!buffer||pad?.mute)continue;const source=ctx.createBufferSource(),voiceGain=ctx.createGain(),voicePan=ctx.createStereoPanner(),rate=pad?2**((pad.pitch||0)/12):sampler.mode==='oneShot'?1:2**(((note.midi??sampler.rootNote??60)-(sampler.rootNote??60)+(sampler.transpose||0)+(sampler.fineTune||0)/100)/12),start=pad?0:Math.max(0,sampler.start||0),sampleEnd=pad?buffer.duration:Math.min(buffer.duration,sampler.end||buffer.duration),region=Math.max(.01,sampleEnd-start),velocity=Math.max(0,Math.min(1,note.velocity??.85));source.buffer=buffer;source.playbackRate.value=rate;voicePan.pan.value=pad?.pan||0;if(sampler?.mode==='loop'&&!pad){source.loop=true;source.loopStart=start;source.loopEnd=sampleEnd}source.connect(voiceGain).connect(voicePan).connect(graph.input);source.start(when,start);if(pad){voiceGain.gain.value=velocity*pad.volume;source.stop(when+region/rate)}else if(sampler.mode==='oneShot'){voiceGain.gain.value=velocity;source.stop(when+region/rate)}else{const duration=Math.min(sampler.mode==='loop'?Math.max(.02,(note.durationBeats||.25)*beat):region/rate,Math.max(.02,(note.durationBeats||.25)*beat)),attack=Math.min(sampler.attack||.005,duration*.4),decay=Math.min(sampler.decay||.1,Math.max(0,duration-attack)*.4),sustain=Math.max(0,Math.min(1,sampler.sustain??.8)),release=Math.min(sampler.release||.03,duration*.4),noteOff=when+duration;voiceGain.gain.setValueAtTime(0,when);voiceGain.gain.linearRampToValueAtTime(velocity,when+attack);voiceGain.gain.linearRampToValueAtTime(velocity*sustain,when+attack+decay);voiceGain.gain.setValueAtTime(velocity*sustain,Math.max(when+attack+decay,noteOff-release));voiceGain.gain.linearRampToValueAtTime(0,noteOff);source.stop(noteOff)}}}
  }
  connectTrackSidechains(project.tracks,offlineTrackNodes,ctx);
  return ctx.startRendering();
 }
}
