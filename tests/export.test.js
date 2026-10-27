import test from 'node:test';
import assert from 'node:assert/strict';
import {
 EXPORT_MAX_MEMORY_BYTES,EXPORT_SAMPLE_RATES,encodeMp3Async,encodeWavAsync,estimateExportMemory,
 inspectMp3,inspectWav,normalizeExportSettings,prepareExportChannels,resampleChannel
} from '../src/export-dsp.js';
import {encodeExport} from '../src/export.js';
import {estimateProjectRender} from '../src/audio.js';
import {createEmptyProject,parseProject,serializeProject} from '../src/project-state.js';

function readSigned24(view,offset){
 const value=view.getUint8(offset)|(view.getUint8(offset+1)<<8)|(view.getUint8(offset+2)<<16);
 return value&0x800000?value-0x1000000:value;
}

test('WAV PCM16 uses a valid RIFF header and signed little-endian samples',async()=>{
 const channels=[Float32Array.from([0,.5,-.5,2,-2])],bytes=new Uint8Array(await encodeWavAsync(channels,44100,{bitDepth:16,dither:false}));
 const info=inspectWav(bytes),view=new DataView(bytes.buffer);
 assert.deepEqual(info,{format:'pcm',channels:1,sampleRate:44100,bitDepth:16,dataBytes:10,dataOffset:44,frames:5,duration:5/44100});
 assert.equal(String.fromCharCode(...bytes.subarray(0,4)),'RIFF');
 assert.equal(view.getUint32(4,true),46);assert.equal(view.getUint16(20,true),1);
 assert.deepEqual(Array.from({length:5},(_,i)=>view.getInt16(44+i*2,true)),[0,16384,-16384,32767,-32768]);
});

test('WAV PCM24 encodes signed 24-bit values and correct block alignment',async()=>{
 const channels=[Float32Array.from([0,.5,-.5,1,-1]),Float32Array.from([.25,-.25,.75,-.75,0])];
 const bytes=new Uint8Array(await encodeWavAsync(channels,48000,{bitDepth:24,dither:false}));
 const view=new DataView(bytes.buffer),info=inspectWav(bytes);
 assert.equal(info.bitDepth,24);assert.equal(info.channels,2);assert.equal(info.sampleRate,48000);
 assert.equal(view.getUint32(28,true),48000*6);assert.equal(view.getUint16(32,true),6);
 assert.deepEqual([readSigned24(view,44),readSigned24(view,47),readSigned24(view,50)], [0,2097152,4194304]);
 assert.equal(readSigned24(view,53),-2097152);assert.equal(readSigned24(view,56),-4194304);
});

test('WAV float32 uses IEEE float format and does not apply integer clipping or dither',async()=>{
 const bytes=new Uint8Array(await encodeWavAsync([Float32Array.from([1.25,-1.25])],96000,{bitDepth:32,dither:true}));
 const view=new DataView(bytes.buffer),info=inspectWav(bytes);
 assert.equal(info.format,'float');assert.equal(info.bitDepth,32);assert.equal(info.sampleRate,96000);
 assert.equal(view.getUint16(20,true),3);assert.equal(view.getFloat32(44,true),1.25);assert.equal(view.getFloat32(48,true),-1.25);
});

test('all supported WAV sample rates are written exactly in the fmt chunk',async()=>{
 for(const sampleRate of EXPORT_SAMPLE_RATES.wav){
  const bytes=await encodeWavAsync([new Float32Array(16)],sampleRate,{bitDepth:16,dither:false});
  assert.equal(inspectWav(bytes).sampleRate,sampleRate);
 }
});

test('TPDF dither is optional and applied once only to integer PCM',async()=>{
 const channel=[new Float32Array([0])],randomValues=[.75,.25];
 const random=()=>randomValues.shift()??.5;
 const undithered=new Uint8Array(await encodeWavAsync(channel,44100,{bitDepth:16,dither:false,random}));
 const dithered=new Uint8Array(await encodeWavAsync(channel,44100,{bitDepth:16,dither:true,random}));
 assert.equal(new DataView(undithered.buffer).getInt16(44,true),0);
 assert.equal(new DataView(dithered.buffer).getInt16(44,true),1);
});

test('windowed-sinc conversion preserves DC and limits downsampled alias energy',()=>{
 const dc=resampleChannel(new Float32Array(4410).fill(.25),44100,48000);
 assert.ok(Math.abs(dc[Math.floor(dc.length/2)]-.25)<1e-4);
 const low=Float32Array.from({length:44100},(_,i)=>.7*Math.sin(2*Math.PI*1000*i/44100));
 const downsampled=resampleChannel(low,44100,48000);
 assert.ok(Math.abs(downsampled.length-48000)<=1);
 const high=Float32Array.from({length:44100},(_,i)=>.7*Math.sin(2*Math.PI*18000*i/44100));
 const filtered=resampleChannel(high,44100,22050);
 const rms=Math.sqrt(filtered.slice(100,filtered.length-100).reduce((sum,value)=>sum+value*value,0)/(filtered.length-200));
 assert.ok(rms<.01,`aliased high-frequency RMS was ${rms}`);
});

test('mono downmix averages stereo channels and stereo upmix duplicates mono',()=>{
 const stereo=[Float32Array.from([.5,-.5]),Float32Array.from([-.25,.25])];
 assert.deepEqual(Array.from(prepareExportChannels(stereo,1)[0]),[.125,-.125]);
 const duplicated=prepareExportChannels([Float32Array.from([.1,.2])],2);
 assert.deepEqual(Array.from(duplicated[0]),Array.from(duplicated[1]));
});

