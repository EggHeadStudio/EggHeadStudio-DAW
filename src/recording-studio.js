import {RecordingCapture,describeCaptureError} from './recording-capture.js';
import {activateRecordingTake,calibrationKey,loopbackTestSignal,measureLoopbackLatency,normalizeCalibrationStore,recordingBackingProject,recordingCompensation,recordingTiming} from './recording-model.js';
import {commitRecordedTake,quotaFailure} from './recording-session.js';
import {encodeWavAsync} from './export-dsp.js';
import {scheduleClipSource,uid} from './audio.js';
import {formatTransportTime} from './timeline.js';
import {organizeRecordingStudio} from './studio-workflows.js';

const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CALIBRATION_STORE='ehs-recording-calibration',LAST_DEVICE='ehs-recording-last-device';
const loadCalibrations=()=>{try{return normalizeCalibrationStore(JSON.parse(localStorage.getItem(CALIBRATION_STORE)||'{}'))}catch{return{}}};
export class RecordingStudio{
  constructor(options){
    Object.assign(this,options);this.selection=new Map();this.state='idle';this.armed=false;this.trackId=null;this.clicks=[];this.monitoring=false;this.punch={enabled:false,inBeat:0,outBeat:4,preRollBars:1};
  }
  get busy(){return this.state!=='idle'}
  playbackProject(){return recordingBackingProject(this.getProject(),this.selection)}
  settings(){return{countInBars:0,offsetMs:0,metronome:false,metronomeVolume:.15,...this.getProject().recordingSettings}}
  lookaheadSeconds(){const graph=this.engine.masteringGraph,context=this.engine.ctx;return graph&&context?(graph.latencyFrames||0)/context.sampleRate:0}
  compensation(deviceId=localStorage.getItem(LAST_DEVICE)||''){
    const context=this.engine.ctx,rate=context?.sampleRate||48000;
    return recordingCompensation({baseLatency:context?.baseLatency||0,outputLatency:context?.outputLatency||0,lookaheadSeconds:this.lookaheadSeconds(),calibration:loadCalibrations()[calibrationKey(deviceId,rate)]});
  }
  describeCompensation(){
    const value=this.compensation(),ms=seconds=>`${(seconds*1000).toFixed(1)} ms`;
    return value.source==='loopback'?`Active: measured loopback round trip ${ms(value.roundTripSeconds)} + mastering lookahead ${ms(value.lookaheadSeconds)} = ${ms(value.seconds)}.`:`Active: browser-reported base ${ms(value.baseLatency)} + output ${ms(value.outputLatency)} + mastering lookahead ${ms(value.lookaheadSeconds)} = ${ms(value.seconds)}. Input latency is assumed 0 (not measured).`;
  }
  mount(root){
    const advancedOpen=Boolean(root.querySelector('.recording-advanced')?.open);
    this.root=root;const project=this.getProject(),settings=this.settings(),audio=project.tracks.filter(track=>!track.sampler&&!track.drumRack);
    if(!audio.some(track=>track.id===this.trackId)){this.trackId=audio[0]?.id||null;this.armed=false}
    const target=audio.find(track=>track.id===this.trackId),takes=target?.clips.filter(clip=>clip.recording)||[];
    root.innerHTML=`<section class="studio recording-studio"><div class="section-title"><h2>Recording Studio</h2><p>Vocal &amp; Live Instrument Recording · existing Audio tracks, one microphone input.</p></div>
      <p class="hint">Use headphones: speakers can bleed into the microphone. Input monitoring defaults OFF and has browser/device latency, especially Bluetooth. Recording is linear; Arrangement looping is not used. PCM takes are limited to 5 minutes to bound memory.</p>
      <div class="recording-controls"><button id="studioRecord" class="accent">Record</button><button id="studioStop">Stop &amp; Save Take</button><button id="studioCancel">Cancel Recording</button><output id="recordingStatus" role="status">Idle</output><output id="recordingTime">00:00.000</output></div>
      <div class="recording-options"><label>Recording track <select id="recordingTrack"><option value="">Select Audio track</option>${audio.map(track=>`<option value="${esc(track.id)}" ${track.id===this.trackId?'selected':''}>${esc(track.name)}</option>`).join('')}</select></label><button id="newRecordingTrack">+ Audio Recording Track</button><label>Track name <input id="recordingTrackName" maxlength="80" value="${esc(target?.name||'')}"></label><label>Arm <input id="recordingArm" type="checkbox" ${this.armed?'checked':''}></label>
      <label>Start position (beats) <input id="recordingPosition" type="number" min="0" step=".25" value="${(this.engine.position()*project.bpm/60).toFixed(3)}"></label><label>Count-in <select id="recordingCountIn">${[0,1,2,4].map(bars=>`<option value="${bars}" ${bars===settings.countInBars?'selected':''}>${bars?`${bars} bar${bars>1?'s':''}`:'Off'}</option>`).join('')}</select></label><label>Offset compensation (ms) <input id="recordingOffset" type="number" min="-2000" max="2000" step="1" value="${settings.offsetMs}"></label>
      <label>Metronome <input id="recordingMetronome" type="checkbox" ${settings.metronome?'checked':''}></label><label>Click volume <input id="recordingClickVolume" type="range" min="0" max=".5" step=".01" value="${settings.metronomeVolume}"></label><label>Input Monitoring <input id="recordingMonitor" type="checkbox" ${this.monitoring?'checked':''}></label><span id="monitorStatus">Monitoring OFF</span></div>
      <p class="hint" id="compensationHint">Positive offset moves the take earlier; negative moves it later. ${esc(this.describeCompensation())} The manual offset is applied in addition. Placement uses AudioContext sample frames, not MediaRecorder timestamps.</p>
      <details class="recording-punch"><summary>Punch In / Punch Out (optional)</summary><div class="recording-options"><label>Punch recording <input id="punchEnable" type="checkbox" ${this.punch.enabled?'checked':''}></label><label>Punch in (beats) <input id="punchIn" type="number" min="0" step=".25" value="${this.punch.inBeat}"></label><label>Punch out (beats) <input id="punchOut" type="number" min="0" step=".25" value="${this.punch.outBeat}"></label><label>Pre-roll <select id="punchPreRoll">${[0,1,2,4].map(bars=>`<option value="${bars}" ${bars===this.punch.preRollBars?'selected':''}>${bars?`${bars} bar${bars>1?'s':''}`:'None'}</option>`).join('')}</select></label></div><p class="hint">Backing starts at the pre-roll point; capture begins at punch-in and ends at punch-out on the audio clock (no timers). The take is a new clip covering only the punch region. Existing recorded takes are split without copying audio: the covered middle section becomes a muted alternate and audio before and after the punch stays audible. Arrangement looping is ignored while recording.</p></details>
      <details class="recording-calibration"><summary>Recording Latency Calibration (optional)</summary><p class="hint">Plays a short known chirp and finds it in the microphone input by cross-correlation. This measures the <b>total round trip</b> (browser output + device output + acoustic or cable path + device input), not input latency alone. Use speakers near the microphone or a loopback cable; headphones alone will not be heard. Mastering lookahead is added separately. Calibration is stored in this browser for the detected input device and never changes project audio.</p><div class="recording-options"><button id="calibrateRun">Run loopback test</button><button id="calibrateClear">Clear saved calibration</button></div><output id="calibrationResult" role="status">${esc(this.describeCompensation())}</output></details>
      <div class="recording-wave-panel"><canvas id="recordingWave" width="1000" height="140" aria-label="Live microphone waveform"></canvas><meter id="recordingLevel" min="0" max="1" value="0" aria-label="Microphone input peak"></meter><output id="recordingClip">Microphone inactive</output></div>
      <details class="recording-backing" open><summary>Backing Tracks</summary><p class="hint">Session-only enable/volume controls. Original track mute/solo and gain remain respected and unchanged. Recorded input contains only the microphone, never this internal backing mix.</p>${project.tracks.map(track=>{const state=this.selection.get(track.id)||{enabled:true,volume:1};return`<label class="recording-backing-row"><input type="checkbox" data-backing="${esc(track.id)}" ${state.enabled?'checked':''}> ${esc(track.name)} ${track.mute?'(project muted)':track.solo?'(project solo)':''}<input data-backing-volume="${esc(track.id)}" aria-label="${esc(track.name)} backing volume" type="range" min="0" max="1.5" step=".01" value="${state.volume}"></label>`}).join('')}</details>
      <h3>Recording Timeline</h3><div class="recording-timeline" id="recordingTimeline"></div><h3>Takes</h3><p class="hint">Activate mutes alternate takes in the same start-position group without deleting PCM. Preview uses the recorded track's effects. Advanced moves, trim, fades and mixing are available in Arrangement.</p>
      <div class="recording-takes">${takes.map(clip=>`<article data-take="${esc(clip.id)}"><label>Take name <input data-take-name="${esc(clip.id)}" maxlength="120" value="${esc(clip.recording.name)}"></label><span>${clip.mute?'Muted / alternate':'Active'} · ${formatTransportTime(clip.bar*240/project.bpm)} · ${((clip.end-clip.start)/(clip.rate||1)).toFixed(3)} s</span><button data-activate-take="${esc(clip.id)}">Activate</button><button data-preview-take="${esc(clip.id)}">Preview</button><button data-open-take="${esc(clip.id)}">Open in Arrangement</button><button data-edit-take="${esc(clip.id)}">Open in Sample Studio</button>
      ${[['bar','Position (bars)',0],['start','Trim start (s)',0],['end','Trim end (s)',.001],['fadeIn','Fade in (s)',0],['fadeOut','Fade out (s)',0],['gain','Gain',0]].map(([key,title,min])=>`<label>${title}<input data-take-value="${esc(clip.id)}" data-key="${key}" type="number" min="${min}" step=".01" value="${clip[key]??0}"></label>`).join('')}<label>Mute <input data-mute-take="${esc(clip.id)}" type="checkbox" ${clip.mute?'checked':''}></label><button data-delete-take="${esc(clip.id)}">Delete Take</button></article>`).join('')||'<p>No recorded takes on this track yet.</p>'}</div><button id="retryRecordingSave" hidden>Retry Saving Buffered Take</button><button id="downloadBufferedTake" hidden>Download Buffered WAV</button></section>`;
    const $=selector=>root.querySelector(selector);
    $('#studioRecord').onclick=()=>this.start();$('#studioStop').onclick=()=>this.finish();$('#studioCancel').onclick=()=>this.cancel();
    $('#retryRecordingSave').onclick=()=>this.finish();
    $('#downloadBufferedTake').onclick=()=>this.downloadBuffered();
    const readPunch=()=>{
      this.punch={enabled:$('#punchEnable').checked,inBeat:Number($('#punchIn').value),outBeat:Number($('#punchOut').value),preRollBars:Number($('#punchPreRoll').value)};
      if(this.punch.enabled&&(!(this.punch.inBeat>=0)||!(this.punch.outBeat>this.punch.inBeat)))this.notify('Punch out must be after punch in.');
    };
    for(const id of ['punchEnable','punchIn','punchOut','punchPreRoll'])$('#'+id).onchange=readPunch;
    $('#calibrateRun').onclick=()=>this.calibrate();
    $('#calibrateClear').onclick=()=>{const store=loadCalibrations();for(const key of Object.keys(store))delete store[key];localStorage.setItem(CALIBRATION_STORE,JSON.stringify(store));this.mount(root);this.notify('Saved recording calibration cleared; browser-reported latency is used.')};
    $('#recordingTrack').onchange=event=>{this.trackId=event.target.value;this.armed=false;this.mount(root)};
    $('#newRecordingTrack').onclick=()=>{const track=this.createTrack();this.trackId=track.id;this.armed=false;this.mount(root)};
    $('#recordingTrackName').onchange=event=>{const name=event.target.value.trim();if(!target||!name)return this.notify('Select a recording track and enter a name.');target.name=name;this.save();this.mount(root)};
    $('#recordingArm').onchange=event=>this.armed=event.target.checked;
    for(const [id,key]of [['recordingCountIn','countInBars'],['recordingOffset','offsetMs'],['recordingMetronome','metronome'],['recordingClickVolume','metronomeVolume']])$('#'+id).onchange=event=>{
      const value=event.target.type==='checkbox'?event.target.checked:Number(event.target.value);
      if(!Number.isFinite(Number(value))||key==='offsetMs'&&Math.abs(value)>2000)return this.notify('Recording offset must be between -2000 and 2000 ms.');
      project.recordingSettings={...this.settings(),[key]:value};this.save();
    };
    $('#recordingMonitor').onchange=event=>{this.monitoring=event.target.checked;this.capture?.setMonitoring(this.monitoring);this.update()};
    root.querySelectorAll('[data-backing],[data-backing-volume]').forEach(input=>input.oninput=()=>{
      const id=input.dataset.backing??input.dataset.backingVolume,state=this.selection.get(id)||{enabled:true,volume:1};
      if(input.dataset.backing!==undefined)state.enabled=input.checked;else state.volume=Number(input.value);
      this.selection.set(id,state);
      if(this.busy&&this.engine.playing)this.engine.syncTracks(this.playbackProject().tracks,project.bpm);
    });
    const find=id=>target.clips.find(clip=>clip.id===id);
    const bind=(attribute,action)=>root.querySelectorAll(`[${attribute}]`).forEach(input=>input.onchange=()=>{try{action(input,find(input.getAttribute(attribute)));this.save();this.mount(root)}catch(error){this.notify(error.message)}});
    bind('data-take-name',(input,clip)=>{if(!input.value.trim())throw new Error('Take name cannot be empty.');clip.recording.name=input.value.trim()});
    bind('data-mute-take',(input,clip)=>clip.mute=input.checked);
    bind('data-take-value',(input,clip)=>{
      const value=Number(input.value),key=input.dataset.key,copy={...clip,[key]:value},buffer=this.buffers.get(clip.asset);
      if(!Number.isFinite(value)||value<0||copy.end<=copy.start||copy.end>buffer.duration)throw new Error('Take boundaries must be within its source and end after start.');
      clip[key]=value;
    });
    const buttons=(attribute,action)=>root.querySelectorAll(`[${attribute}]`).forEach(button=>button.onclick=()=>action(find(button.getAttribute(attribute))));
    buttons('data-activate-take',clip=>{activateRecordingTake(target,clip.id);this.save();this.mount(root)});
    buttons('data-open-take',clip=>this.openArrangement(target.id,clip.id));
    buttons('data-edit-take',clip=>this.openSample(clip.asset));
    buttons('data-delete-take',clip=>{if(!confirm('Delete this take clip? Its original sample remains in the shared library.'))return;target.clips=target.clips.filter(item=>item.id!==clip.id);this.save();this.mount(root)});
    buttons('data-preview-take',clip=>this.previewTake(target,clip).catch(error=>this.notify(error.message)));
    organizeRecordingStudio(root,{advancedOpen});this.drawTimeline();this.update();
  }
  update(){
    if(!this.root?.querySelector('#studioRecord'))return;
    const $=selector=>this.root.querySelector(selector),active=this.busy;
    $('#recordingStatus').textContent=this.state==='unsaved'?'Buffered take not saved — retry or cancel':this.state.toUpperCase();
    this.root.querySelector('.recording-studio').dataset.recordingState=this.state;
    $('#studioRecord').disabled=active;$('#studioStop').disabled=!['count-in','pre-roll','recording'].includes(this.state);
    $('#studioCancel').disabled=!active||this.state==='saving';$('#retryRecordingSave').hidden=this.state!=='unsaved';
    $('#downloadBufferedTake').hidden=this.state!=='unsaved'||!this.pending?.wavBytes;
    for(const input of this.root.querySelectorAll('.recording-options input,.recording-options select,#newRecordingTrack,.recording-takes button,.recording-takes input'))input.disabled=active;
    $('#recordingMonitor').disabled=false;
    $('#monitorStatus').textContent=this.monitoring?'Monitoring ON — delayed microphone feedback':'Monitoring OFF';
    this.onBusy?.(active);
  }
  async start(){
    if(this.busy)return;
    const project=this.getProject(),target=project.tracks.find(track=>track.id===this.trackId&&!track.sampler&&!track.drumRack);
    if(!this.armed||!target)return this.notify('Select an Audio track and enable Arm.');
    const beat=60/project.bpm,position=Number(this.root.querySelector('#recordingPosition').value)*beat;
    if(!Number.isFinite(position)||position<0)return this.notify('Choose a non-negative recording start beat.');
    let punch=null;
    if(this.punch.enabled){
      if(!(this.punch.inBeat>=0)||!(this.punch.outBeat>this.punch.inBeat))return this.notify('Punch out must be after punch in.');
      punch={inSeconds:this.punch.inBeat*beat,outSeconds:this.punch.outBeat*beat,preRollSeconds:this.punch.preRollBars*4*beat};
    }
    this.state='requesting';this.update();
    try{
      const context=await this.engine.init();if(this.state!=='requesting')return;
      this.capture=new RecordingCapture(context,{onInterrupted:message=>{this.notify(message);this.finish()},onLimit:()=>{this.notify('Five-minute take limit reached; saving captured audio.');this.finish()},onFinished:()=>this.finish()});
      if(!await this.capture.prepare())return;
      localStorage.setItem(LAST_DEVICE,this.capture.deviceId);
      this.compensationInfo=this.compensation(this.capture.deviceId);
      this.timing=recordingTiming({contextTime:context.currentTime,position,bpm:project.bpm,sampleRate:context.sampleRate,playbackLatency:this.compensationInfo.seconds,punch,...this.settings()});
      this.target=target;this.capture.begin(this.timing.startFrame,this.timing.endFrame);this.capture.setMonitoring(this.monitoring);
      this.state=this.timing.countInSeconds?'count-in':punch&&this.timing.startFrame>this.timing.playFrame?'pre-roll':'recording';this.update();
      await this.engine.play(this.playbackProject(),this.buffers,this.timing.backingStart,{when:this.timing.playContextTime});
      if(!this.busy)return;
      this.clickDelay=this.lookaheadSeconds();this.nextClick=this.timing.playContextTime-this.timing.countInSeconds;this.clickIndex=0;
      this.clock=setInterval(()=>this.pulse(),25);this.pulse();
      this.onVisibility=()=>{if(document.hidden){this.notify('Recording interrupted by backgrounding; saving buffered audio.');this.finish()}};
      this.onContext=()=>{if(context.state!=='running'){this.notify('Audio context interrupted; saving buffered audio.');this.finish()}};
      document.addEventListener('visibilitychange',this.onVisibility);context.addEventListener('statechange',this.onContext);
    }catch(error){this.capture?.cancel();this.cleanup();this.state='idle';this.update();this.notify(`Recording could not start: ${describeCaptureError(error)}`)}
  }
  pulse(){
    const context=this.engine.ctx,now=context.currentTime,settings=this.settings(),beat=60/this.getProject().bpm;
    if(this.state==='count-in'&&now>=this.timing.playContextTime)this.state=this.timing.startFrame>this.timing.playFrame?'pre-roll':'recording',this.update();
    if(this.state==='pre-roll'&&now>=this.timing.startContextTime){this.state='recording';this.update()}
    if(this.root?.querySelector('#recordingTime'))this.root.querySelector('#recordingTime').textContent=formatTransportTime(Math.max(0,now-this.timing.startContextTime));
    while(this.nextClick<now+.15){
      const at=this.nextClick+this.clickDelay;
      if((this.nextClick<this.timing.playContextTime||settings.metronome)&&at>=now){
        const oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=this.clickIndex%4?880:1320;gain.gain.setValueAtTime(settings.metronomeVolume,at);gain.gain.exponentialRampToValueAtTime(.0001,at+.04);oscillator.connect(gain).connect(context.destination);oscillator.start(at);oscillator.stop(at+.05);this.clicks.push(oscillator);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();this.clicks=this.clicks.filter(item=>item!==oscillator)};
      }
      this.nextClick+=beat;this.clickIndex++;
    }
    const analyser=this.capture?.analyser,canvas=this.root?.querySelector('#recordingWave');
    if(analyser&&canvas){
      const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);
      let peak=0;for(const value of data)peak=Math.max(peak,Math.abs(value));
      const g=canvas.getContext('2d');g.clearRect(0,0,canvas.width,canvas.height);g.strokeStyle='#77d9c4';g.beginPath();for(let x=0;x<canvas.width;x++){const y=(1-data[Math.floor(x*data.length/canvas.width)])*canvas.height/2;x?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();
      this.root.querySelector('#recordingLevel').value=peak;this.root.querySelector('#recordingClip').textContent=peak>=.999?'CLIPPING — reduce microphone input level':`Input peak ${(peak*100).toFixed(1)}%`;
    }
    const cursor=this.root?.querySelector('#recordingTimelineCursor');
    if(cursor)cursor.style.left=`${Math.min(100,this.engine.position()/this.timelineSeconds*100)}%`;
  }
  cleanup(){
    clearInterval(this.clock);this.engine.stop();
    document.removeEventListener('visibilitychange',this.onVisibility);this.engine.ctx?.removeEventListener('statechange',this.onContext);
    for(const source of this.clicks){source.onended=null;try{source.stop()}catch(error){if(error.name!=='InvalidStateError')console.error('Could not stop recording click',error)}source.disconnect()}this.clicks=[];
    this.engine.syncTracks(this.getProject().tracks,this.getProject().bpm);
  }
  async finish(){
    if(!['count-in','pre-roll','recording','unsaved'].includes(this.state))return;
    this.state='saving';this.update();
    try{
      if(!this.pending){
        const result=await this.capture.stop();this.cleanup();
        if(result.interrupted)this.notify('Audio was interrupted; recovering buffered PCM (the final partial chunk may be missing).');
        if(!result.frames){this.state='idle';this.update();return this.notify('Stopped before recording began; no take was created.')}
        this.pending={...result,id:uid(),assetId:uid(),name:`${this.target.name} Take ${this.target.clips.filter(clip=>clip.recording).length+1}`};
      }
      const project=this.getProject();
      await commitRecordedTake(this.pending,{createBuffer:(channels,frames,rate)=>this.engine.ctx.createBuffer(channels,frames,rate),encodeWav:encodeWavAsync,storeAsset:this.storeAsset,track:this.target,timing:this.timing,bpm:project.bpm,idFactory:uid,compensation:this.compensationInfo,outputLatency:this.engine.ctx.outputLatency||0});
      this.save();this.pending=null;this.state='idle';this.capture=null;this.mount(this.root);this.notify(this.timing.punch?'Punch take saved as a new clip; earlier takes were split non-destructively.':'Take saved as a new float PCM sample and placed on the Audio track.');
    }catch(error){
      this.cleanup();this.state=this.pending?'unsaved':'idle';this.update();
      const reason=quotaFailure(error)?'Browser storage is full. Free space (delete unused samples or projects) and retry, or download the buffered WAV.':error.stage==='encode'?`WAV encoding failed: ${error.message}`:`Storing the recording failed: ${error.message}`;
      this.notify(`Take not saved. ${reason}${this.pending?' The captured audio is still buffered in memory; do not close this tab before retrying.':''}`);
    }
  }
  downloadBuffered(){
    const bytes=this.pending?.wavBytes;if(!bytes)return this.notify('No encoded take is available to download.');
    const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),link=document.createElement('a');
    link.href=url;link.download=`${this.pending.name}.wav`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  async calibrate(){
    if(this.busy)return;
    this.state='calibrating';this.update();
    const output=this.root.querySelector('#calibrationResult');let capture;
    try{
      const context=await this.engine.init(),rate=context.sampleRate,signal=loopbackTestSignal(rate);
      capture=this.capture=new RecordingCapture(context);
      output.textContent='Requesting microphone…';
      if(!await capture.prepare())return;
      const startFrame=Math.ceil((context.currentTime+.25)*rate),chirpOffset=Math.round(.4*rate),totalFrames=Math.round(1.6*rate);
      capture.begin(startFrame,startFrame+totalFrames,totalFrames);
      const buffer=context.createBuffer(1,signal.length,rate);buffer.copyToChannel(signal,0);
      const source=context.createBufferSource(),gain=context.createGain();gain.gain.value=.5;source.buffer=buffer;source.connect(gain).connect(context.destination);
      source.start((startFrame+chirpOffset)/rate);source.onended=()=>{source.disconnect();gain.disconnect()};
      output.textContent='Playing test signal and listening…';
      const result=await capture.whenFinished(4000);
      if(!result||!result.frames)throw new Error('The microphone returned no audio during the test.');
      const pcm=new Float32Array(result.frames);let offset=0;for(const chunk of result.chunks){pcm.set(chunk,offset);offset+=chunk.length}
      const measurement=measureLoopbackLatency(pcm,signal,rate,{expectedIndex:chirpOffset,maxLagSeconds:.6});
      if(!measurement.ok)throw new Error(measurement.reason);
      const key=calibrationKey(capture.deviceId,rate),store=loadCalibrations();
      store[key]={roundTripSeconds:measurement.roundTripSeconds,correlation:measurement.correlation,measuredAt:new Date().toISOString(),deviceStable:!!capture.deviceId};
      localStorage.setItem(CALIBRATION_STORE,JSON.stringify(store));localStorage.setItem(LAST_DEVICE,capture.deviceId);
      output.textContent=`Measured round trip ${(measurement.roundTripSeconds*1000).toFixed(2)} ms (match ${(measurement.correlation*100).toFixed(0)}%, peak/sidelobe ${measurement.peakToSidelobe.toFixed(1)}). ${capture.deviceId?'Saved for this input device.':'Saved for the default device (browser did not expose a stable device id).'} ${this.describeCompensation()}`;
    }catch(error){output.textContent=`Calibration not saved: ${describeCaptureError(error)} Recording still works with browser-reported latency.`}
    finally{capture?.cancel();this.capture=null;this.state='idle';this.update()}
  }
  cancel(){
    if(this.state==='saving')return;
    if(this.pending&&!confirm('Discard this unsaved buffered take?'))return;
    this.capture?.cancel();this.cleanup();this.capture=null;this.pending=null;this.state='idle';this.update();this.notify('Recording cancelled; previous takes and source assets are unchanged.');
  }
  async previewTake(track,clip){
    const ctx=await this.engine.init();this.engine.syncTracks(this.getProject().tracks,this.getProject().bpm);
    this.engine.stop();
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffers.get(clip.asset);source.playbackRate.value=clip.rate||1;source.connect(gain).connect(this.engine.trackNodes.get(track.id).input);scheduleClipSource(ctx,source,gain,clip,ctx.currentTime,0,(clip.end-clip.start)/(clip.rate||1));this.engine.registerSource(source,[gain]);
  }
  drawTimeline(){
    const container=this.root.querySelector('#recordingTimeline'),project=this.getProject();
    this.timelineSeconds=Math.max(8,...project.tracks.flatMap(track=>track.clips.map(clip=>clip.bar*240/project.bpm+(clip.kind==='instrument'?clip.durationBeats*60/project.bpm:(clip.end-clip.start)/(clip.rate||1)))));
    container.innerHTML=project.tracks.map(track=>`<div class="recording-timeline-row"><span>${esc(track.name)}</span><div>${track.clips.map(clip=>{const length=clip.kind==='instrument'?clip.durationBeats*60/project.bpm:(clip.end-clip.start)/(clip.rate||1);return`<i style="left:${clip.bar*240/project.bpm/this.timelineSeconds*100}%;width:${length/this.timelineSeconds*100}%;background:${/^#[0-9a-f]{6}$/i.test(track.color)?track.color:'#77bdb2'};opacity:${clip.mute ? .35 : .8}" title="${esc(clip.recording?.name||'Backing clip')}"></i>`}).join('')}</div></div>`).join('')+'<b id="recordingTimelineCursor"></b>';
  }
}
