import {createTrackEffect,createTrackGraph} from '../src/audio.js';
import {createMasteringGraph,normalizeMasteringSettings} from '../src/mastering.js';
import {createEqAnalyzer} from '../src/eq-analyzer.js';
import {createEqResponse,masterEqFilters,trackEqFilters} from '../src/eq-model.js';

const check=(condition,message)=>{if(!condition)throw new Error(message)};
const rms=(data,start=12000)=>Math.sqrt(data.slice(start).reduce((sum,value)=>sum+value*value,0)/(data.length-start));
const maximumDifference=(a,b)=>a.reduce((maximum,value,index)=>Math.max(maximum,Math.abs(value-b[index])),0);
export function eqFixture(context,kind='sine',frequency=1000){
  const buffer=context.createBuffer(2,context.sampleRate,context.sampleRate);
  let seed=123456;
  for(let i=0;i<buffer.length;i++){
    seed=(1664525*seed+1013904223)>>>0;
    const time=i/context.sampleRate,value=kind==='impulse'?(i===0?.1:0):kind==='noise'?(seed/4294967296-.5)*.1:kind==='sweep'?.1*Math.sin(2*Math.PI*(20*time+9980*time*time)):.1*Math.sin(2*Math.PI*frequency*time);
    buffer.getChannelData(0)[i]=value;buffer.getChannelData(1)[i]=-.5*value;
  }
  return buffer;
}
async function render(effect,{kind='sine',frequency=1000,taps=false,master=false,masterBypass=false}={}){
  const context=new OfflineAudioContext(2,48000,48000),source=context.createBufferSource();
  source.buffer=eqFixture(context,kind,frequency);
  const graph=master?createMasteringGraph(context,normalizeMasteringSettings({eq:{enabled:!masterBypass,lowCut:10,highCut:22000,bands:[{frequency:1000,gain:6,q:1,type:'peaking'}]},saturation:{enabled:false},imager:{enabled:false},limiter:{enabled:false}}),context.destination):createTrackGraph(context,{volume:1,pan:0,fx:{effects:[effect]}},context.destination);
  const branches=taps?['pre','post'].map(position=>createEqAnalyzer(context,master?graph.eqTaps[position]:graph.eqTaps.get(effect.id)[position])):[];
  source.connect(graph.input);source.start();
  const result=await context.startRendering();branches.forEach(branch=>branch.dispose());graph.disconnect();
  return result;
}
export async function runEqAudioAcceptance(){
  const effect=createTrackEffect('eq','eq-signal');effect.params.lowCutEnabled=false;effect.params.highCutEnabled=false;effect.params.bands[0]={frequency:1000,gain:6,q:1};
  const baseline=await render({...effect,enabled:false}),boost=await render(effect),boostDb=20*Math.log10(rms(boost.getChannelData(0))/rms(baseline.getChannelData(0)));
  check(Math.abs(boostDb-6)<.02,`EQ boost ${boostDb} dB`);
  effect.params.bands[0].gain=-9;
  const cut=await render(effect),cutDb=20*Math.log10(rms(cut.getChannelData(0))/rms(baseline.getChannelData(0)));
  check(Math.abs(cutDb+9)<.02,`EQ cut ${cutDb} dB`);
  effect.params.bands[0].gain=0;effect.params.lowCutEnabled=true;effect.params.lowCut=1000;
  const low=await render(effect,{frequency:100}),lowReference=await render({...effect,enabled:false},{frequency:100}),highpassDb=20*Math.log10(rms(low.getChannelData(0))/rms(lowReference.getChannelData(0)));
  check(highpassDb< -35,`High-pass attenuation ${highpassDb}`);
  effect.params.lowCutEnabled=false;effect.params.highCutEnabled=true;effect.params.highCut=1000;
  const high=await render(effect,{frequency:10000}),highReference=await render({...effect,enabled:false},{frequency:10000}),lowpassDb=20*Math.log10(rms(high.getChannelData(0))/rms(highReference.getChannelData(0)));
  check(lowpassDb< -35,`Low-pass attenuation ${lowpassDb}`);
  effect.params.highCutEnabled=false;effect.params.bands[0].gain=6;
  const fixtures=[];
  for(const kind of ['impulse','sweep','noise']){
    const plain=await render(effect,{kind}),analyzed=await render(effect,{kind,taps:true});
    const error=Math.max(...[0,1].map(channel=>maximumDifference(plain.getChannelData(channel),analyzed.getChannelData(channel))));
    check(error<1e-7,`Analyzer tap altered ${kind}: ${error}`);
    const stereo=maximumDifference(plain.getChannelData(1),Float32Array.from(plain.getChannelData(0),value=>-.5*value));
    check(stereo<1e-7,`Stereo changed on ${kind}: ${stereo}`);fixtures.push({kind,tapError:error,stereoError:stereo});
  }
  const responseContext=new OfflineAudioContext(1,1,48000),response=createEqResponse(responseContext,512);
  response.update(trackEqFilters(effect.params));
  const nearest=response.frequencies.reduce((best,value,index)=>Math.abs(value-1000)<Math.abs(response.frequencies[best]-1000)?index:best,0),responseDb=response.db[nearest];
  check(Math.abs(responseDb-boostDb)<.05,`Graph disagrees with rendered boost: ${responseDb}`);response.dispose();
  const master=await render(effect,{master:true}),masterDry=await render(effect,{master:true,masterBypass:true}),masterTaps=await render(effect,{master:true,taps:true});
  const masteringBoostDb=20*Math.log10(rms(master.getChannelData(0))/rms(masterDry.getChannelData(0)));
  check(Math.abs(masteringBoostDb-6)<.05,`Master EQ boost ${masteringBoostDb}`);
  check(maximumDifference(master.getChannelData(0),masterTaps.getChannelData(0))<1e-7,'Master taps changed audio');
  const expected=eqFixture(responseContext),bypassError=maximumDifference(masterDry.getChannelData(0).subarray(12000),expected.getChannelData(0).subarray(12000));
  check(bypassError<1e-7,`Master EQ bypass is not unity: ${bypassError}`);
  const masterFixtures=[];
  for(const kind of ['impulse','sweep','noise']){
    const plain=await render(effect,{kind,master:true}),analyzed=await render(effect,{kind,master:true,taps:true});
    const error=Math.max(...[0,1].map(channel=>maximumDifference(plain.getChannelData(channel),analyzed.getChannelData(channel))));
    const stereo=maximumDifference(plain.getChannelData(1),Float32Array.from(plain.getChannelData(0),value=>-.5*value));
    check(error<1e-7&&stereo<1e-7,`Master ${kind} taps/stereo changed: ${error}, ${stereo}`);
    masterFixtures.push({kind,tapError:error,stereoError:stereo});
  }
  const masterResponse=createEqResponse(responseContext,512);
  masterResponse.update(masterEqFilters(normalizeMasteringSettings({eq:{lowCut:10,highCut:22000,bands:[{type:'peaking',frequency:1000,gain:6,q:1}]}})));
  const masterResponseDb=masterResponse.db[nearest];masterResponse.dispose();
  check(Math.abs(masterResponseDb-masteringBoostDb)<.05,'Master graph disagrees with rendered boost.');
  return{boostDb,cutDb,highpassDb,lowpassDb,responseDb,fixtures,masteringBoostDb,masterBypassError:bypassError,masterFixtures,masterResponseDb};
}

