import test from 'node:test';
import assert from 'node:assert/strict';
import {composeMagnitudes,createEqResponse,dragEqBand,frequencyLimit,frequencyToUnit,gainToUnit,masterEqFilters,trackEqFilters,unitToFrequency,unitToGain} from '../src/eq-model.js';
import {createEqAnalyzer} from '../src/eq-analyzer.js';
import {normalizeMasteringSettings} from '../src/mastering.js';
import {createTrackEffect,createTrackGraph} from '../src/audio.js';
import {parseProject,serializeProject} from '../src/project-state.js';

for(const sampleRate of [8000,22050,44100,48000,96000]){
  test(`log frequency / pixel coordinates round trip below Nyquist at ${sampleRate}`,()=>{
    const width=317;
    for(const unit of [0,.01,.25,.5,.75,1]){
      const frequency=unitToFrequency(unit,sampleRate),pixel=frequencyToUnit(frequency,sampleRate)*width;
      assert.ok(Math.abs(pixel-unit*width)<1e-10);
      assert.ok(Math.abs(unitToFrequency(pixel/width,sampleRate)-frequency)<1e-8);
      assert.ok(frequency<sampleRate/2);
    }
    assert.ok(Math.abs(unitToFrequency(.5,sampleRate)-Math.sqrt(20*frequencyLimit(sampleRate)))<1e-9);
  });
}
test('invalid sample rates are rejected and axes clamp outside graph bounds',()=>{
  assert.throws(()=>frequencyLimit(NaN),RangeError);assert.throws(()=>frequencyLimit(4000),RangeError);
  assert.equal(unitToFrequency(-1),20);assert.equal(frequencyToUnit(999999),1);
});
test('gain / vertical pixel coordinates round trip at track and master ranges',()=>{
  for(const range of [18,24])for(const gain of [-range,-6,0,6,range]){
    const pixel=gainToUnit(gain,range)*190;assert.ok(Math.abs(unitToGain(pixel/190,range)-gain)<1e-10);
  }
});
test('node dragging uses logarithmic horizontal and linear vertical deltas with Shift fine adjustment',()=>{
  const band={frequency:1000,gain:0},normal=dragEqBand(band,.1,-.1),fine=dragEqBand(band,.1,-.1,{fine:true});
  assert.ok(normal.frequency>fine.frequency&&fine.frequency>1000);
  assert.ok(Math.abs(normal.gain-4.8)<1e-10);assert.ok(Math.abs(fine.gain-.48)<1e-10);
  assert.equal(dragEqBand(band,10,10).gain,-24);
});
test('native cascaded magnitudes add in dB, not Gaussian drawing approximations',()=>{
  const out=composeMagnitudes([new Float32Array([2,.5,1]),new Float32Array([.5,2,1])],new Float32Array(3));
  assert.ok(out.every(db=>Math.abs(db)<1e-6));
  assert.ok(Math.abs(composeMagnitudes([new Float32Array([2])],new Float32Array(1))[0]-6.0206)<1e-4);
});
test('track filters retain legacy four bells and cut Q while respecting additive types and enables',()=>{
  const legacy=trackEqFilters({frequency:1234,gain:5,q:2});
  assert.equal(legacy.length,6);assert.equal(legacy[1].frequency,1234);assert.equal(legacy[1].gain,5);assert.equal(legacy[0].q,1);
  const effect=createTrackEffect('eq');effect.params.bands[0]={type:'lowshelf',frequency:300,gain:8,q:2,enabled:false};
  effect.params.lowCutEnabled=false;
  const filters=trackEqFilters(effect.params,22050);
  assert.equal(filters[1].gain,0);assert.equal(filters[1].type,'lowshelf');assert.equal(filters[0].type,'peaking');
  assert.ok(filters.at(-1).frequency<=11025);
});
test('master filters retain six independent bands, cuts and normalized supported types',()=>{
  const settings=normalizeMasteringSettings({eq:{lowCutEnabled:false,bands:[{type:'highshelf',gain:6,enabled:false}]}});
  const filters=masterEqFilters(settings,22050);assert.equal(filters.length,8);
  assert.equal(filters[0].type,'peaking');assert.equal(filters[1].type,'highshelf');assert.equal(filters[1].gain,0);assert.equal(filters[0].q,.707);
  assert.equal(filters.at(-1).frequency,11025);
});
test('response engine configures actual native filters and bypass gives zero dB',()=>{
  const nodes=[],context={sampleRate:48000,createBiquadFilter(){
    const node={frequency:{},gain:{},Q:{},getFrequencyResponse(frequencies,magnitude){magnitude.fill(2)},disconnect(){this.disconnected=true}};nodes.push(node);return node;
  }};
  const response=createEqResponse(context,64),filters=trackEqFilters();
  assert.ok(Math.abs(response.update(filters)[0]-6*20*Math.log10(2))<1e-4);
  assert.equal(nodes[0].type,'highpass');assert.equal(nodes[0].Q.value,1);
  assert.ok(response.update(filters,true).every(value=>value===0));response.dispose();assert.ok(nodes.every(node=>node.disconnected));
});
test('analyzer branches attach once, resize buffers only for FFT change and dispose idempotently',()=>{
  const edges=[],tap={connect(node){edges.push(node)},disconnect(node){edges.splice(edges.indexOf(node),1)}};
  let created=0;
  const context={destination:{},createAnalyser(){created++;return{fftSize:4096,get frequencyBinCount(){return this.fftSize/2},connect(){},disconnect(){this.closed=true},getFloatFrequencyData(data){data.fill(-80)}}},createGain(){return{gain:{},connect(){},disconnect(){this.closed=true}}}};
  const analyzer=createEqAnalyzer(context,tap);assert.equal(edges.length,1);const initial=analyzer.data;
  analyzer.read();assert.equal(analyzer.data,initial);analyzer.configure(4096,.5);assert.equal(analyzer.data,initial);
  analyzer.configure(8192,.5);assert.equal(analyzer.data.length,4096);assert.equal(created,1);
  analyzer.dispose();analyzer.dispose();assert.equal(edges.length,0);assert.throws(()=>analyzer.read(),/disposed/);
});
test('additive EQ type/enable/cut state round trips without a project schema migration',()=>{
  const effect=createTrackEffect('eq');effect.params.bands[1]={...effect.params.bands[1],type:'highshelf',enabled:false};
  effect.params.highCutEnabled=false;
  const restored=parseProject(serializeProject({name:'EQ',bpm:120,tracks:[{id:'one',clips:[],fx:{effects:[effect]}}]}));
  assert.deepEqual(restored.tracks[0].fx.effects[0],effect);
});
test('bypassed EQ taps follow reordering, removal and insertion without rebuilding the audible chain',()=>{
  const node=()=>({connections:[],connect(target){this.connections.push(target);return target},disconnect(){},gain:{},pan:{},frequency:{},Q:{},delayTime:{}});
  const context={sampleRate:48000,createGain:node,createStereoPanner:node,createBiquadFilter:node,createDelay:node,createChannelSplitter:node,createAnalyser:()=>({...node(),fftSize:32})};
  const eq=createTrackEffect('eq','eq'),delay=createTrackEffect('delay','delay');eq.enabled=false;
  const track={id:'one',fx:{effects:[eq,delay]}},graph=createTrackGraph(context,track,node()),initial=graph.eqTaps.get(eq.id).pre;
  track.fx.effects=[delay,eq];graph.update(track);
  const output=graph.instances.get(delay.id).dry.connections[0];
  assert.equal(graph.eqTaps.get(eq.id).pre,output);assert.equal(graph.eqTaps.get(eq.id).post,output);
  assert.notEqual(output,initial);assert.equal(graph.signature,'delay:delay');
  track.fx.effects=[delay];graph.update(track);assert.equal(graph.eqTaps.size,0);
  track.fx.effects=[eq,delay];graph.update(track);assert.equal(graph.eqTaps.get(eq.id).pre,initial);
  graph.disconnect();
});
