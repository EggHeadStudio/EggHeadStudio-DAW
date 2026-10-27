import {analyzeLoudness} from './mastering-dsp.js';

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
 const result={
  ...DEFAULT_MASTERING_SETTINGS,
  ...settings,
  eq:{...DEFAULT_MASTERING_SETTINGS.eq,...settings.eq,bands:BAND_DEFAULTS.map((band,index)=>({...band,...settings.eq?.bands?.[index]}))},
  saturation:{...DEFAULT_MASTERING_SETTINGS.saturation,...settings.saturation},
  imager:{...DEFAULT_MASTERING_SETTINGS.imager,...settings.imager},
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
 result.limiter.ceiling=clampNumber(result.limiter.ceiling,-6,0,-1);
 result.limiter.lookaheadMs=clampNumber(result.limiter.lookaheadMs,1,100,5);
 result.limiter.release=clampNumber(result.limiter.release,.005,2,.1);
 for(const key of ['enabled']){result.eq[key]=Boolean(result.eq[key]);result.saturation[key]=Boolean(result.saturation[key]);result.imager[key]=Boolean(result.imager[key]);result.limiter[key]=Boolean(result.limiter[key])}
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

export function createMasteringGraph(ctx,settings,destination){
 const current=normalizeMasteringSettings(settings),input=ctx.createGain(),inputTrim=ctx.createGain(),nodes=[inputTrim];
 input.connect(inputTrim);
 let last=inputTrim,saturationDrive=null;
 const connect=node=>{last.connect(node);last=node;nodes.push(node);return node};
 const eqFilters=[];
 const highpass=connect(ctx.createBiquadFilter());highpass.type='highpass';highpass.Q.value=.707;eqFilters.push(highpass);
 const bands=current.eq.bands.map(band=>{const node=connect(ctx.createBiquadFilter());node.type=band.type;eqFilters.push(node);return node});
 const lowpass=connect(ctx.createBiquadFilter());lowpass.type='lowpass';lowpass.Q.value=.707;eqFilters.push(lowpass);

 const dry=ctx.createGain(),wet=ctx.createGain(),saturator=ctx.createWaveShaper(),satSum=ctx.createGain();
 last.connect(dry);dry.connect(satSum);last.connect(saturator);saturator.connect(wet);wet.connect(satSum);saturator.oversample='4x';last=satSum;nodes.push(dry,saturator,wet,satSum);

 const splitter=ctx.createChannelSplitter(2),merger=ctx.createChannelMerger(2),mid=ctx.createGain(),side=ctx.createGain(),sideInvert=ctx.createGain(),left=ctx.createGain(),right=ctx.createGain();
 last.connect(splitter);
 splitter.connect(mid,0);splitter.connect(mid,1);splitter.connect(side,0);splitter.connect(sideInvert,1);
 mid.gain.value=.5;side.gain.value=.5;sideInvert.gain.value=-1;mid.connect(left);side.connect(left);mid.connect(right);sideInvert.connect(side);side.connect(right);side.gain.value=.5*current.imager.width;
 left.gain.value=1;right.gain.value=1;left.connect(merger,0,0);right.connect(merger,0,1);last=merger;nodes.push(splitter,merger,mid,side,sideInvert,left,right);

 const outputGain=connect(ctx.createGain());
 const limiterAvailable=Boolean(ctx.masteringLimiterReady&&ctx.audioWorklet&&typeof globalThis.AudioWorkletNode==='function');
 if(current.limiter.enabled&&!limiterAvailable)throw new Error('The mastering limiter requires AudioWorklet support in this browser.');
 const limiter=limiterAvailable?new globalThis.AudioWorkletNode(ctx,'egghead-lookahead-limiter',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{channels:2,lookaheadSeconds:current.limiter.lookaheadMs/1000,settings:{enabled:current.limiter.enabled,ceilingDbtp:current.limiter.ceiling,releaseSeconds:current.limiter.release}}}):null;
 if(limiter){last.connect(limiter);limiter.connect(destination);nodes.push(limiter)}else last.connect(destination);

 let latencyFrames=limiter?Math.round(current.limiter.lookaheadMs/1000*ctx.sampleRate)+8:0;
 const update=nextSettings=>{
  const next=normalizeMasteringSettings(nextSettings);
  setParam(inputTrim.gain,10**(next.inputGainDb/20),ctx);
  setParam(highpass.frequency,next.eq.enabled?next.eq.lowCut:10,ctx);
  setParam(lowpass.frequency,next.eq.enabled?next.eq.highCut:Math.min(22000,ctx.sampleRate/2),ctx);
  bands.forEach((node,index)=>{const band=next.eq.bands[index];node.type=band.type;setParam(node.frequency,band.frequency,ctx);setParam(node.Q,band.q,ctx);setParam(node.gain,next.eq.enabled&&band.enabled?band.gain:0,ctx)});
  setParam(dry.gain,next.saturation.enabled?1-next.saturation.mix:1,ctx);
  setParam(wet.gain,next.saturation.enabled?next.saturation.mix:0,ctx);
  if(saturationDrive!==next.saturation.drive){saturator.curve=makeSaturationCurve(next.saturation.drive);saturationDrive=next.saturation.drive}
  setParam(side.gain,.5*(next.imager.enabled?next.imager.width:1),ctx);
  if(next.limiter.enabled&&!limiter)throw new Error('The mastering limiter requires AudioWorklet support in this browser.');
  latencyFrames=limiter?Math.round(next.limiter.lookaheadMs/1000*ctx.sampleRate)+8:0;
  limiter?.port.postMessage({type:'settings',settings:{enabled:next.limiter.enabled,ceilingDbtp:next.limiter.ceiling,releaseSeconds:next.limiter.release,lookaheadMs:next.limiter.lookaheadMs}});
  setParam(outputGain.gain,10**(next.outputGainDb/20),ctx);
 };
 update(current);
 limiter?.port.start?.();
 if(limiter)limiter.port.onmessage=event=>{if(event.data?.type==='gain-reduction')graph.gainReductionDb=Math.max(0,Number(event.data.db)||0)};
 const graph={input,nodes,eqFilters,bands,limiter,inputTrim,gainReductionDb:0,get latencyFrames(){return latencyFrames},disconnect(){input.disconnect();for(const node of nodes)node.disconnect()},update};
 return graph;
}

export function masteringEqResponse(settings,sampleRate=48000,pointCount=160){
 const current=normalizeMasteringSettings(settings),points=[];
 for(let index=0;index<=pointCount;index++){
  const frequency=20*1000**(index/pointCount),omega=2*Math.PI*frequency/sampleRate;
  let response=0;
  if(current.eq.enabled){
   response+=filterDb('highpass',frequency,current.eq.lowCut,.707,sampleRate);
   response+=filterDb('lowpass',frequency,current.eq.highCut,.707,sampleRate);
   for(const band of current.eq.bands)if(band.enabled)response+=filterDb(band.type,frequency,band.frequency,band.q,sampleRate,band.gain);
  }
  points.push({frequency,db:response});
 }
 return points;
}

function filterDb(type,frequency,cutoff,q,sampleRate,gain=0){
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
 return analyzeLoudness(channels,buffer.sampleRate);
}