export async function runEqLiveAcceptance(){
  const context=new AudioContext(),effect=createTrackEffect('eq','live-eq');effect.params.lowCutEnabled=false;effect.params.highCutEnabled=false;effect.params.bands[0]={frequency:1000,gain:6,q:1};
  const graph=createTrackGraph(context,{volume:1,pan:0,fx:{effects:[effect]}},context.destination),source=context.createOscillator(),level=context.createGain();
  level.gain.value=.05;source.frequency.value=1000;source.connect(level).connect(graph.input);
  const pre=createEqAnalyzer(context,graph.eqTaps.get(effect.id).pre,{smoothing:0,fftSize:8192}),post=createEqAnalyzer(context,graph.eqTaps.get(effect.id).post,{smoothing:0,fftSize:8192});
  try{
    await context.resume();source.start();
    const target=context.currentTime+.35,deadline=performance.now()+10000;
    while(context.currentTime<target){check(performance.now()<deadline,`Live AudioContext clock did not advance (${context.state}, ${context.currentTime})`);await new Promise(resolve=>setTimeout(resolve,25))}
    const input=pre.read(),output=post.read(),bin=Math.round(1000/context.sampleRate*8192),difference=output[bin]-input[bin];
    check(Math.abs(difference-6)<.1,`Live EQ difference ${difference}`);
    const instance=graph.instances.get(effect.id),probe=new Float32Array([1000]),magnitude=new Float32Array(1),phase=new Float32Array(1);instance.nodes[0].getFrequencyResponse(probe,magnitude,phase);
    check(Math.abs(20*Math.log10(magnitude[0])-difference)<.1,'Live response disagrees');
    return{sampleRate:context.sampleRate,binHz:bin*context.sampleRate/8192,preDb:input[bin],postDb:output[bin],difference};
  }finally{source.stop();pre.dispose();post.dispose();graph.disconnect();await context.close()}
}

