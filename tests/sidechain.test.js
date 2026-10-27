import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine,createTrackEffect} from '../src/audio.js';
import {FeedForwardCompressorProcessor} from '../src/sidechain-processor.js';

function makeProcessor(sampleRate=1000){
 const processor=new FeedForwardCompressorProcessor({processorOptions:{sampleRate}});
 processor.port.messages=[];
 processor.port.postMessage=message=>processor.port.messages.push(message);
 return processor;
}

test('compressor instances receive independent sidechain defaults',()=>{
 const first=createTrackEffect('compressor','first'),second=createTrackEffect('compressor','second');
 first.params.sidechain.enabled=true;first.params.sidechain.sourceTrackId='kick';
 assert.equal(second.params.sidechain.enabled,false);
 assert.equal(second.params.sidechain.sourceTrackId,'');
});

test('external compressor ducks program audio from an independent detector input',()=>{
 const processor=makeProcessor(),program=Float32Array.from({length:500},()=>.5),detector=Float32Array.from({length:500},()=>1),output=new Float32Array(500);
 processor.settings={threshold:-20,ratio:4,knee:0,attack:.001,release:.1,detectorGain:0,lowCut:0};
 processor.process([[program],[detector]],[[output]]);
 assert.ok(output[output.length-1]<.1,'program audio should be attenuated by the detector');
 assert.equal(program[program.length-1],.5,'detector must not be mixed into or mutate program audio');
});

test('external compressor remains neutral when the detector signal is silent',()=>{
 const processor=makeProcessor(),program=new Float32Array(128).fill(.25),detector=new Float32Array(128),output=new Float32Array(128);
 processor.settings={threshold:-20,ratio:8,knee:0,attack:.001,release:.1,detectorGain:0,lowCut:0};
 processor.process([[program],[detector]],[[output]]);
 assert.deepEqual(output,program);
});

test('sidechain processor applies attack/release smoothing and detector filtering settings',()=>{
 const processor=makeProcessor(),program=new Float32Array(64).fill(.5),detector=new Float32Array(64).fill(1),output=new Float32Array(64);
 processor.port.onmessage({data:{type:'settings',settings:{threshold:-18,ratio:6,knee:0,attack:.01,release:.2,detectorGain:6,lowCut:90}}});
 processor.process([[program],[detector]],[[output]]);
 assert.ok(output[63]<.5&&output[63]>0);
 assert.ok(processor.settings.lowCut===90&&processor.settings.detectorGain===6);
});

test('live track graph routes the selected pre-fader source only to compressor detector input',()=>{
 const created=[],param=()=>({value:0});
 const makeNode=()=>({connections:[],gain:param(),pan:param(),frequency:param(),Q:param(),threshold:param(),ratio:param(),knee:param(),attack:param(),release:param(),delayTime:param(),connect(target,output=0,input=0){this.connections.push({target,output,input});return target},disconnect(target){this.connections=target?this.connections.filter(item=>item.target!==target):[]},getFloatTimeDomainData(data){data.fill(0)}});
 const context={sampleRate:48000,createGain:makeNode,createStereoPanner:makeNode,createBiquadFilter:()=>Object.assign(makeNode(),{type:'lowpass'}),createDelay:makeNode,createChannelSplitter:makeNode,createAnalyser:()=>Object.assign(makeNode(),{fftSize:32,smoothingTimeConstant:0}),createDynamicsCompressor:makeNode,createWaveShaper:()=>Object.assign(makeNode(),{curve:null}),createConvolver:()=>Object.assign(makeNode(),{buffer:null}),createBuffer(){},destination:makeNode()};
 const OriginalWorklet=globalThis.AudioWorkletNode;
 globalThis.AudioWorkletNode=class extends Object{
  constructor(ctx,name,options){super();Object.assign(this,makeNode());this.context=ctx;this.name=name;this.options=options;this.port={onmessage:null,postMessage:message=>created.push(message)}}
 };
 try{
  const effect=createTrackEffect('compressor','duck');effect.params.sidechain={enabled:true,sourceTrackId:'kick',position:'pre',ghost:false,detectorGain:0,lowCut:0};
  const kick={id:'kick',volume:1,mute:false,solo:false,fx:{effects:[]}},bass={id:'bass',volume:1,mute:false,solo:false,fx:{effects:[effect]}};
  const engine=new AudioEngine();engine.ctx=context;engine.eq=context.createBiquadFilter();engine.syncTracks([kick,bass]);
  const detector=engine.trackNodes.get('bass').instances.get('duck').node;
  assert.equal(detector.name,'feed-forward-compressor');
  assert.ok(engine.trackNodes.get('kick').sidechainPre.connections.some(item=>item.target.connections.some(route=>route.target===detector&&route.input===1)));
  assert.equal(engine.trackNodes.get('bass').input.connections.some(item=>item.target===engine.trackNodes.get('bass').gain),true);
  engine.syncTracks([kick,bass]);
  assert.equal(engine.trackNodes.get('bass').sidechainConnections.length,1,'sync must not duplicate detector routes');
 }finally{
  if(OriginalWorklet===undefined)delete globalThis.AudioWorkletNode;else globalThis.AudioWorkletNode=OriginalWorklet;
 }
});
