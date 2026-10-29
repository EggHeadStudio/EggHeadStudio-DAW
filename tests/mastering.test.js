import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMasterBuffer,
  createMasteringGraph,
  DEFAULT_MASTERING_SETTINGS,
  masteringEqResponse,
  MASTERING_PRESETS,
  normalizeMasteringSettings
} from '../src/mastering.js';
import {LookaheadLimiter,estimateTruePeak} from '../src/mastering-dsp.js';
import {parseProject,serializeProject} from '../src/project-state.js';

function fakeContext(){
  const nodes=[];
  const param=()=>({value:0,setTargetAtTime(value){this.value=value}});
  const node=type=>({type,connections:[],connect(target,...ports){this.connections.push({target,ports});return target},disconnect(){this.connections=[]},gain:param(),frequency:param(),Q:param(),threshold:param(),ratio:param(),knee:param(),attack:param(),release:param(),oversample:'none',curve:null});
  return{
    currentTime:1,
    sampleRate:48000,
    masteringLimiterReady:true,
    audioWorklet:{},
    nodes,
    createGain(){const result=node('gain');nodes.push(result);return result},
    createBiquadFilter(){const result=node('biquad');nodes.push(result);return result},
    createWaveShaper(){const result=node('waveshaper');nodes.push(result);return result},
    createDynamicsCompressor(){const result=node('compressor');nodes.push(result);return result},
    createChannelSplitter(){const result=node('splitter');nodes.push(result);return result},
    createChannelMerger(){const result=node('merger');nodes.push(result);return result}
  };
}

globalThis.AudioWorkletNode=class{
 constructor(context,name,options){this.type='worklet';this.name=name;this.options=options;this.messages=[];this.port={postMessage:message=>this.messages.push(message),start(){}};this.connections=[]}
 connect(target){this.connections.push(target);return target}
 disconnect(){this.connections=[]}
};

test('mastering settings normalize six EQ bands and clamp unsafe values',()=>{
  const settings=normalizeMasteringSettings({outputGainDb:90,imager:{width:4},limiter:{ceiling:-20,lookaheadMs:500,release:0},eq:{bands:[{frequency:1,gain:40,q:0}]}});
  assert.equal(settings.eq.bands.length,6);
  assert.equal(settings.eq.bands[0].frequency,20);
  assert.equal(settings.eq.bands[0].gain,18);
  assert.equal(settings.eq.bands[0].q,.1);
  assert.equal(settings.outputGainDb,24);
  assert.equal(settings.imager.width,1.5);
  assert.equal(settings.limiter.ceiling,-6);
  assert.equal(settings.limiter.lookaheadMs,100);
  assert.equal(settings.limiter.release,.005);
  assert.equal(normalizeMasteringSettings({limiter:{enabled:true,threshold:-3}}).limiter.ceiling,-3);
  assert.equal(normalizeMasteringSettings().eq.bands[1].gain,0);
});

test('mastering EQ response follows enabled bands and cut filters',()=>{
  const settings=normalizeMasteringSettings({
    eq:{enabled:true,lowCut:100,highCut:10000,bands:[{type:'peaking',frequency:1000,gain:9,q:1}]}
  });
  const response=masteringEqResponse(settings,48000,200);
  const nearBand=response.reduce((best,point)=>Math.abs(point.frequency-1000)<Math.abs(best.frequency-1000)?point:best,response[0]);
  const lowPoint=response.reduce((best,point)=>Math.abs(point.frequency-20)<Math.abs(best.frequency-20)?point:best,response[0]);
  assert.ok(nearBand.db>7);
  assert.ok(lowPoint.db< -5);
  settings.eq.bands[0].enabled=false;
  assert.ok(Math.max(...masteringEqResponse(settings).map(point=>point.db))<1);
});