export async function runMasterEqLiveAcceptance(){
  const context=new AudioContext(),settings=normalizeMasteringSettings({chainOrder:['saturation','eq','imager','multiband'],eq:{bands:[{type:'peaking',frequency:1000,gain:6,q:1}]},saturation:{enabled:true,drive:4,mix:1},outputGainDb:-12});
  const graph=createMasteringGraph(context,settings,context.destination),source=context.createOscillator(),level=context.createGain();
  source.frequency.value=1000;level.gain.value=.1;level.channelCount=2;level.channelCountMode='explicit';source.connect(level).connect(graph.input);
  let pre=createEqAnalyzer(context,graph.eqTaps.pre,{smoothing:0,fftSize:8192}),post=createEqAnalyzer(context,graph.eqTaps.post,{smoothing:0,fftSize:8192});
  const final=createEqAnalyzer(context,graph.postAnalyser,{smoothing:0,fftSize:8192});
  const wait=async()=>{
    const target=context.currentTime+.4,deadline=performance.now()+10000;
    while(context.currentTime<target){check(performance.now()<deadline,'Master live clock stalled');await new Promise(resolve=>setTimeout(resolve,25))}
  };
  try{
    await context.resume();source.start();await wait();
    const bin=Math.round(1000/context.sampleRate*8192),third=Math.round(3000/context.sampleRate*8192);
    const before=pre.read(),after=post.read(),output=final.read(),boostDb=after[bin]-before[bin],outputDb=output[bin]-after[bin],preHarmonic=before[third];
    check(Math.abs(boostDb-6)<.15,`Master Pre/Post ${boostDb}`);
    check(Math.abs(outputDb+12)<.15,`EQ post tap is not before final output: ${outputDb}`);
    check(preHarmonic> -80,'Pre EQ did not include upstream saturation');
    pre.dispose();post.dispose();
    graph.update({...settings,chainOrder:['eq','saturation','imager','multiband']});
    pre=createEqAnalyzer(context,graph.eqTaps.pre,{smoothing:0,fftSize:8192});post=createEqAnalyzer(context,graph.eqTaps.post,{smoothing:0,fftSize:8192});await wait();
    const reorderedHarmonic=pre.read()[third];check(reorderedHarmonic<preHarmonic-30,'Master pre tap did not follow reordered EQ');
    graph.update({...settings,eq:{...settings.eq,enabled:false}});pre.dispose();post.dispose();
    pre=createEqAnalyzer(context,graph.eqTaps.pre,{smoothing:0,fftSize:8192});post=createEqAnalyzer(context,graph.eqTaps.post,{smoothing:0,fftSize:8192});await wait();
    const bypassDifference=post.read()[bin]-pre.read()[bin];check(Math.abs(bypassDifference)<.01,'Master bypass taps differ');
    return{boostDb,outputDb,preHarmonicDb:preHarmonic,reorderedPreHarmonicDb:reorderedHarmonic,bypassDifference};
  }finally{source.stop();pre.dispose();post.dispose();final.dispose();graph.disconnect();await context.close()}
}
