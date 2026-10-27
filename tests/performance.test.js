import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine,estimateProjectRender} from '../src/audio.js';
import {getWaveformPeaks,getWaveformRangePeaks} from '../src/waveform.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {FeedForwardCompressorProcessor} from '../src/sidechain-processor.js';
import {createPerformanceProject,PERFORMANCE_WORKLOADS} from './performance-fixture.js';

function audioBuffer(channels,length,sampleRate){
 const data=Array.from({length:channels},()=>new Float32Array(length));
 return{length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:channel=>data[channel]};
}

test('waveform cache is reused per immutable buffer and range peaks match exact PCM scans',()=>{
 const buffer=audioBuffer(2,2049,44100);
 for(let channel=0;channel<2;channel++)for(let frame=0;frame<buffer.length;frame++)buffer.getChannelData(channel)[frame]=1.7*Math.sin(frame*(channel+1)*.41);
 const peaks=getWaveformPeaks(buffer);
 assert.strictEqual(getWaveformPeaks(buffer),peaks);
 assert.notStrictEqual(getWaveformPeaks(audioBuffer(2,2049,44100)),peaks);
 for(let channel=0;channel<2;channel++)for(const[start,end]of [[0,2049],[0,256],[3,1700],[255,257],[512,513],[2000,2049],[0,0],[2049,2100]]){
  let minimum=1,maximum=-1;
  for(let frame=start;frame<Math.min(buffer.length,end);frame++){const sample=buffer.getChannelData(channel)[frame];minimum=Math.min(minimum,sample);maximum=Math.max(maximum,sample)}
  assert.deepEqual(getWaveformRangePeaks(buffer,channel,start,end),{minimum,maximum},`channel ${channel}, ${start}–${end}`);
 }
});

test('range waveform queries only build peaks for the requested channel',()=>{
 const buffer=audioBuffer(2,1024,44100),read=buffer.getChannelData,channels=new Set();
 buffer.getChannelData=channel=>{channels.add(channel);return read(channel)};
 getWaveformRangePeaks(buffer,0,0,1024);
 assert.deepEqual([...channels],[0]);
 assert.equal(getWaveformPeaks(buffer).channels.length,2);
 assert.deepEqual([...channels],[0,1]);
});

test('preview voices release source, gain and pan nodes on natural end and transport stop',async()=>{
 const engine=new AudioEngine(),created=[],node=()=>({disconnected:0,connect(target){return target},disconnect(){this.disconnected++}});
 engine.ctx={currentTime:3,createBufferSource(){const source={...node(),playbackRate:{value:1},start(){},stop(){this.stopped=true}};created.push(source);return source},createGain(){const gain={...node(),gain:{value:1}};created.push(gain);return gain},createStereoPanner(){const pan={...node(),pan:{value:0}};created.push(pan);return pan}};
 engine.init=async()=>engine.ctx;engine.syncTracks=()=>{};engine.readMeters=()=>({});
 engine.trackNodes.set('rack',{input:node()});
 const track={id:'rack',drumRack:{pads:[{note:36,asset:'sample',volume:1}]}},buffers=new Map([['sample',audioBuffer(1,44100,44100)]]);
 await engine.previewNote(track,buffers,36);
 assert.equal(engine.sources.length,1);created[0].onended();
 assert.equal(engine.sources.length,0);assert.ok(created.every(item=>item.disconnected===1));
 await engine.previewNote(track,buffers,36);engine.stop();
 assert.equal(engine.sources.length,0);assert.equal(created[3].stopped,true);assert.ok(created.every(item=>item.disconnected===1));
});

test('sidechain block coefficients retain sample-exact legacy smoothing and settings changes',()=>{
 for(const sampleRate of [1000,44100,48000,96000]){
  const processor=new FeedForwardCompressorProcessor({processorOptions:{sampleRate}}),referenceState=[{x:0,y:0},{x:0,y:0}];
  let gainDb=0;
  for(let block=0;block<5;block++){
   const settings={threshold:-24,ratio:6,knee:block===1?0:12,attack:block<2?.005:.02,release:.2,lowCut:block===3?0:35,detectorGain:3};
   processor.port.onmessage({data:{type:'settings',settings}});
   const input=[Float32Array.from({length:128},(_,frame)=>.3*Math.sin(frame*.2)),new Float32Array(128).fill(-.2)];
   const detector=[Float32Array.from({length:128},(_,frame)=>block===4?0:.4*Math.sin(frame*.19)),new Float32Array(128)];
   const expected=[new Float32Array(128),new Float32Array(128)],actual=[new Float32Array(128),new Float32Array(128)];
   const detectorGain=10**(settings.detectorGain/20),alpha=settings.lowCut?Math.exp(-2*Math.PI*settings.lowCut/sampleRate):0;
   for(let frame=0;frame<128;frame++){
    let level=0;
    for(let channel=0;channel<2;channel++){
     const state=referenceState[channel],sample=detector[channel][frame]*detectorGain;
     let filtered=sample;
     if(settings.lowCut){filtered=alpha*(state.y+sample-state.x);state.x=sample;state.y=filtered}
     level=Math.max(level,Math.abs(filtered));
    }
    const over=20*Math.log10(Math.max(1e-8,level))-settings.threshold;
    const reduction=settings.knee>0&&over>-settings.knee/2&&over<settings.knee/2?(1-1/settings.ratio)*(over+settings.knee/2)**2/(2*settings.knee):over>0?over*(1-1/settings.ratio):0;
    const target=-reduction,time=target<gainDb?Math.max(.001,settings.attack||.01):Math.max(.01,settings.release||.2),coefficient=Math.exp(-1/(time*sampleRate));
    gainDb=target+(gainDb-target)*coefficient;
    for(let channel=0;channel<2;channel++)expected[channel][frame]=input[channel][frame]*10**(gainDb/20);
   }
   processor.process([input,detector],[actual]);
   assert.deepEqual(actual,expected,`rate ${sampleRate}, block ${block}`);
  }
 }
});