test('mastering graph routes modules in order and updates live parameters',()=>{
  const context=fakeContext(),destination=context.createGain(),settings=normalizeMasteringSettings({
    saturation:{enabled:true,drive:3,mix:.25},
    imager:{enabled:true,width:1.2},
    limiter:{enabled:true,ceiling:-2},
    inputGainDb:6,
    outputGainDb:3
  });
  const graph=createMasteringGraph(context,settings,destination);
  assert.equal(graph.bands.length,6);
  assert.equal(graph.eqFilters[0].type,'highpass');
  assert.equal(graph.eqFilters.at(-1).type,'lowpass');
  assert.equal(graph.limiter.name,'egghead-lookahead-limiter');
  assert.deepEqual(graph.limiter.messages.at(-1),{type:'settings',settings:{enabled:true,ceilingDbtp:-2,releaseSeconds:.1,lookaheadMs:5}});
  assert.ok(graph.latencyFrames>0);
  assert.ok(Math.abs(graph.inputTrim.gain.value-10**(6/20))<1e-6);
  assert.equal(context.nodes.find(item=>item.type==='waveshaper').oversample,'4x');
  const inverter=context.nodes.filter(item=>item.type==='gain').find(item=>item.gain.value===-1);
  assert.ok(inverter);
  graph.update({...settings,imager:{enabled:true,width:.5},limiter:{enabled:false,ceiling:-1}});
  assert.equal(graph.limiter.messages.at(-1).settings.enabled,false);
  assert.equal(graph.input.connections[0].target.type,'gain');
  assert.equal(graph.input.connections[0].target.connections[0].target.type,'highpass');
  assert.ok(graph.nodes.at(-1).connections.includes(destination));
});

test('master presets change real DSP parameters and are independent of defaults',()=>{
  const balanced=normalizeMasteringSettings(),electronic=normalizeMasteringSettings({...balanced,...MASTERING_PRESETS['Electronic / EDM']});
  assert.equal(electronic.saturation.enabled,true);
  assert.equal(electronic.imager.enabled,true);
  assert.notEqual(electronic.eq.bands[0].gain,balanced.eq.bands[0].gain);
  electronic.eq.bands[0].gain=12;
  assert.equal(MASTERING_PRESETS['Electronic / EDM'].eq.bands[0].gain,1.2);
});

test('mastering graph starts at committed parameters and smooths only live edits',()=>{
  const context=fakeContext(),scheduled=[];
  for(const name of ['createGain','createBiquadFilter']){
    const create=context[name].bind(context);
    context[name]=()=>{
      const node=create();
      for(const key of ['gain','frequency','Q'])node[key].setTargetAtTime=value=>{scheduled.push({key,value});node[key].value=value};
      return node;
    };
  }
  const settings=normalizeMasteringSettings({inputGainDb:-3,outputGainDb:-6,eq:{bands:[{frequency:1000,gain:6}]}});
  const graph=createMasteringGraph(context,settings,context.createGain());
  assert.equal(scheduled.length,0);
  assert.equal(graph.bands[0].frequency.value,1000);
  assert.equal(graph.bands[0].gain.value,6);
  assert.equal(graph.inputTrim.gain.value,10**(-3/20));
  graph.update({...settings,outputGainDb:-9});
  assert.ok(scheduled.length>0);
  assert.ok(scheduled.some(({key,value})=>key==='gain'&&value===10**(-9/20)));
  graph.disconnect();
});

test('mastering controls persist through the existing project JSON format',()=>{
  const project={name:'Master Test',bpm:120,tracks:[],mastering:normalizeMasteringSettings({...DEFAULT_MASTERING_SETTINGS,preset:'Electronic / EDM',inputGainDb:2,outputGainDb:-2,limiter:{enabled:true,ceiling:-2.5,lookaheadMs:8,release:.2}})};
  const restored=parseProject(serializeProject(project));
  assert.equal(restored.mastering.preset,'Electronic / EDM');
  assert.equal(restored.mastering.inputGainDb,2);
  assert.equal(restored.mastering.outputGainDb,-2);
  assert.equal(restored.mastering.limiter.enabled,true);
  assert.equal(restored.mastering.limiter.ceiling,-2.5);
  assert.equal(restored.mastering.limiter.lookaheadMs,8);
  assert.equal(restored.mastering.limiter.release,.2);
  assert.equal(restored.mastering.eq.bands.length,6);
});

