import {AudioEngine,createTrackEffect,createTrackGraph,scheduleClipSource,toWav} from '../src/audio.js';
import {migrateInstrumentArrangement} from '../src/instrument-clips.js';
import {instrumentFixture,instrumentBuffers} from './instrument-fixture.js';

// Run in a browser console: await (await import('./tests/instrument-browser-acceptance.js')).runInstrumentAcceptance()
// Legacy migration audio equivalence: runLegacyMigrationAcceptance()
export async function runInstrumentAcceptance(){
  const {project}=instrumentFixture(),sampleRate=44100,assetContext=new OfflineAudioContext(1,sampleRate,sampleRate),buffers=instrumentBuffers(assetContext),engine=new AudioEngine();
  engine.masterSettings.threshold=0;
  const offline=await engine.render(project,buffers,{bypassMastering:true}),ctx=new OfflineAudioContext(2,offline.length,sampleRate),eq=ctx.createBiquadFilter(),comp=ctx.createDynamicsCompressor();
  eq.type='highshelf';eq.frequency.value=4500;eq.gain.value=0;comp.threshold.value=0;comp.ratio.value=3;
  eq.connect(comp).connect(ctx.destination);
  const live=new AudioEngine();live.ctx=ctx;
  for(const track of project.tracks){
    const graph=createTrackGraph(ctx,track,eq,null,120);
    graph.update(track,false,120,true);live.trackNodes.set(track.id,graph);
  }
  for(let i=0;i<80;i++){
    const from=i*.1;
    live.scheduleRange(project,buffers,from,from+.1,from,i===0,Infinity);
  }
  const scheduled=await ctx.startRendering();
  let maxError=0;
  for(let channel=0;channel<2;channel++)for(let frame=0;frame<offline.length;frame++)maxError=Math.max(maxError,Math.abs(offline.getChannelData(channel)[frame]-scheduled.getChannelData(channel)[frame]));
  const wav=toWav(offline),decoded=await assetContext.decodeAudioData(await wav.arrayBuffer());
  const rms=(from,to)=>{
    let sum=0;const data=decoded.getChannelData(0),start=Math.ceil(from*sampleRate),end=Math.floor(to*sampleRate);
    for(let frame=start;frame<end;frame++)sum+=data[frame]**2;
    return Math.sqrt(sum/(end-start));
  };
  const windows={backing:rms(.1,.8),verse:rms(2.05,2.4),gap:rms(4,5),chorus:rms(6.05,6.2),fill:rms(6.51,6.57)};
  const frequency=(from,to)=>{
    const data=decoded.getChannelData(0),start=Math.ceil(from*sampleRate),end=Math.floor(to*sampleRate);let crossings=0;
    for(let frame=start+1;frame<end;frame++)if(data[frame-1]<=0&&data[frame]>0)crossings++;
    return crossings/(to-from);
  };
  const pitches={verse:frequency(2.15,2.4),chorus:frequency(6.05,6.2)};
  if(maxError>1e-4||windows.backing<.01||windows.verse<.01||windows.chorus<.01||windows.fill<.005||windows.gap>1e-6||Math.abs(pitches.verse-220)>8||Math.abs(pitches.chorus-440)>8)throw new Error(`Instrument signal acceptance failed: ${JSON.stringify({maxError,windows,pitches})}`);
  if(decoded.numberOfChannels!==2||decoded.sampleRate!==sampleRate||decoded.duration<8)throw new Error('Instrument WAV output shape is incorrect.');
  return{maxError,maximumAllowedError:1e-4,windows,pitches,wavBytes:wav.size,duration:decoded.duration,channels:decoded.numberOfChannels,sampleRate:decoded.sampleRate};
}

export async function runInstrumentRoutingAcceptance(){
  const {project,audio,sampler,drums}=instrumentFixture(),sampleRate=44100,context=new OfflineAudioContext(1,sampleRate,sampleRate),buffers=instrumentBuffers(context),engine=new AudioEngine();
  engine.masterSettings.threshold=0;audio.mute=true;drums.mute=true;
  const rms=(buffer,from,to)=>{
    const data=buffer.getChannelData(0),start=Math.ceil(from*sampleRate),end=Math.floor(to*sampleRate);let sum=0;
    for(let frame=start;frame<end;frame++)sum+=data[frame]**2;
    return Math.sqrt(sum/(end-start));
  };
  const baseline=await engine.render(project,buffers,{bypassMastering:true}),compressor=createTrackEffect('compressor','instrument-sidechain');
  Object.assign(compressor.params,{threshold:-50,ratio:20,attack:.001,release:.1,knee:0,sidechain:{enabled:true,sourceTrackId:drums.id,position:'pre',ghost:true,detectorGain:0,lowCut:0}});
  sampler.fx.effects=[compressor];
  const ducked=await engine.render(project,buffers,{bypassMastering:true});
  const baselineRms=rms(baseline,2.02,2.08),duckedRms=rms(ducked,2.02,2.08);
  if(!(baselineRms>.01&&duckedRms<baselineRms*.5))throw new Error(`Instrument sidechain did not duck the melody: ${baselineRms} -> ${duckedRms}`);
  sampler.fx.effects=[];
  project.mastering={outputGainDb:-6,limiter:{enabled:true,ceiling:-1}};
  const mastered=await engine.render(project,buffers),masteredRms=rms(mastered,2.15,2.4),dryRms=rms(baseline,2.15,2.4);
  if(masteredRms<dryRms*.4||masteredRms>dryRms*.6)throw new Error('Instrument mastering output gain was not applied exactly once.');
  sampler.mute=true;
  const muted=await engine.render(project,buffers,{bypassMastering:true});
  if(rms(muted,0,8)!==0)throw new Error('Muted instrument clips remained audible.');
  sampler.mute=false;sampler.solo=true;audio.mute=false;drums.mute=false;
  const solo=await engine.render(project,buffers,{bypassMastering:true});
  if(rms(solo,.1,.8)!==0||rms(solo,2.15,2.4)<.01)throw new Error('Instrument clip solo routing failed.');
  return{baselineRms,duckedRms,duckRatio:duckedRms/baselineRms,masteringRatio:masteredRms/dryRms,mutedRms:rms(muted,0,8),soloBackingRms:rms(solo,.1,.8)};
}

