import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMasterBuffer,createMasteringGraph,normalizeMasteringSettings} from '../src/mastering.js';
import {analyzeLoudness,analyzeSpectrum,analyzeStereo,loudnessMatchGainDb,MultibandCompressor,stereoMonitorMatrix} from '../src/mastering-dsp.js';
import {parseProject,serializeProject} from '../src/project-state.js';

function tone(frequency,amplitude=0.5,sampleRate=48000,seconds=2){
 return Float32Array.from({length:Math.round(sampleRate*seconds)},(_,frame)=>amplitude*Math.sin(2*Math.PI*frequency*frame/sampleRate));
}
function rms(data,start=0){
 let energy=0;
 for(let index=start;index<data.length;index++)energy+=data[index]*data[index];
 return Math.sqrt(energy/(data.length-start));
}
function multibandSettings(overrides={}){
 return{enabled:true,crossovers:[250,2500],bands:Array.from({length:3},()=>({enabled:false,solo:false,threshold:-18,ratio:4,attack:.01,release:.1,knee:0,makeup:0,outputGain:0})),...overrides};
}

test('multiband crossover reconstruction is level-neutral with bands bypassed',()=>{
 const sampleRate=48000,input=[tone(90,.3,sampleRate),tone(1300,.3,sampleRate)],output=input.map(channel=>new Float32Array(channel.length));
 const processor=new MultibandCompressor(sampleRate,2,multibandSettings());
 processor.process(input,output);
 for(let channel=0;channel<2;channel++){
  const start=sampleRate;
  assert.ok(Math.abs(rms(output[channel],start)/rms(input[channel],start)-1)<.015);
 }
});

test('multiband solo isolates a frequency range and bypass preserves it',()=>{
 const sampleRate=48000,input=[tone(100,.5,sampleRate)],output=[new Float32Array(input[0].length)];
 const settings=multibandSettings();settings.bands[2].solo=true;
 const processor=new MultibandCompressor(sampleRate,1,settings);
 processor.process(input,output);
 assert.ok(rms(output[0],sampleRate)<.01);
 settings.bands[2].solo=false;settings.bands[0].solo=true;settings.bands[0].enabled=false;
 const lowOutput=[new Float32Array(input[0].length)],bypassed=new MultibandCompressor(sampleRate,1,settings);
 bypassed.process(input,lowOutput);
 assert.ok(Math.abs(rms(lowOutput[0],sampleRate)/rms(input[0],sampleRate)-1)<.04);
});

test('multiband compression produces gain reduction with configured attack/release',()=>{
 const sampleRate=48000,frames=sampleRate*2,input=[new Float32Array(frames)],output=[new Float32Array(frames)];
 for(let index=0;index<frames;index++)input[0][index]=(index<sampleRate?0.8:0.1)*Math.sin(2*Math.PI*80*index/sampleRate);
 const settings=multibandSettings({bands:[
  {enabled:true,threshold:-24,ratio:8,attack:.005,release:.08,knee:0,makeup:0,outputGain:0},
  {enabled:false},{enabled:false}
 ]});
 const processor=new MultibandCompressor(sampleRate,1,settings);let maximumReduction=0;
 processor.onGainReduction=bands=>maximumReduction=Math.max(maximumReduction,bands[0]);
 processor.process(input,output);
 assert.ok(maximumReduction>10,`${maximumReduction} dB maximum GR`);
 assert.ok(Math.abs(processor.gainReduction[0])<maximumReduction*.25,'release should recover after the loud section');
});

test('multiband output is deterministic across audio render quantum sizes',()=>{
 const sampleRate=48000,input=[tone(120,.6,sampleRate,1),tone(3000,.4,sampleRate,1)],settings=multibandSettings({
  bands:[{enabled:true,threshold:-30,ratio:3,attack:.01,release:.1,knee:4,makeup:0,outputGain:0},{enabled:true,threshold:-24,ratio:2,attack:.02,release:.15,knee:6,makeup:0,outputGain:0},{enabled:true,threshold:-20,ratio:4,attack:.005,release:.1,knee:0,makeup:0,outputGain:0}]
 });
 const whole=input.map(channel=>new Float32Array(channel.length)),chunked=input.map(channel=>new Float32Array(channel.length)),a=new MultibandCompressor(sampleRate,2,settings),b=new MultibandCompressor(sampleRate,2,settings);
 a.process(input,whole);
 for(let offset=0;offset<input[0].length;offset+=128){
  const blockInput=input.map(channel=>channel.subarray(offset,offset+128)),blockOutput=chunked.map(channel=>channel.subarray(offset,offset+128));
  b.process(blockInput,blockOutput);
 }
 for(let channel=0;channel<2;channel++)for(let index=0;index<input[0].length;index++)assert.equal(chunked[channel][index],whole[channel][index]);
});

test('FFT spectrum identifies a deterministic 1 kHz sine peak',()=>{
 const sampleRate=48000,result=analyzeSpectrum([tone(1000,.5,sampleRate,1)],sampleRate,{fftSize:4096});
 let peak=1;
 for(let index=2;index<result.bins.length;index++)if(result.bins[index]>result.bins[peak])peak=index;
 assert.ok(Math.abs(peak*sampleRate/result.fftSize-1000)<15);
 assert.ok(result.bins[peak]>-8);
});

