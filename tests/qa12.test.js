import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AudioEngine} from '../src/audio.js';
import {FACTORY_SAMPLES as generators,FACTORY_SAMPLE_RATE,factoryWav,generateFactoryPcm} from '../scripts/factory-sample-dsp.mjs';
import {FACTORY_SAMPLES,registerFactoryLibrary,registerLazySample} from '../src/factory-library.js';
import {runningBuildIdentity} from '../src/build-identity.js';
import {detectPitch} from '../src/music.js';

test('asset decoding initialization never waits for live resume, while playback initialization still resumes',async()=>{
  const engine=new AudioEngine();let resumes=0;
  engine.ctx={resume:async()=>{resumes++}};engine.masteringGraph={};
  assert.equal(await engine.init({resume:false}),engine.ctx);assert.equal(resumes,0);
  assert.equal(await engine.init(),engine.ctx);assert.equal(resumes,1);
});

test('concurrent decoding and playback wait for shared graph initialization without delaying the resume request',async()=>{
  const engine=new AudioEngine();let release,resumes=0,decoded=false,played=false;
  engine.ctx={resume:async()=>{resumes++}};engine.masteringGraph={};
  engine.initialization=new Promise(resolve=>{release=resolve});
  const decoding=engine.init({resume:false}).then(()=>{decoded=true});
  const playback=engine.init().then(()=>{played=true});
  assert.equal(resumes,1);
  await Promise.resolve();assert.equal(decoded,false);assert.equal(played,false);
  release();await Promise.all([decoding,playback]);assert.equal(decoded,true);assert.equal(played,true);
});

test('all factory WAV assets match deterministic generators, peaks, DC and declared root pitches',async()=>{
  assert.equal(FACTORY_SAMPLES.length,9);
  for(const sample of generators){
    const pcm=generateFactoryPcm(sample),wav=factoryWav(sample),asset=FACTORY_SAMPLES.find(item=>item.id===sample.id);
    const saved=await readFile(asset.url);
    assert.deepEqual(new Uint8Array(saved),wav);
    assert.deepEqual(factoryWav(sample),wav);
    const peak=pcm.reduce((maximum,value)=>Math.max(maximum,Math.abs(value)),0);
    assert.ok(Math.abs(20*Math.log10(peak)+3)<.001);
    assert.ok(Math.abs(pcm.reduce((sum,value)=>sum+value,0)/pcm.length)<1e-7);
    assert.ok(pcm.every(Number.isFinite));
    assert.ok(Math.abs(pcm[0])<.001&&Math.abs(pcm.at(-1))<.001,'endpoint clicks');
    const view=new DataView(wav.buffer);assert.equal(view.getUint32(24,true),FACTORY_SAMPLE_RATE);
    assert.equal(view.getUint16(34,true),16);assert.equal(asset.size,wav.length);
    if(sample.rootNote!==undefined){
      const pitch=detectPitch({numberOfChannels:1,length:pcm.length,sampleRate:FACTORY_SAMPLE_RATE,duration:sample.duration,getChannelData:()=>pcm});
      assert.ok(pitch&&pitch.midi===sample.rootNote,`${sample.name}: ${pitch?.frequency}`);
    }
  }
});

test('factory registration is lazy, deduplicates concurrent loads and retries explicit fetch errors',async()=>{
  const original=globalThis.fetch,assets=new Map(),buffers=new Map();let requests=0,decodes=0;
  try{
    globalThis.fetch=async()=>{requests++;return{ok:requests>1,status:503,arrayBuffer:async()=>new ArrayBuffer(4)}};
    registerFactoryLibrary(assets,buffers,async()=>{decodes++;return{duration:1}});
    assert.equal(requests,0);assert.equal(buffers.size,0);
    await assert.rejects(assets.get('factory-kick').load(),/503/);
    const [a,b]=await Promise.all([assets.get('factory-kick').load(),assets.get('factory-kick').load()]);
    assert.equal(a,b);assert.equal(decodes,1);assert.equal(requests,2);
    await assets.get('factory-kick').load();assert.equal(requests,2);
    registerFactoryLibrary(assets,buffers,()=>assert.fail('must not replace existing assets'));assert.equal(assets.size,9);
  }finally{globalThis.fetch=original}
});

test('running build display uses loaded HTML metadata, not a network or manually maintained version',()=>{
  const document={querySelector:()=>({content:'1234567890abcdefabcd'})};
  assert.deepEqual(runningBuildIdentity(document,{hostname:'127.0.0.1'}),{version:'1234567890abcdefabcd',label:'Local build 1234567890',diagnostic:'1234567890abcdefabcd'});
  assert.equal(runningBuildIdentity(document,{hostname:'eggheadstudio.github.io'}).label,'Build 1234567890');
  assert.equal(runningBuildIdentity({querySelector:()=>null},{hostname:'localhost'}).label,'Local source (unversioned)');
  assert.equal(runningBuildIdentity({querySelector:()=>null},{hostname:'eggheadstudio.github.io'}).label,'Source (unversioned)');
});

test('stored library samples remain undecoded until needed and preserve factory identity',async()=>{
  const assets=new Map(),buffers=new Map();let reads=0,decodes=0;
  const sample=registerLazySample(assets,buffers,{id:'factory-kick',factory:true,rootNote:36,name:'Kick.wav'},async()=>{reads++;return new ArrayBuffer(4)},async()=>{decodes++;return{duration:.65}});
  assert.equal(reads,0);assert.equal(decodes,0);assert.equal(buffers.size,0);
  assert.equal(sample.factory,true);assert.equal(sample.rootNote,36);
  const [a,b]=await Promise.all([sample.load(),sample.load()]);
  assert.equal(a,b);assert.equal(reads,1);assert.equal(decodes,1);assert.equal(sample.duration,.65);
  await sample.load();assert.equal(reads,1);
});