export async function runLegacyMigrationAcceptance(){
  const sampleRate=44100,context=new OfflineAudioContext(1,sampleRate,sampleRate),tone=context.createBuffer(1,sampleRate*8,sampleRate),data=tone.getChannelData(0);
  for(let frame=0;frame<tone.length;frame++)data[frame]=.15*Math.sin(2*Math.PI*220*frame/sampleRate);
  const buffers=new Map([['tone',tone]]);
  const compare=async(notes,patternBeats)=>{
    const project={name:'Legacy migration acceptance',bpm:120,patternBeats,tracks:[{
      id:'legacy-sampler',name:'Legacy Sampler',volume:1,pan:0,clips:[],
      sampler:{asset:'tone',rootNote:60,start:0,end:8,mode:'melodic',attack:.005,decay:.01,sustain:1,release:.03},
      pattern:{notes}
    }]};
    const before=await new AudioEngine().render(structuredClone(project),buffers,{bypassMastering:true});
    let serial=0;
    migrateInstrumentArrangement(project,()=>`migration-${++serial}`);
    const after=await new AudioEngine().render(project,buffers,{bypassMastering:true});
    if(before.numberOfChannels!==after.numberOfChannels||before.length!==after.length)throw new Error('Legacy migration changed rendered channel count or duration.');
    let maxSampleError=0,squaredError=0,sampleCount=0;
    for(let channel=0;channel<before.numberOfChannels;channel++){
      const original=before.getChannelData(channel),migrated=after.getChannelData(channel);
      for(let frame=0;frame<original.length;frame++){
        const error=Math.abs(original[frame]-migrated[frame]);
        maxSampleError=Math.max(maxSampleError,error);squaredError+=error*error;sampleCount++;
      }
    }
    if(maxSampleError!==0)throw new Error(`Legacy migration changed rendered audio (maximum sample error ${maxSampleError}).`);
    return{patternBeats,noteCount:notes.length,durationSeconds:before.duration,maxSampleError,rmsSampleError:Math.sqrt(squaredError/sampleCount),legacyTail:project.tracks[0].clips[0].legacyTail};
  };
  const finalNote=await compare([{beat:14,midi:60,durationBeats:4,velocity:.8}],16);
  const emptyPattern=await compare([],64);
  return{finalNote,emptyPattern,maximumAllowedSampleError:0,sampleRate};
}

export async function investigateFractionalSlices(){
  const sampleRate=44100;
  const render=async(rate,sliced,quantize)=>{
    const ctx=new OfflineAudioContext(1,sampleRate*4,sampleRate),buffer=ctx.createBuffer(1,sampleRate,sampleRate);
    for(let frame=0;frame<sampleRate;frame++)buffer.getChannelData(0)[frame]=.1*Math.sin(2*Math.PI*220*frame/sampleRate);
    const boundaries=sliced?[0,1.5,2.25,4]:[0,4];
    for(let index=0;index<boundaries.length-1;index++){
      const from=boundaries[index],to=boundaries[index+1],source=ctx.createBufferSource(),gain=ctx.createGain();
      source.buffer=buffer;source.playbackRate.value=rate;source.connect(gain).connect(ctx.destination);
      let phase=(from*rate)%1;
      if(quantize==='round')phase=Math.round(phase*sampleRate)/sampleRate;
      if(quantize==='floor')phase=Math.floor(phase*sampleRate)/sampleRate;
      scheduleClipSource(ctx,source,gain,{start:0,end:1,rate,loop:true,loopOffset:phase,duration:to-from,gain:1},from,0,to-from);
    }
    return(await ctx.startRendering()).getChannelData(0);
  };
  const results=[];
  for(const rate of [1,1.25]){
    const original=await render(rate,false);let native=null;
    for(const quantize of ['native','round','floor']){
      const sliced=await render(rate,true,quantize);let maximum=0,sum=0,versusNativeMaxError=0;
      if(quantize==='native')native=sliced;
      for(let frame=0;frame<original.length;frame++){
        const error=Math.abs(original[frame]-sliced[frame]);
        maximum=Math.max(maximum,error);sum+=error*error;
        versusNativeMaxError=Math.max(versusNativeMaxError,Math.abs(native[frame]-sliced[frame]));
      }
      results.push({rate,quantize,maxError:maximum,rmsError:Math.sqrt(sum/original.length),versusNativeMaxError});
    }
  }
  return results;
}
