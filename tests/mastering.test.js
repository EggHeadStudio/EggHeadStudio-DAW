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
import {parseProject,serializeProject} from '../src/project-state.js';

function fakeContext(){
  const nodes=[];
  const param=()=>({value:0,setTargetAtTime(value){this.value=value}});
  const node=type=>({type,connections:[],connect(target,...ports){this.connections.push({target,ports});return target},disconnect(){this.connections=[]},gain:param(),frequency:param(),Q:param(),threshold:param(),ratio:param(),knee:param(),attack:param(),release:param(),oversample:'none',curve:null});
  return{
    currentTime:1,
    sampleRate:48000,
    nodes,
    createGain(){const result=node('gain');nodes.push(result);return result},
    createBiquadFilter(){const result=node('biquad');nodes.push(result);return result},
    createWaveShaper(){const result=node('waveshaper');nodes.push(result);return result},
    createDynamicsCompressor(){const result=node('compressor');nodes.push(result);return result},
    createChannelSplitter(){const result=node('splitter');nodes.push(result);return result},
    createChannelMerger(){const result=node('merger');nodes.push(result);return result}
  };
}

test('mastering settings normalize six EQ bands and clamp unsafe values',()=>{
  const settings=normalizeMasteringSettings({outputGainDb:90,imager:{width:4},eq:{bands:[{frequency:1,gain:40,q:0}]}});
  assert.equal(settings.eq.bands.length,6);
  assert.equal(settings.eq.bands[0].frequency,20);
  assert.equal(settings.eq.bands[0].gain,18);
  assert.equal(settings.eq.bands[0].q,.1);
  assert.equal(settings.outputGainDb,24);
  assert.equal(settings.imager.width,1.5);
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
  assert.equal(graph.limiter.threshold.value,-2);
  assert.equal(graph.limiter.ratio.value,20);
  assert.ok(Math.abs(graph.inputTrim.gain.value-10**(6/20))<1e-6);
  assert.equal(context.nodes.find(item=>item.type==='waveshaper').oversample,'4x');
  const inverter=context.nodes.filter(item=>item.type==='gain').find(item=>item.gain.value===-1);
  assert.ok(inverter);
  graph.update({...settings,imager:{enabled:true,width:.5},limiter:{enabled:false,ceiling:-1}});
  assert.equal(graph.limiter.ratio.value,1);
  assert.equal(graph.limiter.threshold.value,0);
  assert.equal(graph.input.connections[0].target.type,'gain');
  assert.equal(graph.input.connections[0].target.connections[0].target.type,'highpass');
  assert.ok(graph.nodes.at(-1).connections.some(connection=>connection.target===destination));
});

test('master presets change real DSP parameters and are independent of defaults',()=>{
  const balanced=normalizeMasteringSettings(),electronic=normalizeMasteringSettings({...balanced,...MASTERING_PRESETS['Electronic / EDM']});
  assert.equal(electronic.saturation.enabled,true);
  assert.equal(electronic.imager.enabled,true);
  assert.notEqual(electronic.eq.bands[0].gain,balanced.eq.bands[0].gain);
  electronic.eq.bands[0].gain=12;
  assert.equal(MASTERING_PRESETS['Electronic / EDM'].eq.bands[0].gain,1.2);
});

test('mastering controls persist through the existing project JSON format',()=>{
  const project={name:'Master Test',bpm:120,tracks:[],mastering:normalizeMasteringSettings({...DEFAULT_MASTERING_SETTINGS,preset:'Electronic / EDM',inputGainDb:2,outputGainDb:-2})};
  const restored=parseProject(serializeProject(project));
  assert.equal(restored.mastering.preset,'Electronic / EDM');
  assert.equal(restored.mastering.inputGainDb,2);
  assert.equal(restored.mastering.outputGainDb,-2);
  assert.equal(restored.mastering.eq.bands.length,6);
});

test('master analysis reports RMS and sample peak without mislabeling LUFS',()=>{
  const channels=[Float32Array.from([0,.5,-.5,1]),Float32Array.from([0,.5,-.5,0])];
  const analysis=analyzeMasterBuffer({length:4,numberOfChannels:2,getChannelData:index=>channels[index]});
  assert.equal(analysis.samplePeak,1);
  assert.ok(Math.abs(analysis.rms-Math.sqrt(2/8))<1e-12);
  assert.equal(analysis.rmsDbfs,20*Math.log10(analysis.rms));
  assert.equal('lufs' in analysis,false);
  assert.throws(()=>analyzeMasterBuffer(null),TypeError);
});