test('long-form analysis reports monotonic progress through loudness and true-peak passes',()=>{
 const progress=[],sampleRate=48000,signal=tone(440,.2,sampleRate,1);
 analyzeLoudness([signal,signal],sampleRate,{onProgress:value=>progress.push(value)});
 assert.ok(progress.length>4);
 assert.equal(progress.at(-1),1);
 assert.ok(progress.every((value,index)=>value>=0&&value<=1&&(!index||value>=progress[index-1])));
});

test('stereo analysis reports correlation, balance and mono cancellation',()=>{
 const left=tone(440,.4),same=left.slice(),opposite=Float32Array.from(left,value=>-value);
 assert.ok(analyzeStereo([left,same]).correlation>.999);
 assert.ok(Math.abs(analyzeStereo([left,same]).balanceDb)<1e-4);
 const cancellation=analyzeStereo([left,opposite]);
 assert.ok(cancellation.correlation<-.999);
 assert.ok(cancellation.monoLossDb< -100);
});

test('A/B loudness matching attenuates only and can be disabled',()=>{
 assert.equal(loudnessMatchGainDb(-18,-12,-12,true),-6);
 assert.equal(loudnessMatchGainDb(-18,-12,-18,true),0);
 assert.equal(loudnessMatchGainDb(-18,-12,-12,false),0);
 assert.equal(loudnessMatchGainDb(-18,Number.NaN,-12,true),0);
});

test('monitoring matrix performs mono, left, right, mid and side without export mutation',()=>{
 assert.deepEqual(stereoMonitorMatrix('mono'),[[.5,.5],[.5,.5]]);
 assert.deepEqual(stereoMonitorMatrix('left'),[[1,0],[1,0]]);
 assert.deepEqual(stereoMonitorMatrix('right'),[[0,1],[0,1]]);
 assert.deepEqual(stereoMonitorMatrix('mid'),[[.5,.5],[.5,.5]]);
 assert.deepEqual(stereoMonitorMatrix('side'),[[.5,-.5],[-.5,.5]]);
});

test('mastering settings persist crossovers, band dynamics, and processing order',()=>{
 const project={name:'Phase 3',bpm:120,tracks:[],mastering:normalizeMasteringSettings({
  multiband:{enabled:true,crossovers:[180,4200],bands:[{threshold:-28,ratio:5,solo:true}]},
  chainOrder:['multiband','eq','imager','saturation']
 })};
 const restored=parseProject(serializeProject(project)).mastering;
 assert.deepEqual(restored.chainOrder,['multiband','eq','imager','saturation']);
 assert.deepEqual(restored.multiband.crossovers,[180,4200]);
 assert.equal(restored.multiband.bands[0].threshold,-28);
 assert.equal(restored.multiband.bands[0].solo,true);
});

test('mastering graph honors module order and leaves the limiter after output gain',()=>{
 const param=()=>({value:0,setTargetAtTime(value){this.value=value}});
 const node=type=>({type,connections:[],connect(target){this.connections.push(target);return target},disconnect(target){this.connections=target?this.connections.filter(item=>item!==target):[]} ,gain:param(),frequency:param(),Q:param(),oversample:'none'});
 const context={
  currentTime:0,sampleRate:48000,masteringLimiterReady:true,audioWorklet:{},
  createGain(){return node('gain')},createBiquadFilter(){return node('biquad')},
  createWaveShaper(){return node('waveshaper')},createChannelSplitter(){return node('splitter')},
  createChannelMerger(){return node('merger')}
 };
 globalThis.AudioWorkletNode=class{constructor(_ctx,name){this.name=name;this.messages=[];this.port={postMessage:message=>this.messages.push(message),start(){}};this.connections=[]}connect(target){this.connections.push(target);return target}disconnect(target){this.connections=target?this.connections.filter(item=>item!==target):[]}};
 const destination=node('destination'),settings=normalizeMasteringSettings({multiband:{enabled:true},limiter:{enabled:true},chainOrder:['multiband','imager','eq','saturation']});
 const graph=createMasteringGraph(context,settings,destination);
 assert.deepEqual(graph.moduleOrder,['multiband','imager','eq','saturation']);
 assert.equal(graph.limiter.name,'egghead-lookahead-limiter');
 assert.ok(graph.limiter.connections.includes(destination));
 graph.update({...settings,chainOrder:['eq','saturation','multiband','imager']});
 assert.deepEqual(graph.moduleOrder,['eq','saturation','multiband','imager']);
 graph.update({...settings,chainBypass:true});
 assert.equal(graph.limiter.messages.at(-1).settings.enabled,true);
 assert.equal(graph.multiband.messages.at(-1).settings.enabled,false);
});

test('master audio analysis includes stereo monitoring metrics',()=>{
 const left=tone(440,.25),right=left.slice(),buffer={length:left.length,numberOfChannels:2,sampleRate:48000,getChannelData:index=>index?right:left};
 const analysis=analyzeMasterBuffer(buffer);
 assert.ok(analysis.stereo.correlation>.99);
 assert.ok(Math.abs(analysis.stereo.balanceDb)<1e-4);
});