test('export settings use verified format-specific sample rates and persist by JSON round trip',()=>{
 for(const rate of [44100,48000,88200,96000])assert.ok(EXPORT_SAMPLE_RATES.wav.includes(rate));
 assert.deepEqual(EXPORT_SAMPLE_RATES.mp3,[44100,48000]);
 const saved=JSON.parse(JSON.stringify({exportSettings:normalizeExportSettings({format:'mp3',sampleRate:48000,bitrate:256,channels:1,mastering:false})}));
 assert.deepEqual(normalizeExportSettings(saved.exportSettings),{format:'mp3',bitDepth:24,bitrate:256,sampleRate:48000,channels:1,mastering:false,dither:true,advanced:false});
 assert.equal(normalizeExportSettings({format:'mp3',sampleRate:96000}).sampleRate,44100);
});

test('MP3 encoder writes valid stereo frames at every supported bitrate',async()=>{
 const sampleRate=44100,length=sampleRate/4|0;
 const channels=[
  Float32Array.from({length},(_,i)=>.25*Math.sin(2*Math.PI*440*i/sampleRate)),
  Float32Array.from({length},(_,i)=>.25*Math.sin(2*Math.PI*660*i/sampleRate))
 ];
 for(const bitrate of [128,192,256,320]){
  const bytes=await encodeMp3Async(channels,sampleRate,bitrate),info=inspectMp3(bytes);
  assert.ok(bytes.length>1000);
  assert.equal(info.sampleRate,sampleRate);assert.equal(info.channels,2);assert.ok(info.frames>=8);
  assert.ok(info.bitrates.includes(bitrate),`missing ${bitrate} kbps frame`);
  assert.ok(Math.abs(info.duration-length/sampleRate)<.1);
 }
});

test('MP3 encoding at 48 kHz and mono preserves the requested stream layout',async()=>{
 const sampleRate=48000,length=12000,mono=[Float32Array.from({length},(_,i)=>.3*Math.sin(2*Math.PI*330*i/sampleRate))];
 const info=inspectMp3(await encodeMp3Async(mono,sampleRate,192));
 assert.equal(info.sampleRate,48000);assert.equal(info.channels,1);assert.ok(info.bitrates.includes(192));
});

test('MP3 encoder rejects unsupported rate and bitrate instead of silently substituting',async()=>{
 const samples=[new Float32Array(2000)];
 await assert.rejects(encodeMp3Async(samples,96000,320),RangeError);
 await assert.rejects(encodeMp3Async(samples,44100,2560),RangeError);
});

test('export memory estimator blocks outputs beyond its documented ceiling',()=>{
 const large=estimateExportMemory(600,{format:'wav',bitDepth:24,sampleRate:96000,channels:2});
 assert.ok(large.estimatedPeakBytes>EXPORT_MAX_MEMORY_BYTES);
 assert.equal(large.allowed,false);
 const small=estimateExportMemory(2,{format:'wav',bitDepth:24,sampleRate:44100,channels:2});
 assert.equal(small.allowed,true);
});

test('legacy projects receive and persist export settings without losing compatibility',()=>{
 const project=createEmptyProject('Old format');
 project.exportSettings={format:'mp3',bitrate:256,sampleRate:48000,channels:2,mastering:false};
 const restored=parseProject(serializeProject(project));
 assert.deepEqual(normalizeExportSettings(restored.exportSettings),{
  format:'mp3',bitDepth:24,bitrate:256,sampleRate:48000,channels:2,mastering:false,dither:true,advanced:false
 });
 assert.equal(normalizeExportSettings(parseProject(serializeProject(createEmptyProject())).exportSettings).format,'wav');
});

test('render-duration estimate includes arrangement end, instrument notes and effect tails',()=>{
 const buffers=new Map([['clip',{duration:1}]]),project={
  bpm:120,patternBeats:16,tracks:[
   {clips:[{asset:'clip',bar:5,start:0,end:1,rate:1}],fx:{effects:[]}},
   {clips:[],sampler:{asset:'sample'},pattern:{notes:[{beat:20}]},fx:{effects:[{enabled:true,type:'reverb',params:{decay:2}}]}}
  ]
 };
 const duration=estimateProjectRender(project,buffers);
 assert.equal(duration.programSeconds,11);
 assert.equal(duration.tailSeconds,3);
 assert.equal(duration.durationSeconds,14);
});

test('render-duration estimate retains sampler notes that extend past their pattern end',()=>{
 const sample={duration:4},project={bpm:120,patternBeats:16,tracks:[{
  clips:[],sampler:{asset:'sample',start:0,end:4,mode:'melodic',rootNote:60},pattern:{notes:[{midi:60,beat:15,durationBeats:4}]},fx:{effects:[]}
 }]};
 const duration=estimateProjectRender(project,new Map([['sample',sample]]));
 assert.equal(duration.programSeconds,8);
 assert.ok(Math.abs(duration.durationSeconds-9.8)<1e-9);
});

test('export worker cancellation terminates worker and rejects clearly',async()=>{
 const originalWorker=globalThis.Worker;
 let terminated=false;
 globalThis.Worker=class{
  postMessage(){}
  terminate(){terminated=true}
 };
 try{
  const controller=new AbortController(),buffer={numberOfChannels:1,length:44100,duration:1,sampleRate:44100,getChannelData:()=>new Float32Array(44100)};
  const promise=encodeExport(buffer,{format:'wav',bitDepth:16,sampleRate:44100},{signal:controller.signal});
  controller.abort(new DOMException('cancel test','AbortError'));
  await assert.rejects(promise,{name:'AbortError'});
  assert.equal(terminated,true);
 }finally{
  if(originalWorker===undefined)delete globalThis.Worker;
  else globalThis.Worker=originalWorker;
 }
});
