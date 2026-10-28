import {analyzeLoudness,analyzeStereo} from './mastering-dsp.js';
import {masterEqFilters,unitToFrequency} from './eq-model.js';

const MASTERING_MODULE_ORDER=['eq','saturation','imager','multiband'];
const MULTIBAND_DEFAULTS={
 enabled:false,crossovers:[250,2500],
 bands:[
  {enabled:true,solo:false,threshold:-24,ratio:2,attack:.01,release:.15,knee:6,makeup:0,outputGain:0},
  {enabled:true,solo:false,threshold:-22,ratio:2,attack:.01,release:.15,knee:6,makeup:0,outputGain:0},
  {enabled:true,solo:false,threshold:-20,ratio:2,attack:.005,release:.12,knee:6,makeup:0,outputGain:0}
 ]
};

const BAND_DEFAULTS=[
 {type:'lowshelf',frequency:80,gain:0,q:.707,enabled:true},
 {type:'peaking',frequency:180,gain:0,q:1,enabled:true},
 {type:'peaking',frequency:600,gain:0,q:1,enabled:true},
 {type:'peaking',frequency:1800,gain:0,q:1,enabled:true},
 {type:'peaking',frequency:6000,gain:0,q:1,enabled:true},
 {type:'highshelf',frequency:12000,gain:0,q:.707,enabled:true}
];

export const DEFAULT_MASTERING_SETTINGS=Object.freeze({
 mode:'basic',
 preset:'Clean / Transparent',
 eq:{enabled:true,lowCut:20,highCut:20000,bands:BAND_DEFAULTS},
 saturation:{enabled:false,drive:1.5,mix:.15},
 imager:{enabled:false,width:1},
 multiband:MULTIBAND_DEFAULTS,
 chainOrder:MASTERING_MODULE_ORDER,
 chainBypass:false,
 limiter:{enabled:false,ceiling:-1,lookaheadMs:5,release:.1},
 inputGainDb:0,
 outputGainDb:0
});

export const MASTERING_PRESETS=Object.freeze({
 'Clean / Transparent':{eq:{enabled:true,lowCut:20,highCut:20000,bands:BAND_DEFAULTS},saturation:{enabled:false,drive:1.5,mix:.15},imager:{enabled:false,width:1},limiter:{enabled:false,ceiling:-1},outputGainDb:0},
 'Electronic / EDM':{eq:{enabled:true,lowCut:28,highCut:19500,bands:BAND_DEFAULTS.map((band,index)=>({...band,gain:[1.2,-.4,.2,.6,1,1.2][index]}))},saturation:{enabled:true,drive:1.8,mix:.12},imager:{enabled:true,width:1.12},limiter:{enabled:true,ceiling:-1},outputGainDb:0},
 'Hip-Hop':{eq:{enabled:true,lowCut:25,highCut:19000,bands:BAND_DEFAULTS.map((band,index)=>({...band,gain:[1.4,.5,-.4,.2,.6,.4][index]}))},saturation:{enabled:true,drive:1.5,mix:.1},imager:{enabled:true,width:1.04},limiter:{enabled:true,ceiling:-1},outputGainDb:0},
 'Pop':{eq:{enabled:true,lowCut:30,highCut:19500,bands:BAND_DEFAULTS.map((band,index)=>({...band,gain:[.4,.1,-.3,.4,.7,.5][index]}))},saturation:{enabled:false,drive:1.5,mix:.15},imager:{enabled:true,width:1.06},limiter:{enabled:true,ceiling:-1},outputGainDb:0},
 'Acoustic':{eq:{enabled:true,lowCut:35,highCut:18000,bands:BAND_DEFAULTS.map((band,index)=>({...band,gain:[-.5,.2,.3,.2,-.3,-.4][index]}))},saturation:{enabled:false,drive:1.2,mix:.08},imager:{enabled:false,width:1},limiter:{enabled:false,ceiling:-1},outputGainDb:0},
 'Warm / Vintage':{eq:{enabled:true,lowCut:25,highCut:16000,bands:BAND_DEFAULTS.map((band,index)=>({...band,gain:[.3,.5,.4,.1,-.6,-1][index]}))},saturation:{enabled:true,drive:1.35,mix:.18},imager:{enabled:false,width:1},limiter:{enabled:false,ceiling:-1},outputGainDb:0}
});