test('master analysis reports RMS, loudness and interpolated true peak',()=>{
  const channels=[Float32Array.from([0,.5,-.5,1]),Float32Array.from([0,.5,-.5,0])];
  const analysis=analyzeMasterBuffer({length:4,numberOfChannels:2,sampleRate:48000,getChannelData:index=>channels[index]});
  assert.equal(analysis.samplePeak,1);
  assert.ok(Math.abs(analysis.rms-Math.sqrt(2/8))<1e-12);
  assert.equal(analysis.rmsDbfs,20*Math.log10(analysis.rms));
  assert.equal(analysis.clipping,true);
  assert.ok(Number.isFinite(analysis.truePeakDbtp));
  assert.throws(()=>analyzeMasterBuffer(null),TypeError);
});

test('BS.1770 K-weighted mono 1 kHz reference tone is within 0.15 LU',()=>{
 const sampleRate=48000,signal=Float32Array.from({length:sampleRate*4},(_,i)=>.1*Math.sin(2*Math.PI*1000*i/sampleRate));
 const analysis=analyzeMasterBuffer({length:signal.length,numberOfChannels:1,sampleRate,getChannelData:()=>signal});
 assert.ok(Math.abs(analysis.integratedLufs+23)<.15,`${analysis.integratedLufs} LUFS`);
 assert.ok(Math.abs(analysis.rmsDbfs+23.0103)<.01);
 assert.ok(Math.abs(analysis.momentaryLufs-analysis.integratedLufs)<.02);
 assert.ok(Math.abs(analysis.shortTermLufs-analysis.integratedLufs)<.02);
 assert.ok(analysis.loudnessHistory.length>=30);
});

test('published pyloudnorm 1 kHz full-scale test tone reference is within 0.1 LU',()=>{
 const sampleRate=44100,signal=Float32Array.from({length:sampleRate*4},(_,i)=>Math.sin(2*Math.PI*1000*i/sampleRate));
 const analysis=analyzeMasterBuffer({length:signal.length,numberOfChannels:1,sampleRate,getChannelData:()=>signal});
 assert.ok(Math.abs(analysis.integratedLufs-(-3.0523438444331137))<.1,`${analysis.integratedLufs} LUFS`);
});

test('K-weighted 1 kHz reference remains calibrated at 44.1, 48 and 96 kHz',()=>{
 for(const sampleRate of [44100,48000,96000]){
  const signal=Float32Array.from({length:sampleRate*4},(_,i)=>.1*Math.sin(2*Math.PI*1000*i/sampleRate));
  const analysis=analyzeMasterBuffer({length:signal.length,numberOfChannels:1,sampleRate,getChannelData:()=>signal});
  assert.ok(Math.abs(analysis.integratedLufs+23)<.15,`${sampleRate} Hz: ${analysis.integratedLufs} LUFS`);
 }
});

test('silence is gated and does not invent loudness or clipping',()=>{
 const silence=new Float32Array(48000*4),analysis=analyzeMasterBuffer({length:silence.length,numberOfChannels:1,sampleRate:48000,getChannelData:()=>silence});
 assert.equal(analysis.integratedLufs,-Infinity);
 assert.equal(analysis.shortTermLufs,-Infinity);
 assert.equal(analysis.lra,null);
 assert.equal(analysis.clipping,false);
 assert.equal(analysis.truePeak,0);
});

test('LRA reflects loud and quiet sections and channel weighting handles stereo',()=>{
 const sampleRate=48000,signal=Float32Array.from({length:sampleRate*12},(_,i)=>{const amplitude=i<sampleRate*6?.1:.01;return amplitude*Math.sin(2*Math.PI*1000*i/sampleRate)});
 const mono=analyzeMasterBuffer({length:signal.length,numberOfChannels:1,sampleRate,getChannelData:()=>signal});
 const stereo=analyzeMasterBuffer({length:signal.length,numberOfChannels:2,sampleRate,getChannelData:()=>signal});
 assert.ok(mono.lra>15&&mono.lra<23,`LRA ${mono.lra}`);
 assert.ok(Math.abs(stereo.integratedLufs-mono.integratedLufs-3.0103)<.02);
});

