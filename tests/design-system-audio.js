import {AudioEngine,createTrackEffect,toWav} from '../src/audio.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {encodeExport} from '../src/export.js';
import {instrumentFixture,instrumentBuffers} from './instrument-fixture.js';
import {updateTrackMeters} from '../src/meter-ui.js';

export async function runEditedControlAudioAcceptance({fixture=false,skipLive=false}={}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  let project=JSON.parse(localStorage.getItem('pulse-project'));
  if(fixture){
    project=instrumentFixture().project;project.name='Design System Acceptance';project.schemaVersion=2;
    const sampler=project.tracks.find(track=>track.sampler);
    sampler.fx.effects=['utility','compressor','delay','reverb','saturation','limiter'].map(type=>createTrackEffect(type));
    sampler.fx.effects[0].params.gain=-8;sampler.fx.cutoff=2100;
  }
  check(project?.name==='Design System Acceptance','Run the design-system UI acceptance first.');
  const ids=new Set(project.tracks.flatMap(track=>[...track.clips.map(clip=>clip.asset),track.sampler?.asset,...(track.drumRack?.pads||[]).map(pad=>pad.asset)].filter(Boolean)));
  const files=new Map(),buffers=new Map(),context=new OfflineAudioContext(2,1,44100);
  const db=fixture?null:await new Promise((resolve,reject)=>{const request=indexedDB.open('pulse-studio-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  try{
    const generated=fixture?instrumentBuffers(context):null;
    for(const id of ids){
      const file=fixture?toWav(generated.get(id)):await new Promise((resolve,reject)=>{const request=db.transaction('assets').objectStore('assets').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      check(file,`Missing ${id}`);files.set(id,file);buffers.set(id,await context.decodeAudioData(await file.arrayBuffer()));
    }
  }finally{db?.close()}
  const archive=await createPortableProjectArchive(project,{assetFiles:files,audioBuffers:buffers}),restored=await openPortableProjectArchive(archive);
  check(JSON.stringify(restored.project.tracks)===JSON.stringify(project.tracks),'EHS round trip changed edited controls/patterns.');
  const engine=new AudioEngine(),rendered=await engine.render(restored.project,buffers),outputs=[];
  for(const format of ['wav','mp3']){
    const output=await encodeExport(rendered,{format,bitDepth:24,bitrate:320,sampleRate:44100,channels:2,dither:false});
    const decoded=await context.decodeAudioData(await output.blob.arrayBuffer());let peak=0,squares=0;
    for(let channel=0;channel<decoded.numberOfChannels;channel++)for(const value of decoded.getChannelData(channel)){peak=Math.max(peak,Math.abs(value));squares+=value*value}
    const rms=Math.sqrt(squares/(decoded.length*decoded.numberOfChannels));
    check(rms>1e-5&&peak<1,`${format} output is silent or clipping.`);
    outputs.push({format,bytes:output.blob.size,frames:decoded.length,rms,peak});
  }
  // Use only the UI-edited Utility in this probe so nonlinear dynamics do not
  // obscure the expected amplitude ratio.
  const probe=structuredClone(project),track=probe.tracks.find(track=>track.sampler),utility=track.fx.effects.find(effect=>effect.type==='utility');
  probe.tracks=[track];track.fx.effects=[utility];track.fx.cutoff=20000;track.fx.delay=0;track.volume=.5;track.pan=0;
  utility.params={gain:0,pan:0,width:1,invert:false};probe.masterSettings={};
  engine.setMaster({threshold:0,eq:0,makeup:0,volume:1});
  const dry=await engine.render(probe,buffers,{bypassMastering:true});utility.params.gain=-12;
  const attenuated=await engine.render(probe,buffers,{bypassMastering:true});
  const rms=buffer=>{let sum=0;for(const value of buffer.getChannelData(0))sum+=value*value;return Math.sqrt(sum/buffer.length)};
  const offlineRatio=rms(attenuated)/rms(dry);
  check(Math.abs(20*Math.log10(offlineRatio)+12)<.02,'UI-bound Utility gain did not produce expected offline attenuation.');
  const result={container:restored.manifest.formatVersion,schema:restored.project.schemaVersion,archiveBytes:archive.size,assets:restored.assetFiles.size,editedEffectTypes:restored.project.tracks.find(track=>track.sampler).fx.effects.map(effect=>effect.type),outputs,offlineGainDb:20*Math.log10(offlineRatio)};
  if(skipLive)return result;
  const live=new AudioEngine();let liveRatio;
  try{
    live.setMaster({threshold:0,eq:0,makeup:0,volume:1});
    await live.init();
    const buffer=live.ctx.createBuffer(1,3200,live.ctx.sampleRate),source=live.ctx.createBufferSource();
    buffer.getChannelData(0).forEach((_,index,data)=>{data[index]=.2*Math.sin(2*Math.PI*index/32)});
    const waitForAudio=async seconds=>{
      const target=live.ctx.currentTime+seconds,deadline=performance.now()+10000;
      while(live.ctx.currentTime<target){
        check(performance.now()<deadline,'Live AudioContext clock did not advance.');
        await new Promise(resolve=>setTimeout(resolve,25));
      }
    };
    source.buffer=buffer;source.loop=true;live.syncTracks([track],project.bpm);source.connect(live.trackNodes.get(track.id).input);source.start();
    try{
      await waitForAudio(.3);
      const quietLevels=live.readMeters()[track.id],quiet=quietLevels.leftRms;
      utility.params.gain=0;live.syncTracks([track],project.bpm);
      await waitForAudio(.3);
      const loudLevels=live.readMeters()[track.id],loud=loudLevels.leftRms;liveRatio=quiet/loud;
      check(loud>.001&&Math.abs(20*Math.log10(liveRatio)+12)<.3,`Live Utility attenuation differs from offline expectation: quiet=${quiet}, loud=${loud}, dB=${20*Math.log10(liveRatio)}, context=${live.ctx.state}, time=${live.ctx.currentTime}.`);
      const root=document.createElement('div');
      root.style.cssText='position:fixed;left:10px;top:10px;width:160px;height:60px;z-index:9999';
      root.innerHTML='<div data-meter="probe" data-track-name="Probe"><span data-meter-left></span><span data-meter-right></span><span data-clip-warning hidden></span><output class="meter-peak"></output></div>';
      document.body.append(root);
      try{
        updateTrackMeters(root,{probe:loudLevels});
        const meter=root.querySelector('[data-meter-left]'),width=meter.style.width;
        check(parseFloat(width)>0&&root.querySelector('output').value.includes('dBFS'),'Measured meter did not update.');
        root.hidden=true;updateTrackMeters(root,{probe:quietLevels});
        check(meter.style.width===width,'Hidden meter was updated.');
        root.hidden=false;root.style.left='-10000px';updateTrackMeters(root,{probe:quietLevels});
        check(meter.style.width===width,'Offscreen meter was updated.');
        result.meters={measuredPeak:loudLevels.leftPeak,hiddenSkipped:true,offscreenSkipped:true};
      }finally{root.remove()}
    }finally{source.stop();source.disconnect()}
  }finally{
    live.stop();for(const graph of live.trackNodes.values())graph.disconnect();live.trackNodes.clear();live.masteringGraph?.disconnect();
    if(live.ctx)await live.ctx.close();
  }
  return{...result,liveGainDb:20*Math.log10(liveRatio)};
}