export function normalizeMasteringSettings(settings={}){
 const order=Array.isArray(settings.chainOrder)?settings.chainOrder.filter((name,index,list)=>MASTERING_MODULE_ORDER.includes(name)&&list.indexOf(name)===index):MASTERING_MODULE_ORDER;
 const result={
  ...DEFAULT_MASTERING_SETTINGS,
  ...settings,
  eq:{...DEFAULT_MASTERING_SETTINGS.eq,...settings.eq,bands:BAND_DEFAULTS.map((band,index)=>({...band,...settings.eq?.bands?.[index]}))},
  saturation:{...DEFAULT_MASTERING_SETTINGS.saturation,...settings.saturation},
  imager:{...DEFAULT_MASTERING_SETTINGS.imager,...settings.imager},
  multiband:{...MULTIBAND_DEFAULTS,...settings.multiband,crossovers:[...(settings.multiband?.crossovers||MULTIBAND_DEFAULTS.crossovers)],bands:MULTIBAND_DEFAULTS.bands.map((band,index)=>({...band,...settings.multiband?.bands?.[index]}))},
  chainOrder:[...order,...MASTERING_MODULE_ORDER.filter(name=>!order.includes(name))],
  chainBypass:Boolean(settings.chainBypass),
  limiter:{...DEFAULT_MASTERING_SETTINGS.limiter,...settings.limiter,ceiling:settings.limiter?.ceiling??settings.limiter?.threshold??DEFAULT_MASTERING_SETTINGS.limiter.ceiling},
  inputGainDb:clampNumber(settings.inputGainDb,-24,24,0)
 };
 result.mode=result.mode==='advanced'?'advanced':'basic';
 result.outputGainDb=clampNumber(result.outputGainDb,-24,24,0);
 result.eq.lowCut=clampNumber(result.eq.lowCut,10,1000,20);
 result.eq.highCut=clampNumber(result.eq.highCut,1000,22000,20000);
 for(const band of result.eq.bands){
  if(!['lowshelf','peaking','highshelf'].includes(band.type))band.type='peaking';
  band.frequency=clampNumber(band.frequency,20,20000,1000);
  band.gain=clampNumber(band.gain,-18,18,0);
  band.q=clampNumber(band.q,.1,12,1);
  band.enabled=Boolean(band.enabled);
 }
 result.saturation.drive=clampNumber(result.saturation.drive,1,12,1.5);
 result.saturation.mix=clampNumber(result.saturation.mix,0,1,.15);
 result.imager.width=clampNumber(result.imager.width,0,1.5,1);
 const firstCrossover=clampNumber(result.multiband.crossovers[0],40,10000,250),secondCrossover=clampNumber(result.multiband.crossovers[1],50,20000,2500);
 result.multiband.crossovers=[firstCrossover,Math.max(firstCrossover*1.25,secondCrossover)];
 result.multiband.bands=result.multiband.bands.map(band=>({
  enabled:Boolean(band.enabled),solo:Boolean(band.solo),threshold:clampNumber(band.threshold,-60,0,-18),
  ratio:clampNumber(band.ratio,1,20,2),attack:clampNumber(band.attack,.001,1,.01),
  release:clampNumber(band.release,.01,2,.15),knee:clampNumber(band.knee,0,24,6),
  makeup:clampNumber(band.makeup,-24,24,0),outputGain:clampNumber(band.outputGain,-24,24,0)
 }));
 result.limiter.ceiling=clampNumber(result.limiter.ceiling,-6,0,-1);
 result.limiter.lookaheadMs=clampNumber(result.limiter.lookaheadMs,1,100,5);
 result.limiter.release=clampNumber(result.limiter.release,.005,2,.1);
 for(const key of ['enabled']){result.eq[key]=Boolean(result.eq[key]);result.saturation[key]=Boolean(result.saturation[key]);result.imager[key]=Boolean(result.imager[key]);result.multiband[key]=Boolean(result.multiband[key]);result.limiter[key]=Boolean(result.limiter[key])}
 return result;
}