test('BS.1770 omits LFE energy and applies surround channel weighting',()=>{
 const sampleRate=48000,length=sampleRate*4,signal=Float32Array.from({length},(_,i)=>.1*Math.sin(2*Math.PI*1000*i/sampleRate));
 const lfe=Array.from({length:6},()=>new Float32Array(length));lfe[3].set(signal);
 const surround=Array.from({length:6},()=>new Float32Array(length));surround[4].set(signal);
 const lfeAnalysis=analyzeMasterBuffer({length,numberOfChannels:6,sampleRate,getChannelData:index=>lfe[index]});
 const surroundAnalysis=analyzeMasterBuffer({length,numberOfChannels:6,sampleRate,getChannelData:index=>surround[index]});
 assert.equal(lfeAnalysis.integratedLufs,-Infinity);
 assert.ok(Math.abs(surroundAnalysis.integratedLufs-(-21.51))<.03,`${surroundAnalysis.integratedLufs} LUFS`);
});

test('4x windowed-sinc oversampling estimates a known inter-sample peak',()=>{
 const sampleRate=48000,signal=Float32Array.from({length:1000},(_,i)=>.9*Math.min(1,i/64,(999-i)/64)*Math.sin(2*Math.PI*(sampleRate*.25)*i/sampleRate+Math.PI/4));
 const samplePeak=Math.max(...signal.map(Math.abs)),truePeak=estimateTruePeak([signal]);
 assert.ok(truePeak>samplePeak+.1,`sample=${samplePeak} estimated=${truePeak}`);
 assert.ok(Math.abs(truePeak-.9)<.001,`estimated=${truePeak}`);
});

test('lookahead limiter delays by configured latency, links stereo and meets its ceiling',()=>{
 const sampleRate=48000,length=1600,left=Float32Array.from({length},(_,i)=>i===500?2:0),right=new Float32Array(length),outLeft=new Float32Array(length),outRight=new Float32Array(length);
 const limiter=new LookaheadLimiter(sampleRate,2,.005);
 limiter.process([left,right],[outLeft,outRight],{enabled:true,ceilingDbtp:-1,releaseSeconds:.1});
 assert.equal(limiter.delayFrames,248);
 assert.equal(outLeft[500],0);
 assert.ok(outLeft[748]>.85&&outLeft[748]<.9);
 assert.ok(estimateTruePeak([outLeft,outRight])<=10**(-1/20)+.001);
 const linkedLeft=Float32Array.from({length},(_,i)=>i===500?2:0),linkedRight=new Float32Array(length).fill(.5),linkedOutLeft=new Float32Array(length),linkedOutRight=new Float32Array(length);
 new LookaheadLimiter(sampleRate,2,.005).process([linkedLeft,linkedRight],[linkedOutLeft,linkedOutRight],{enabled:true,ceilingDbtp:-1,releaseSeconds:.1});
 assert.ok(linkedOutRight[508]<.5&&linkedOutRight[508]>.47,'lookahead begins a smooth reduction before the peak');
 assert.ok(linkedOutRight[600]<linkedOutRight[508],'attack envelope continues toward the ceiling');
 assert.ok(linkedOutRight[748]<.45,'the right channel follows left-channel gain reduction');
});

test('lookahead limiter controls broadband peaks at a second sample rate',()=>{
 const sampleRate=44100,length=sampleRate/5;let seed=1234567;
 const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000*2-1};
 const left=Float32Array.from({length},()=>1.5*random()),right=Float32Array.from({length},()=>1.5*random()),outLeft=new Float32Array(length),outRight=new Float32Array(length);
 new LookaheadLimiter(sampleRate,2,.008).process([left,right],[outLeft,outRight],{enabled:true,ceilingDbtp:-3,releaseSeconds:.08});
 const peak=20*Math.log10(estimateTruePeak([outLeft,outRight]));
 assert.ok(peak<=-2.85,`measured ${peak} dBTP estimated`);
});

test('limiter release decays smoothly and longer release holds gain reduction',()=>{
 const sampleRate=48000,length=sampleRate/2,input=Float32Array.from({length},(_,i)=>i===100?2:0),outFast=new Float32Array(length),outSlow=new Float32Array(length);
 const fast=new LookaheadLimiter(sampleRate,1,.005),slow=new LookaheadLimiter(sampleRate,1,.005);
 fast.process([input],[outFast],{enabled:true,ceilingDbtp:-1,releaseSeconds:.02});
 slow.process([input],[outSlow],{enabled:true,ceilingDbtp:-1,releaseSeconds:.2});
 assert.ok(slow.gain<fast.gain);
 assert.ok(fast.gain>0&&fast.gain<1);
});