test('sidechain smoothing computes exponentials per block rather than per audio frame',()=>{
 const processor=new FeedForwardCompressorProcessor(),original=Math.exp;
 const input=[new Float32Array(128).fill(.25)],output=[new Float32Array(128)];
 let calls=0;
 Math.exp=value=>{calls++;return original(value)};
 try{processor.process([input,input],[output])}finally{Math.exp=original}
 assert.equal(calls,2,'attack and release coefficients should be computed once per block with the detector filter disabled');
});

test('archive import rejects cancellation before work and during fallback verification',async()=>{
 const project={id:'cancel-test',name:'Cancel test',bpm:120,tracks:[]},archive=await createPortableProjectArchive(project);
 const before=new AbortController();before.abort();
 await assert.rejects(openPortableProjectArchive(archive,{signal:before.signal}),{name:'AbortError'});
 const during=new AbortController();
 await assert.rejects(openPortableProjectArchive(archive,{signal:during.signal,useWorker:false,onProgress(){during.abort()}}),{name:'AbortError'});
 assert.deepEqual(project,{id:'cancel-test',name:'Cancel test',bpm:120,tracks:[]});
});

test('portable import reuses one immutable Blob for deduplicated asset IDs',async()=>{
 const buffer=audioBuffer(1,800,8000),project={id:'dedup-test',name:'Dedup test',bpm:120,tracks:[{id:'audio',clips:[{asset:'first',bar:0,start:0,end:.1},{asset:'second',bar:0,start:0,end:.1}]}]};
 const archive=await createPortableProjectArchive(project,{audioBuffers:new Map([['first',buffer],['second',buffer]])});
 const restored=await openPortableProjectArchive(archive,{useWorker:false});
 assert.equal(restored.assetFiles.size,2);
 assert.strictEqual(restored.assetFiles.get('first'),restored.assetFiles.get('second'));
 assert.equal(restored.manifest.assets.first.sha256,restored.manifest.assets.second.sha256);
});

test('archive import worker receives an immutable blob, forwards progress and terminates on success or abort',async()=>{
 const original=globalThis.Worker,workers=[];
 globalThis.Worker=class{
  constructor(url,options){this.url=url;this.options=options;workers.push(this)}
  postMessage(message){this.message=message}
  terminate(){this.terminated=true}
 };
 try{
  const input=new Uint8Array([1,2,3]),progress=[];
  const pending=openPortableProjectArchive(input,{onProgress:status=>progress.push(status)});
  const worker=workers[0];assert.equal(worker.message.type,'open');assert.ok(worker.message.input instanceof Blob);assert.equal(input.byteLength,3);
  const restored={project:{tracks:[]},assetFiles:new Map()};
  worker.onmessage({data:{type:'progress',status:{stage:'verify',progress:.5}}});
  worker.onmessage({data:{type:'done',result:restored}});
  assert.strictEqual(await pending,restored);assert.equal(worker.terminated,true);assert.equal(progress.at(-1).progress,.5);
  const controller=new AbortController(),cancelled=openPortableProjectArchive(new Blob(['archive']),{signal:controller.signal});
  controller.abort();await assert.rejects(cancelled,{name:'AbortError'});assert.equal(workers[1].terminated,true);
  const failed=openPortableProjectArchive(input);workers[2].onerror({message:'Worker load failed'});
  await assert.rejects(failed,/Worker load failed/);assert.equal(workers[2].terminated,true);
 }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original}
});

test('performance fixtures have expected durations and portable references across all workload sizes',()=>{
 for(const[size,workload]of Object.entries(PERFORMANCE_WORKLOADS)){
  const{project,buffers}=createPerformanceProject(size,audioBuffer);
  assert.equal(project.tracks.length,workload.tracks);
  assert.equal(estimateProjectRender(project,buffers).programSeconds,workload.seconds);
  assert.equal(project.tracks[1].fx.effects[0].params.sidechain.sourceTrackId,'track-3');
  assert.equal(project.mastering.limiter.enabled,true);
 }
});