function clampNumber(value,min,max,fallback){
 const number=Number(value);
 return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
}

function setParam(param,value,ctx){
 if(param?.setTargetAtTime)param.setTargetAtTime(value,ctx.currentTime,.015);
 else if(param)param.value=value;
}

function makeSaturationCurve(drive){
 const curve=new Float32Array(2048),normalizer=Math.tanh(drive);
 for(let index=0;index<curve.length;index++){
  const input=index*2/(curve.length-1)-1;
  curve[index]=Math.tanh(input*drive)/normalizer;
 }
 return curve;
}

export function disposeProcessor(node){
 if(!node.port)return;
 node.onprocessorerror=null;node.port.onmessage=null;
 node.port.postMessage({type:'dispose'});node.port.close?.();
}

export function createMasteringGraph(ctx,settings,destination){
 const current=normalizeMasteringSettings(settings),input=ctx.createGain(),inputTrim=ctx.createGain(),nodes=[inputTrim];
 input.connect(inputTrim);
 let saturationDrive=null;
 const eqFilters=[];
 const highpass=ctx.createBiquadFilter();highpass.type='highpass';highpass.Q.value=.707;eqFilters.push(highpass);
 const bands=current.eq.bands.map(band=>{const node=ctx.createBiquadFilter();node.type=band.type;eqFilters.push(node);return node});
 const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.Q.value=.707;eqFilters.push(lowpass);
 for(let index=0;index<eqFilters.length-1;index++)eqFilters[index].connect(eqFilters[index+1]);
 nodes.push(...eqFilters);

 const saturationInput=ctx.createGain(),dry=ctx.createGain(),wet=ctx.createGain(),saturator=ctx.createWaveShaper(),satSum=ctx.createGain();
 saturationInput.connect(dry);saturationInput.connect(saturator);dry.connect(satSum);saturator.connect(wet);wet.connect(satSum);saturator.oversample='4x';nodes.push(saturationInput,dry,saturator,wet,satSum);

 const splitter=ctx.createChannelSplitter(2),merger=ctx.createChannelMerger(2),mid=ctx.createGain(),side=ctx.createGain(),sideInvert=ctx.createGain(),rightSideInvert=ctx.createGain(),left=ctx.createGain(),right=ctx.createGain();
 splitter.connect(mid,0);splitter.connect(mid,1);splitter.connect(side,0);splitter.connect(sideInvert,1);
 mid.gain.value=.5;side.gain.value=.5;sideInvert.gain.value=-1;rightSideInvert.gain.value=-1;mid.connect(left);side.connect(left);mid.connect(right);sideInvert.connect(side);side.connect(rightSideInvert).connect(right);side.gain.value=.5*current.imager.width;
 left.gain.value=1;right.gain.value=1;left.connect(merger,0,0);right.connect(merger,0,1);nodes.push(splitter,merger,mid,side,sideInvert,rightSideInvert,left,right);

 const multibandAvailable=Boolean(ctx.masteringLimiterReady&&ctx.audioWorklet&&typeof globalThis.AudioWorkletNode==='function');
 if(current.multiband.enabled&&!multibandAvailable)throw new Error('The mastering multiband processor requires AudioWorklet support in this browser.');
 const multiband=multibandAvailable?new globalThis.AudioWorkletNode(ctx,'egghead-mastering-multiband',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{channels:2,settings:current.multiband}}):null;
 if(multiband)nodes.push(multiband);
 const outputGain=ctx.createGain();nodes.push(outputGain);
 const limiterAvailable=Boolean(ctx.masteringLimiterReady&&ctx.audioWorklet&&typeof globalThis.AudioWorkletNode==='function');
 if(current.limiter.enabled&&!limiterAvailable)throw new Error('The mastering limiter requires AudioWorklet support in this browser.');
 const limiter=limiterAvailable?new globalThis.AudioWorkletNode(ctx,'egghead-lookahead-limiter',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{channels:2,lookaheadSeconds:current.limiter.lookaheadMs/1000,settings:{enabled:current.limiter.enabled,ceilingDbtp:current.limiter.ceiling,releaseSeconds:current.limiter.release}}}):null;
 const preAnalyser=ctx.createAnalyser?.()||null,postAnalyser=ctx.createAnalyser?.()||null;
 for(const analyser of [preAnalyser,postAnalyser])if(analyser){analyser.fftSize=2048;analyser.smoothingTimeConstant=.75;analyser.minDecibels=-90;analyser.maxDecibels=0;nodes.push(analyser)}
 if(preAnalyser)inputTrim.connect(preAnalyser);
 const modules={
  eq:{input:highpass,output:lowpass},
  saturation:{input:saturationInput,output:satSum},
  imager:{input:splitter,output:merger},
  multiband:multiband?{input:multiband,output:multiband}:null
 };
 let connectedOrder=[],connectedEdges=[],eqPre=inputTrim,eqActive=!current.chainBypass&&current.eq.enabled;
 const connectOrder=order=>{
  for(const[source,target]of connectedEdges)try{source.disconnect(target)}catch{}
  connectedEdges=[];
  connectedOrder=order.filter(name=>modules[name]&&(name!=='eq'||eqActive));
  const beforeEq=order.slice(0,order.indexOf('eq')).filter(name=>modules[name]);
  eqPre=beforeEq.length?modules[beforeEq.at(-1)].output:inputTrim;
  const first=connectedOrder[0]?modules[connectedOrder[0]].input:outputGain;
  inputTrim.connect(first);connectedEdges.push([inputTrim,first]);
  for(let index=0;index<connectedOrder.length-1;index++){
   const source=modules[connectedOrder[index]].output,target=modules[connectedOrder[index+1]].input;
   source.connect(target);connectedEdges.push([source,target]);
  }
  if(connectedOrder.length){const source=modules[connectedOrder.at(-1)].output;source.connect(outputGain);connectedEdges.push([source,outputGain])}
 };
 connectOrder(current.chainOrder);
 if(limiter){outputGain.connect(limiter);nodes.push(limiter)}else if(postAnalyser)outputGain.connect(postAnalyser);else outputGain.connect(destination);
 if(limiter){if(postAnalyser)limiter.connect(postAnalyser);else limiter.connect(destination)}
 if(postAnalyser)postAnalyser.connect(destination);

 let latencyFrames=limiter?Math.round(current.limiter.lookaheadMs/1000*ctx.sampleRate)+8:0;
 let lastOrder=`${current.chainOrder.join('|')}:${eqActive}`;
 const update=nextSettings=>{
  const next=normalizeMasteringSettings(nextSettings);
  setParam(inputTrim.gain,10**(next.inputGainDb/20),ctx);
  const chainEnabled=!next.chainBypass;
  eqActive=chainEnabled&&next.eq.enabled;
  const filters=masterEqFilters(next,ctx.sampleRate);
  eqFilters.forEach((node,index)=>{const band=filters[index];node.type=band.type;setParam(node.frequency,band.frequency,ctx);setParam(node.Q,band.q,ctx);setParam(node.gain,band.gain,ctx)});
  setParam(dry.gain,chainEnabled&&next.saturation.enabled?1-next.saturation.mix:1,ctx);
  setParam(wet.gain,chainEnabled&&next.saturation.enabled?next.saturation.mix:0,ctx);
  if(saturationDrive!==next.saturation.drive){saturator.curve=makeSaturationCurve(next.saturation.drive);saturationDrive=next.saturation.drive}
  setParam(side.gain,.5*(chainEnabled&&next.imager.enabled?next.imager.width:1),ctx);
  if(chainEnabled&&next.multiband.enabled&&!multiband)throw new Error('The mastering multiband processor requires AudioWorklet support in this browser.');
  multiband?.port.postMessage({type:'settings',settings:{...next.multiband,enabled:chainEnabled&&next.multiband.enabled}});
  if(next.limiter.enabled&&!limiter)throw new Error('The mastering limiter requires AudioWorklet support in this browser.');
  latencyFrames=limiter?Math.round(next.limiter.lookaheadMs/1000*ctx.sampleRate)+8:0;
  limiter?.port.postMessage({type:'settings',settings:{enabled:next.limiter.enabled,ceilingDbtp:next.limiter.ceiling,releaseSeconds:next.limiter.release,lookaheadMs:next.limiter.lookaheadMs}});
  setParam(outputGain.gain,10**(next.outputGainDb/20),ctx);
  const orderKey=`${next.chainOrder.join('|')}:${eqActive}`;
  if(orderKey!==lastOrder){connectOrder(next.chainOrder);lastOrder=orderKey}
 };
 update(current);
 limiter?.port.start?.();
 multiband?.port.start?.();
 if(limiter)limiter.port.onmessage=event=>{if(event.data?.type==='gain-reduction')graph.gainReductionDb=Math.max(0,Number(event.data.db)||0)};
 if(multiband)multiband.port.onmessage=event=>{if(event.data?.type==='gain-reduction')graph.multibandGainReduction=event.data.bands||[0,0,0]};
 const graph={input,nodes,eqFilters,bands,get eqTaps(){return{pre:eqPre,post:eqActive?lowpass:eqPre}},limiter,multiband,inputTrim,preAnalyser,postAnalyser,gainReductionDb:0,multibandGainReduction:[0,0,0],get moduleOrder(){return [...connectedOrder]},get latencyFrames(){return latencyFrames},disconnect(){input.disconnect();for(const node of nodes){disposeProcessor(node);node.disconnect()}},update};
 return graph;
}

export function masteringEqResponse(settings,sampleRate=48000,pointCount=160){
 const current=normalizeMasteringSettings(settings),points=[];
 for(let index=0;index<=pointCount;index++){
  const frequency=unitToFrequency(index/pointCount,sampleRate);
  let response=0;
  if(current.eq.enabled&&!current.chainBypass){
   if(current.eq.lowCutEnabled!==false)response+=filterDb('highpass',frequency,current.eq.lowCut,.707,sampleRate);
   if(current.eq.highCutEnabled!==false)response+=filterDb('lowpass',frequency,current.eq.highCut,.707,sampleRate);
   for(const band of current.eq.bands)if(band.enabled)response+=filterDb(band.type,frequency,band.frequency,band.q,sampleRate,band.gain);
  }
  points.push({frequency,db:response});
 }
 return points;
}

function filterDb(type,frequency,cutoff,q,sampleRate,gain=0){
 cutoff=Math.min(sampleRate/2,cutoff);
 if(cutoff===sampleRate/2&&(type==='highpass'||type==='lowpass'))return type==='highpass'?-240:0;
 const w0=2*Math.PI*cutoff/sampleRate,cos=Math.cos(w0),sin=Math.sin(w0),alpha=sin/(2*q);
 let b0,b1,b2,a0,a1,a2;
 if(type==='highpass'){b0=(1+cos)/2;b1=-(1+cos);b2=b0;a0=1+alpha;a1=-2*cos;a2=1-alpha}
 else if(type==='lowpass'){b0=(1-cos)/2;b1=1-cos;b2=b0;a0=1+alpha;a1=-2*cos;a2=1-alpha}
 else{
  const A=10**(gain/40);
  if(type==='lowshelf'){
   const shelfAlpha=sin/2*Math.sqrt(2);
   b0=A*((A+1)-(A-1)*cos+2*Math.sqrt(A)*shelfAlpha);b1=2*A*((A-1)-(A+1)*cos);b2=A*((A+1)-(A-1)*cos-2*Math.sqrt(A)*shelfAlpha);
   a0=(A+1)+(A-1)*cos+2*Math.sqrt(A)*shelfAlpha;a1=-2*((A-1)+(A+1)*cos);a2=(A+1)+(A-1)*cos-2*Math.sqrt(A)*shelfAlpha;
  }else if(type==='highshelf'){
   const shelfAlpha=sin/2*Math.sqrt(2);
   b0=A*((A+1)+(A-1)*cos+2*Math.sqrt(A)*shelfAlpha);b1=-2*A*((A-1)+(A+1)*cos);b2=A*((A+1)+(A-1)*cos-2*Math.sqrt(A)*shelfAlpha);
   a0=(A+1)-(A-1)*cos+2*Math.sqrt(A)*shelfAlpha;a1=2*((A-1)-(A+1)*cos);a2=(A+1)-(A-1)*cos-2*Math.sqrt(A)*shelfAlpha;
  }else{
   const bandAlpha=sin/(2*q);b0=1+bandAlpha*A;b1=-2*cos;b2=1-bandAlpha*A;a0=1+bandAlpha/A;a1=-2*cos;a2=1-bandAlpha/A;
  }
 }
 const w=2*Math.PI*frequency/sampleRate,c=Math.cos(w),s=Math.sin(w);
 const numerator=Math.hypot(b0+b1*c+b2*Math.cos(2*w),-b1*s-b2*Math.sin(2*w));
 const denominator=Math.hypot(a0+a1*c+a2*Math.cos(2*w),-a1*s-a2*Math.sin(2*w));
 return 20*Math.log10(Math.max(1e-12,numerator/Math.max(1e-12,denominator)));
}

export function analyzeMasterBuffer(buffer){
 if(!buffer||!Number.isInteger(buffer.length)||buffer.length===0)throw new TypeError('A non-empty rendered audio buffer is required.');
 const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index));
 return{...analyzeLoudness(channels,buffer.sampleRate),stereo:channels.length>=2?analyzeStereo(channels):null};
}

export function analyzeMasterBufferAsync(buffer,{signal,onProgress=()=>{}}={}){
 if(!buffer||!Number.isInteger(buffer.length)||buffer.length===0)throw new TypeError('A non-empty rendered audio buffer is required.');
 if(typeof Worker!=='function')return Promise.reject(new Error('Background loudness analysis requires Web Worker support in this browser.'));
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./mastering-analysis-worker.js',import.meta.url),{type:'module'}),requestId=1;let finished=false;
  const finish=(callback,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);worker.terminate();callback(value)};
  const abort=()=>finish(reject,signal?.reason||new DOMException('Loudness analysis was cancelled.','AbortError'));
  if(signal?.aborted){abort();return}
  signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>{
   if(event.data?.requestId!==requestId)return;
   if(event.data.type==='progress'){onProgress(Math.max(0,Math.min(1,Number(event.data.progress)||0)));return}
   if(event.data.type==='result'){finish(resolve,event.data.analysis);return}
   if(event.data.type==='error')finish(reject,new Error(`Loudness analysis failed: ${event.data.message}`));
  };
  worker.onerror=event=>finish(reject,new Error(`Loudness analysis worker failed: ${event.message||'unknown worker error'}`));
  try{
   const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index).slice());
   worker.postMessage({requestId,sampleRate:buffer.sampleRate,channels},channels.map(channel=>channel.buffer));
  }catch(error){finish(reject,error)}
 });
}
