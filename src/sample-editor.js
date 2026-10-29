import {createTrackEffect,renderSampleEffectChain} from './audio.js';
import {renderSampleProcessing} from './sample-dsp.js';
import {clampFrame,frameToX,getWaveformPeaks,xToFrame} from './waveform.js';
import {SamplePreview} from './sample-preview.js';
import {enhanceParameter} from './ui-controls.js';
import {EFFECT_CONTROLS,effectParameterOptions,mountDeviceShell,captureDeviceUi,restoreDeviceUi} from './device-ui.js';
import {mountTrackEqs} from './eq-workspace.js';

let activeSamplePreviewStop=()=>{};
let activeSampleUiDispose=()=>{},activePreview=null,activeEditor=null,sampleTransport=null,sampleDeviceUi=null;
export function stopSampleStudioPreview(){
  activeSamplePreviewStop();activeSampleUiDispose();
  activeSamplePreviewStop=()=>{};activeSampleUiDispose=()=>{};
  activePreview=null;activeEditor=null;sampleTransport=null;
}
export function toggleSampleStudioPreview(){return sampleTransport?.()}
export function sampleStudioPreviewPlaying(){return activePreview?.state==='playing'}

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const cloneRegions=regions=>regions.map(region=>({...region}));
const cloneEffects=effects=>effects.map(effect=>({...effect,params:{...effect.params,bands:effect.params.bands?.map(band=>({...band}))}}));

export class SampleEditor {
  constructor(buffer) {
    if(!buffer||!Number.isInteger(buffer.length)||!Number.isFinite(buffer.sampleRate))throw new TypeError('A decoded audio buffer is required.');
    this.buffer=buffer;
    this.regions=[{start:0,end:buffer.length,reverse:false}];
    this.selection={start:0,end:buffer.length};
    this.loop={start:0,end:buffer.length};
    this.gainDb=0;
    this.fadeInFrames=0;
    this.fadeOutFrames=0;
    this.processing={speed:1,pitchSemitones:0,pitchCents:0,mode:'preserve',effects:[]};
    this.view={zoom:1};
    this.undoStack=[];
    this.redoStack=[];
  }

  get frameCount(){return this.regions.reduce((total,region)=>total+region.end-region.start,0)}
  get duration(){return this.frameCount/this.buffer.sampleRate}

  checkpoint(){
    this.undoStack.push(this.snapshot());
    if(this.undoStack.length>100)this.undoStack.shift();
    this.redoStack=[];
  }

  snapshot(){return {regions:cloneRegions(this.regions),selection:{...this.selection},loop:{...this.loop},gainDb:this.gainDb,fadeInFrames:this.fadeInFrames,fadeOutFrames:this.fadeOutFrames,processing:{...this.processing,effects:cloneEffects(this.processing.effects)}}}

  restore(state){
    this.regions=cloneRegions(state.regions);
    this.offsets=null;
    this.selection={...state.selection};
    this.loop={...state.loop};
    this.gainDb=state.gainDb;
    this.fadeInFrames=state.fadeInFrames;
    this.fadeOutFrames=state.fadeOutFrames;
    this.processing={...state.processing,effects:cloneEffects(state.processing.effects)};
    this.clampRanges();
  }

  clampRanges(){
    const length=this.frameCount;
    this.selection={start:clamp(this.selection.start,0,length),end:clamp(this.selection.end,0,length)};
    this.loop={start:clamp(this.loop.start,0,length),end:clamp(this.loop.end,0,length)};
    this.fadeInFrames=clamp(this.fadeInFrames,0,length);
    this.fadeOutFrames=clamp(this.fadeOutFrames,0,length);
  }

  setSelection(start,end){
    const a=clamp(Math.round(start),0,this.frameCount),b=clamp(Math.round(end),0,this.frameCount);
    this.selection={start:Math.min(a,b),end:Math.max(a,b)};
    return this.selection;
  }

  setLoop(start,end){
    const a=clamp(Math.round(start),0,this.frameCount),b=clamp(Math.round(end),0,this.frameCount);
    this.loop={start:Math.min(a,b),end:Math.max(a,b)};
    return this.loop;
  }

  sourceFrameAt(frame){
    if(!this.offsets){let total=0;this.offsets=this.regions.map(region=>{const start=total;total+=region.end-region.start;return {region,start,end:total}})}
    const target=clamp(Math.floor(frame),0,Math.max(0,this.frameCount-1));
    let low=0,high=this.offsets.length-1;
    while(low<=high){const mid=(low+high)>>1,segment=this.offsets[mid];if(target<segment.start)high=mid-1;else if(target>=segment.end)low=mid+1;else{const local=target-segment.start;return segment.region.reverse?segment.region.end-1-local:segment.region.start+local}}
    return 0;
  }

  nearestZeroCrossing(frame,tolerance=Math.round(this.buffer.sampleRate*.01)){
    const target=clamp(Math.round(frame),0,this.frameCount);
    if(target===0||target===this.frameCount)return target;
    const from=Math.max(1,target-tolerance),to=Math.min(this.frameCount-1,target+tolerance);
    let best=target,distance=Infinity;
    for(let candidate=from;candidate<=to;candidate++){
      let crossing=false;
      for(let channel=0;channel<this.buffer.numberOfChannels;channel++){
        const data=this.buffer.getChannelData(channel),a=data[this.sourceFrameAt(candidate-1)]||0,b=data[this.sourceFrameAt(candidate)]||0;
        if(a===0||b===0||Math.sign(a)!==Math.sign(b)){crossing=true;break}
      }
      if(crossing&&Math.abs(candidate-target)<distance){best=candidate;distance=Math.abs(candidate-target)}
    }
    return best;
  }

  setBoundary(which,frame,snap=false){
    if(!['start','end'].includes(which)||!Number.isFinite(frame))throw new RangeError('A valid marker and finite sample frame are required.');
    let next=clampFrame(frame,this.frameCount);
    if(snap)next=this.nearestZeroCrossing(next);
    next=which==='start'?Math.min(next,Math.max(0,this.selection.end-1)):Math.max(next,Math.min(this.frameCount,this.selection.start+1));
    this.setSelection(which==='start'?next:this.selection.start,which==='end'?next:this.selection.end);
    return next;
  }

  splitAt(frame,checkpoint=true){
    const point=clamp(Math.round(frame),1,this.frameCount-1);
    let outputOffset=0;
    for(let index=0;index<this.regions.length;index++){
      const region=this.regions[index],length=region.end-region.start;
      if(point>outputOffset&&point<outputOffset+length){
        if(checkpoint)this.checkpoint();
        const local=point-outputOffset;
        const first=region.reverse
          ?{start:region.end-local,end:region.end,reverse:true}
          :{start:region.start,end:region.start+local,reverse:false};
        const second=region.reverse
          ?{start:region.start,end:region.end-local,reverse:true}
          :{start:region.start+local,end:region.end,reverse:false};
        this.regions.splice(index,1,first,second);
        this.offsets=null;
        this.setSelection(point,point);
        return true;
      }
      outputOffset+=length;
    }
    return false;
  }

  sliceRegion(region,start,end){
    if(end<=start)return null;
    return region.reverse
      ?{start:region.end-end,end:region.end-start,reverse:true}
      :{start:region.start+start,end:region.start+end,reverse:false};
  }

  replaceRange(start,end,keepRange=false,checkpoint=true){
    const length=this.frameCount,a=clamp(Math.round(start),0,length),b=clamp(Math.round(end),0,length);
    if(a>=b)return false;
    if(checkpoint)this.checkpoint();
    const output=[];
    let offset=0;
    for(const region of this.regions){
      const size=region.end-region.start,regionStart=offset,regionEnd=offset+size;
      if(keepRange){
        const from=Math.max(regionStart,a),to=Math.min(regionEnd,b);
        if(to>from)output.push(this.sliceRegion(region,from-regionStart,to-regionStart));
      }else{
        if(a>regionStart)output.push(this.sliceRegion(region,0,Math.min(size,a-regionStart)));
        if(b<regionEnd)output.push(this.sliceRegion(region,Math.max(0,b-regionStart),size));
      }
      offset=regionEnd;
    }
    this.regions=output.filter(Boolean);
    this.offsets=null;
    this.selection={start:0,end:this.frameCount};
    this.loop={...this.selection};
    this.clampRanges();
    return true;
  }

  deleteSelection(){return this.replaceRange(this.selection.start,this.selection.end,false)}
  cropSelection(){return this.replaceRange(this.selection.start,this.selection.end,true)}

  splitSelection(){
    const points=[this.selection.start,this.selection.end].filter(point=>point>0&&point<this.frameCount).sort((a,b)=>a-b);
    if(!points.length)return false;
    this.checkpoint();
    let changed=false;
    for(const point of points)changed=this.splitAt(point,false)||changed;
    return changed;
  }

  reverse(){
    this.checkpoint();
    this.regions=cloneRegions(this.regions).reverse().map(region=>({...region,reverse:!region.reverse}));
    this.offsets=null;
    this.selection={start:this.frameCount-this.selection.end,end:this.frameCount-this.selection.start};
    this.loop={start:this.frameCount-this.loop.end,end:this.frameCount-this.loop.start};
  }

  setGainDb(value,checkpoint=true){if(!Number.isFinite(value))throw new RangeError('Gain must be a finite dB value.');if(checkpoint)this.checkpoint();this.gainDb=clamp(value,-60,120)}

  normalize(targetDb=-1,start=0,end=this.frameCount){
    if(!Number.isFinite(targetDb)||targetDb>0||targetDb< -60)throw new RangeError('Normalize target must be between -60 and 0 dBFS.');
    const from=clamp(Math.floor(start),0,this.frameCount),to=clamp(Math.ceil(end),from,this.frameCount);
    let peak=0;
    for(let frame=from;frame<to;frame++)for(let channel=0;channel<this.buffer.numberOfChannels;channel++)peak=Math.max(peak,Math.abs(this.buffer.getChannelData(channel)[this.sourceFrameAt(frame)]||0));
    if(peak===0)return false;
    this.checkpoint();
    this.gainDb=clamp(targetDb-20*Math.log10(peak),-60,120);
    return true;
  }

  setFades(fadeInSeconds,fadeOutSeconds){
    if(!Number.isFinite(fadeInSeconds)||!Number.isFinite(fadeOutSeconds)||fadeInSeconds<0||fadeOutSeconds<0)throw new RangeError('Fade lengths must be non-negative finite values.');
    this.checkpoint();
    this.fadeInFrames=Math.round(fadeInSeconds*this.buffer.sampleRate);
    this.fadeOutFrames=Math.round(fadeOutSeconds*this.buffer.sampleRate);
    this.clampRanges();
  }

  trimSilence(thresholdDb=-60){
    if(!Number.isFinite(thresholdDb)||thresholdDb>0||thresholdDb< -120)throw new RangeError('Silence threshold must be between -120 and 0 dBFS.');
    const threshold=10**(thresholdDb/20);let first=-1,last=-1;
    for(let frame=0;frame<this.frameCount;frame++){
      let peak=0;
      for(let channel=0;channel<this.buffer.numberOfChannels;channel++)peak=Math.max(peak,Math.abs(this.buffer.getChannelData(channel)[this.sourceFrameAt(frame)]||0));
      if(peak>=threshold){if(first<0)first=frame;last=frame}
    }
    if(first<0)return false;
    if(first===0&&last===this.frameCount-1)return false;
    this.checkpoint();
    this.replaceRange(last+1,this.frameCount,false,false);
    if(first>0)this.replaceRange(0,first,false,false);
    return true;
  }

  render(context,{applyGain=true}={}){
    const output=context.createBuffer(this.buffer.numberOfChannels,Math.max(1,this.frameCount),this.buffer.sampleRate),gain=applyGain?10**(this.gainDb/20):1;
    for(let channel=0;channel<output.numberOfChannels;channel++){
      const source=this.buffer.getChannelData(channel),target=output.getChannelData(channel);
      for(let frame=0;frame<this.frameCount;frame++){
        let envelope=1;
        if(this.fadeInFrames>0)envelope=Math.min(envelope,frame/this.fadeInFrames);
        if(this.fadeOutFrames>0)envelope=Math.min(envelope,(this.frameCount-1-frame)/this.fadeOutFrames);
        target[frame]=(source[this.sourceFrameAt(frame)]||0)*gain*Math.max(0,envelope);
      }
    }
    return output;
  }

  renderSelection(context,{applyGain=true}={}){
    const from=this.selection.start,to=this.selection.end;
    if(to<=from)throw new RangeError('Select a non-empty sample region before rendering.');
    const length=to-from,output=context.createBuffer(this.buffer.numberOfChannels,length,this.buffer.sampleRate),gain=applyGain?10**(this.gainDb/20):1;
    for(let channel=0;channel<output.numberOfChannels;channel++){
      const source=this.buffer.getChannelData(channel),target=output.getChannelData(channel);
      for(let frame=0;frame<length;frame++){
        const editorFrame=from+frame;
        let envelope=1;
        if(this.fadeInFrames>0)envelope=Math.min(envelope,frame/this.fadeInFrames);
        if(this.fadeOutFrames>0)envelope=Math.min(envelope,(length-1-frame)/this.fadeOutFrames);
        target[frame]=(source[this.sourceFrameAt(editorFrame)]||0)*gain*Math.max(0,envelope);
      }
    }
    return output;
  }

  undo(){
    if(!this.undoStack.length)return false;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    return true;
  }

  redo(){
    if(!this.redoStack.length)return false;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    return true;
  }
}

export function renderSampleStudioHTML(editor,filename='My_Sample.wav',saved=false){
  const duration=editor?editor.duration:0,length=editor?.frameCount||0,selection=editor?.selection||{start:0,end:0};
  const safeName=String(filename).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const effects=editor?.processing.effects||[];
  const effectControls=EFFECT_CONTROLS;
  const controlMarkup=(effect,index,key,label,min,max,step,scale)=>`<label>${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${Number(effect.params[key]??0)*(scale==='ms'?1000:1)}" data-sample-fx-param="${index}" data-param="${key}" data-scale="${scale==='ms'?1000:1}"><output>${Number(effect.params[key]??0)*(scale==='ms'?1000:1)}</output></label>`;
  const effectMarkup=effects.map((effect,index)=>`<article class="sample-effect"><header><label><input type="checkbox" data-sample-fx-enabled="${index}" ${effect.enabled?'checked':''}> ${effect.type}</label><button data-sample-fx-up="${index}" ${index?'':'disabled'} aria-label="Move effect up">↑</button><button data-sample-fx-down="${index}" ${index===effects.length-1?'disabled':''} aria-label="Move effect down">↓</button><button data-sample-fx-remove="${index}" aria-label="Remove effect">×</button></header>${effect.type==='eq'?`${controlMarkup(effect,index,'lowCut','High-pass (Hz)',20,20000,1)}${controlMarkup(effect,index,'highCut','Low-pass (Hz)',20,20000,1)}${(effect.params.bands||[]).map((band,bandIndex)=>`<fieldset class="eq-band"><legend>Band ${bandIndex+1}</legend>${[['frequency','Hz',20,20000,1],['gain','dB',-24,24,.5],['q','Q',.1,18,.1]].map(([key,label,min,max,step])=>`<label>${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${band[key]}" data-sample-fx-param="${index}" data-eq-band="${bandIndex}" data-param="${key}"><output>${Number(band[key]).toFixed(key==='frequency'?0:1)}</output></label>`).join('')}</fieldset>`).join('')}`:(effectControls[effect.type]||[]).map(([key,label,min,max,step,scale])=>controlMarkup(effect,index,key,label,min,max,step,scale)).join('')}</article>`).join('');
  const ruler=Array.from({length:11},(_,index)=>`<span style="left:${index*10}%">${(duration*index/10).toFixed(3)}s</span>`).join('');
  return `<section class="studio sample-studio"><div class="section-title"><h2>Sample Studio</h2><p>Record or load audio, select precisely, edit non-destructively, preview, then save a new processed sample.</p></div>
    <div class="record-controls"><button id="record" class="accent" title="Record a new sound">● Record New Sound</button><button id="finishRecord" disabled title="Finish and keep this recording for editing">■ Finish Recording</button><button id="cancelRecord" disabled title="Cancel and discard the active recording">Cancel Recording</button><button id="loadSample">＋ Edit Existing Sample</button><button id="discardSample" ${length?'':'disabled'} title="Discard this unsaved sample">Discard Sample</button><span id="recordState" aria-live="polite">Microphone idle</span><span id="inputMeter">Input −∞ dBFS</span></div>
    <div class="wave-panel">
      <div class="sample-wave-toolbar"><button id="waveZoomOut" ${length?'':'disabled'} aria-label="Zoom out">−</button><label>Zoom <input id="waveZoom" type="range" min="1" max="24" step=".1" value="1" ${length?'':'disabled'}></label><button id="waveZoomIn" ${length?'':'disabled'} aria-label="Zoom in">＋</button><button id="waveFit" ${length?'':'disabled'}>Fit</button><button id="waveZoomSelection" ${length?'':'disabled'}>Zoom selection</button><span id="sampleDuration">${duration.toFixed(3)} s · ${editor?.buffer.sampleRate||0} Hz</span><button id="snapZero" aria-pressed="true" ${length?'':'disabled'}>Zero-crossing snap: on</button><button id="sampleUndo" ${editor?.undoStack.length?'':'disabled'}>Undo</button><button id="sampleRedo" ${editor?.redoStack.length?'':'disabled'}>Redo</button></div>
      <div id="waveViewport" class="wave-viewport"><div class="wave-canvas-wrap"><canvas id="sampleWave" class="sample-wave" data-duration="${duration}" data-length="${length}" data-start="${selection.start}" data-end="${selection.end}" tabindex="0" aria-label="Audio waveform selection"></canvas><button id="startMarker" class="wave-marker wave-marker-start" aria-label="Start marker" title="Start: ${(selection.start/(editor?.buffer.sampleRate||1)).toFixed(4)} seconds"><span>S</span></button><button id="endMarker" class="wave-marker wave-marker-end" aria-label="End marker" title="End: ${(selection.end/(editor?.buffer.sampleRate||1)).toFixed(4)} seconds"><span>E</span></button><i id="sampleCursor" class="sample-cursor"></i></div></div>
      <div class="sample-playback" aria-label="Sample playback controls"><button id="playSelection" class="primary" ${length?'':'disabled'} title="Play the processed selection">▶ Play Selection</button><button id="playEntire" ${length?'':'disabled'} title="Play the processed entire sample">▶ Preview Entire Sample</button><button id="loopPreview" aria-pressed="false" ${length?'':'disabled'}>Loop Preview</button><button id="stopPreview" ${length?'':'disabled'} title="Stop sample preview">■ Stop</button><button id="previewAB" ${length?'':'disabled'}>A/B original</button><span id="samplePlaybackState" role="status" aria-live="polite">${length?'Stopped':'No sample loaded'}</span></div><div class="wave-ruler"><div class="wave-ruler-content">${ruler}</div></div>
      <div class="edit-grid sample-edit-grid">
        <label>Start (s)<div class="marker-control"><button data-nudge="start" data-direction="-1" aria-label="Move start earlier">−</button><input id="trimStart" aria-label="Selection start in seconds" type="number" min="0" max="${duration}" step="${1/(editor?.buffer.sampleRate||1)}" value="${selection.start/(editor?.buffer.sampleRate||1)}"><button data-nudge="start" data-direction="1" aria-label="Move start later">＋</button></div><input id="startFine" type="range" min="0" max="${length}" step="1" value="${selection.start}" aria-label="Fine-adjust start marker"></label>
        <label>End (s)<div class="marker-control"><button data-nudge="end" data-direction="-1" aria-label="Move end earlier">−</button><input id="trimEnd" aria-label="Selection end in seconds" type="number" min="0" max="${duration}" step="${1/(editor?.buffer.sampleRate||1)}" value="${selection.end/(editor?.buffer.sampleRate||1)}"><button data-nudge="end" data-direction="1" aria-label="Move end later">＋</button></div><input id="endFine" type="range" min="0" max="${length}" step="1" value="${selection.end}" aria-label="Fine-adjust end marker"></label>
        <label class="frame-mode"><input id="framePrecision" type="checkbox"> Sample-frame precision</label>
        <label>Gain (dB)<input id="editGain" type="range" min="-60" max="120" step=".1" value="${editor?.gainDb||0}"><output id="gainDbValue">${(editor?.gainDb||0).toFixed(1)} dB</output></label>
        <label>Normalize peak (dBFS)<input id="normalizeTarget" type="number" min="-60" max="0" step=".1" value="-1"></label>
        <label>Fade In (s)<input id="fadeIn" type="number" min="0" max="${duration}" step=".001" value="${(editor?.fadeInFrames||0)/(editor?.buffer.sampleRate||1)}"></label>
        <label>Fade Out (s)<input id="fadeOut" type="number" min="0" max="${duration}" step=".001" value="${(editor?.fadeOutFrames||0)/(editor?.buffer.sampleRate||1)}"></label>
      </div>
      <div class="sample-processing"><label>Preview/render speed <input id="sampleSpeed" type="range" min=".25" max="4" step=".01" value="${editor?.processing.speed??1}"><output>${(editor?.processing.speed??1).toFixed(2)}×</output></label><label>Pitch (semitones) <input id="samplePitch" type="range" min="-24" max="24" step="1" value="${editor?.processing.pitchSemitones??0}"><output>${editor?.processing.pitchSemitones??0} st</output></label><label>Fine tune (cents) <input id="sampleCents" type="range" min="-100" max="100" step="1" value="${editor?.processing.pitchCents??0}"><output>${editor?.processing.pitchCents??0} cents</output></label><label>Pitch mode <select id="samplePitchMode"><option value="preserve" ${editor?.processing.mode!=='repitch'?'selected':''}>Pitch-preserving stretch</option><option value="repitch" ${editor?.processing.mode==='repitch'?'selected':''}>Repitch (speed changes pitch)</option></select></label><p class="hint">Pitch-preserving processing uses a lightweight overlap-add algorithm; transient quality may vary.</p></div>
      <section class="sample-fx"><div class="sample-fx-title"><h3>Sample effects (bounced into WAV)</h3><select id="addSampleEffect" aria-label="Add sample processing effect"><option value="">Add effect…</option><option value="eq">EQ</option><option value="compressor">Compressor</option><option value="delay">Delay</option><option value="reverb">Reverb</option><option value="saturation">Saturation</option><option value="limiter">Limiter</option><option value="utility">Utility</option></select></div>${effectMarkup||'<p class="hint">No sample effects. Add an effect to process the saved WAV.</p>'}</section>
      <div class="record-controls sample-tools"><button id="trimSelection" ${length?'':'disabled'}>Crop to selection</button><button id="splitSelection" ${length?'':'disabled'}>Split at selection edges</button><button id="deleteSelection" ${length?'':'disabled'}>Delete selection</button><button id="reverseSample" ${length?'':'disabled'}>Reverse</button><button id="removeSilence" ${length?'':'disabled'}>Remove leading/trailing silence</button><button id="normalize" ${length?'':'disabled'}>Normalize</button></div>
      <div class="record-controls"><label>Sample name <input id="sampleName" value="${safeName}" ${length?'':'disabled'}></label><button id="saveSample" class="primary" ${length?'':'disabled'}>Save Processed Sample</button><button id="makeSampler" ${saved?'':'disabled'}>Create Sampler</button><button id="makeRack" ${saved?'':'disabled'}>Add to Drum Rack</button><span id="sampleSaveState">${saved?'Saved sample ready to use.':'Edits do not modify the original recording.'}</span></div>
      <p class="hint">Drag the S/E handles or waveform to set exact sample-frame boundaries. Pinch or use Zoom to navigate. Ctrl/Cmd+Z undo, Ctrl/Cmd+Y redo, Space previews the selection.</p>
    </div></section>`;
}

export function drawSampleStudioWave(canvas,editor,cursorFrame=0){
  if(!canvas||!editor)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),width=canvas.clientWidth||300,height=canvas.clientHeight||170;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#121923';ctx.fillRect(0,0,width,height);
  const frames=editor.frameCount,selection=editor.selection;
  if(selection.end>selection.start){ctx.fillStyle='#e9be6226';ctx.fillRect(frameToX(selection.start,frames,width),0,frameToX(selection.end,frames,width)-frameToX(selection.start,frames,width),height)}
  const peaks=getWaveformPeaks(editor.buffer),gain=10**(editor.gainDb/20);
  for(let channel=0;channel<editor.buffer.numberOfChannels;channel++){
    const data=editor.buffer.getChannelData(channel),channelHeight=height/editor.buffer.numberOfChannels,mid=channel*channelHeight+channelHeight/2;
    ctx.strokeStyle=channel===0?'#79d5c1':'#6aaac3';ctx.lineWidth=1;
    for(let x=0;x<width;x++){
      const from=Math.floor(x*frames/width),to=Math.min(frames,Math.max(from+1,Math.ceil((x+1)*frames/width)));
      if(from>=frames)break;
      const sourceStart=editor.sourceFrameAt(from),sourceEnd=editor.sourceFrameAt(to-1),contiguous=Math.abs(sourceEnd-sourceStart)===to-from-1,source=editor.buffer.getChannelData(channel);
      let low=1,high=-1;
      const add=sample=>{if(sample<low)low=sample;if(sample>high)high=sample};
      if(contiguous){
        const first=Math.min(sourceStart,sourceEnd),last=Math.max(sourceStart,sourceEnd),cache=peaks.channels[channel],bucketSize=peaks.bucketSize;
        let frame=first;
        while(frame<=last&&frame%bucketSize){add(source[frame]||0);frame++}
        const fullBucketEnd=Math.floor((last+1)/bucketSize);
        while(frame/bucketSize<fullBucketEnd){const bucket=frame/bucketSize;add(cache.minimum[bucket]);add(cache.maximum[bucket]);frame+=bucketSize}
        while(frame<=last){add(source[frame]||0);frame++}
      }else for(let frame=from;frame<to;frame++){const sample=source[editor.sourceFrameAt(frame)]||0;add(sample)}
      const fade=Math.min(editor.fadeInFrames?Math.min(1,from/editor.fadeInFrames):1,editor.fadeOutFrames?Math.min(1,(frames-to)/editor.fadeOutFrames):1);
      const a=low*gain*fade,b=high*gain*fade;
      ctx.beginPath();ctx.moveTo(x,mid-Math.max(-1,Math.min(1,b))*channelHeight*.48);ctx.lineTo(x,mid-Math.max(-1,Math.min(1,a))*channelHeight*.48);ctx.stroke();
    }
    if(channel<editor.buffer.numberOfChannels-1){ctx.strokeStyle='#344456';ctx.beginPath();ctx.moveTo(0,(channel+1)*channelHeight);ctx.lineTo(width,(channel+1)*channelHeight);ctx.stroke()}
  }
  const cursorX=frameToX(cursorFrame,Math.max(1,frames),width);
  const cursorElement=canvas.parentElement?.querySelector('#sampleCursor');
  if(cursorElement&&cursorElement.style.display!=='none')cursorElement.style.left=`${cursorX}px`;
}

export function wireSampleStudio(root,{editor,engine,bpm=120,notify,onRecord,onStopRecord,onCancelRecord,onDiscardSample,onLoad,onSave,onEdit,onStructureChange=()=>{},onPlaybackChange=()=>{},onCreateSampler,onCreateRack,recording=false,recordingElapsed=0}){
  activeSampleUiDispose();
  if(activeEditor!==editor){activePreview?.stop();activePreview=null;activeEditor=editor;sampleDeviceUi=null}
  let dragging=false,selectionAnchor=0,zeroSnap=true,looping=false,cursorRaf=0,abOriginal=false,previewSource=null;
  let disposed=false,request=0,eqViews=[],displayStart=0,displayLength=editor?.frameCount||0;
  const savedDeviceUi=sampleDeviceUi;
  const refreshStructure=()=>{sampleDeviceUi=captureDeviceUi(root);onStructureChange()};
  activeSampleUiDispose=()=>{disposed=true;request++;cancelAnimationFrame(cursorRaf);eqViews.forEach(view=>view.dispose())};
  const canvas=root.querySelector('#sampleWave'),viewport=root.querySelector('#waveViewport'),cursor=root.querySelector('#sampleCursor');
  root.querySelector('#record').onclick=onRecord;root.querySelector('#finishRecord').onclick=onStopRecord;root.querySelector('#cancelRecord').onclick=onCancelRecord;root.querySelector('#loadSample').onclick=onLoad;root.querySelector('#discardSample').onclick=onDiscardSample;
  if(recording){root.querySelector('#record').disabled=true;root.querySelector('#finishRecord').disabled=false;root.querySelector('#cancelRecord').disabled=false;root.querySelector('#recordState').textContent=`● Recording · ${recordingElapsed.toFixed(1)} s`}
  if(!editor){root.querySelector('.sample-edit-grid').hidden=true;root.querySelector('.sample-processing').hidden=true;root.querySelector('.sample-fx').hidden=true;root.querySelector('.sample-tools').hidden=true;root.querySelector('.wave-ruler').hidden=true;canvas.style.width=`${Math.max(280,viewport.clientWidth)}px`;return}
  canvas.style.width=`${Math.max(280,viewport.clientWidth)*editor.view.zoom}px`;
  const updateHistory=()=>{root.querySelector('#sampleUndo').disabled=!editor.undoStack.length;root.querySelector('#sampleRedo').disabled=!editor.redoStack.length};
  const markDirty=()=>{onEdit();try{activePreview?.update(editor.processing.effects,editor.gainDb)}catch(error){stopPreview();notify(`Live sample preview failed: ${error.message}. Your edits are preserved.`)}root.querySelector('#makeSampler').disabled=true;root.querySelector('#makeRack').disabled=true;root.querySelector('#sampleSaveState').textContent='Unsaved edits';updateHistory()};
  const refreshSelection=()=>{
    const duration=editor.duration,length=editor.frameCount,rate=editor.buffer.sampleRate;
    canvas.dataset.start=editor.selection.start;canvas.dataset.end=editor.selection.end;canvas.dataset.duration=duration;canvas.dataset.length=length;
    root.querySelector('#sampleDuration').textContent=`${duration.toFixed(3)} s · ${rate} Hz · ${editor.buffer.numberOfChannels} ch`;
    for(const id of ['trimStart','trimEnd','fadeIn','fadeOut'])root.querySelector(`#${id}`).max=duration;
    root.querySelector('#trimStart').value=(editor.selection.start/rate).toFixed(6);root.querySelector('#trimEnd').value=String(editor.selection.end/rate);
    root.querySelector('#startFine').value=editor.selection.start;root.querySelector('#endFine').value=editor.selection.end;
    root.querySelector('#startFine').max=length;root.querySelector('#endFine').max=length;
    root.querySelector('#fadeIn').value=(editor.fadeInFrames/rate).toFixed(3);root.querySelector('#fadeOut').value=(editor.fadeOutFrames/rate).toFixed(3);
    root.querySelector('#editGain').value=editor.gainDb;root.querySelector('#gainDbValue').textContent=`${editor.gainDb.toFixed(1)} dB`;root.querySelector('#editGain').parameterControl?.sync();
    root.querySelector('#startMarker').style.left=`${frameToX(editor.selection.start,length,canvas.clientWidth)}px`;
    root.querySelector('#endMarker').style.left=`${frameToX(editor.selection.end,length,canvas.clientWidth)}px`;
    for(const [which,frame]of [['start',editor.selection.start],['end',editor.selection.end]]){
      const marker=root.querySelector(`#${which}Marker`);
      marker.classList.toggle('at-start',frame===0);marker.classList.toggle('at-end',frame===length);
      marker.dataset.frame=String(frame);
    }
    root.querySelector('#startMarker').title=`Start: ${(editor.selection.start/rate).toFixed(6)} seconds · frame ${editor.selection.start}`;
    root.querySelector('#endMarker').title=`End: ${(editor.selection.end/rate).toFixed(6)} seconds · frame ${editor.selection.end}`;
    const rulerContent=root.querySelector('.wave-ruler-content');
    rulerContent.style.width=`${canvas.clientWidth}px`;
    rulerContent.innerHTML=Array.from({length:11},(_,index)=>`<span style="left:${index*10}%">${(duration*index/10).toFixed(3)}s</span>`).join('');
    rulerContent.style.transform=`translateX(${-viewport.scrollLeft}px)`;
    drawSampleStudioWave(canvas,editor);
  };
  const setMarkerPosition=(which,frame,snap=false)=>{
    const marker=root.querySelector(which==='start'?'#startMarker':'#endMarker');
    const next=editor.setBoundary(which,frame,snap);
    marker.dataset.frame=String(next);markDirty();refreshSelection();
  };
  const frameFromPointer=event=>xToFrame(event.clientX-canvas.getBoundingClientRect().left,editor.frameCount,canvas.clientWidth);
  const setZoom=(value,anchorX=viewport.clientWidth/2)=>{
    const oldWidth=Math.max(1,canvas.clientWidth),anchorFrame=xToFrame(viewport.scrollLeft+anchorX,editor.frameCount,oldWidth);
    editor.view.zoom=clamp(Number(value),1,24);const width=Math.max(280,viewport.clientWidth)*editor.view.zoom;
    canvas.style.width=`${width}px`;viewport.scrollLeft=frameToX(anchorFrame,editor.frameCount,width)-anchorX;
    root.querySelector('#waveZoom').value=editor.view.zoom;refreshSelection();
  };
  const setPlaybackState=(playing,label=playing?'Playing':'Stopped')=>{const state=root.querySelector('#samplePlaybackState');state.textContent=label;state.setAttribute('aria-label',label);root.querySelector('#playSelection').classList.toggle('active',playing);root.querySelector('#playEntire').classList.toggle('active',playing);root.querySelector('#loopPreview').setAttribute('aria-pressed',String(looping));onPlaybackChange()};
  const stopPreview=()=>{request++;cancelAnimationFrame(cursorRaf);activePreview?.stop();previewSource=null;cursor.style.display='none';looping=false;root.querySelector('#loopPreview').textContent='Loop Preview';setPlaybackState(false)};
  activeSamplePreviewStop=stopPreview;
  const animate=()=>{
    cancelAnimationFrame(cursorRaf);
    if(disposed||activePreview?.state!=='playing')return;
    cursor.style.display='block';
    const mapped=displayStart+activePreview.position/activePreview.buffer.duration*displayLength;
    cursor.style.left=`${frameToX(mapped,editor.frameCount,canvas.clientWidth)}px`;
    cursorRaf=requestAnimationFrame(animate);
  };
  const playBuffer=(buffer,{loop=false,original=false,start=0,length=editor.frameCount}={})=>{
    if(activePreview?.context!==engine.ctx){activePreview?.stop();activePreview=new SamplePreview(engine.ctx,{bpm})}
    activePreview.onEnded=()=>{if(!disposed)stopPreview()};
    activePreview.play(buffer,{effects:editor.processing.effects,gainDb:editor.gainDb,loop,original});
    displayStart=start;displayLength=length;activePreview.display={start,length};looping=loop;previewSource=activePreview.source;setPlaybackState(true,original?'Original (dry)':loop?'Looping live selection':'Playing live selection');animate();
  };
  const renderProcessed=async(selectionOnly=true)=>{
    let output=selectionOnly?editor.renderSelection(engine.ctx):editor.render(engine.ctx);
    output=renderSampleProcessing(engine.ctx,output,editor.processing);
    return renderSampleEffectChain(output,editor.processing.effects,bpm);
  };
  const selectionSeconds=()=>({start:editor.selection.start/editor.buffer.sampleRate,end:editor.selection.end/editor.buffer.sampleRate});
  const checkpointOnInput=element=>{
    let editing=false;
    const begin=()=>{if(!editing){editor.checkpoint();editing=true}};
    element.addEventListener('pointerdown',begin);element.addEventListener('input',begin);
    element.addEventListener('change',()=>{editing=false});element.addEventListener('blur',()=>{editing=false});
  };
  root.querySelector('#sampleUndo').onclick=()=>{stopPreview();if(editor.undo()){markDirty();refreshSelection();refreshStructure()}};
  root.querySelector('#sampleRedo').onclick=()=>{stopPreview();if(editor.redo()){markDirty();refreshSelection();refreshStructure()}};
  root.querySelector('#snapZero').onclick=event=>{zeroSnap=!zeroSnap;event.currentTarget.textContent=`Zero-crossing snap: ${zeroSnap?'on':'off'}`;event.currentTarget.setAttribute('aria-pressed',String(zeroSnap))};
  for(const [which,marker]of [['start',root.querySelector('#startMarker')],['end',root.querySelector('#endMarker')]]){
    marker.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();marker.setPointerCapture(event.pointerId)});
    marker.addEventListener('pointermove',event=>{if(marker.hasPointerCapture(event.pointerId))setMarkerPosition(which,frameFromPointer(event),zeroSnap)});
    marker.addEventListener('pointerup',event=>{if(marker.hasPointerCapture(event.pointerId))marker.releasePointerCapture(event.pointerId)});
  }
  canvas.addEventListener('pointerdown',event=>{dragging=true;canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);selectionAnchor=frameFromPointer(event);if(zeroSnap)selectionAnchor=editor.nearestZeroCrossing(selectionAnchor);editor.setSelection(selectionAnchor,selectionAnchor);markDirty();refreshSelection()});
  canvas.addEventListener('pointermove',event=>{if(!dragging||!canvas.hasPointerCapture(event.pointerId))return;let frame=frameFromPointer(event);if(zeroSnap)frame=editor.nearestZeroCrossing(frame);editor.setSelection(selectionAnchor,frame);markDirty();refreshSelection()});
  canvas.addEventListener('pointerup',event=>{if(canvas.hasPointerCapture(event.pointerId)){dragging=false;canvas.releasePointerCapture(event.pointerId)}});
  canvas.addEventListener('pointercancel',()=>{dragging=false});
  viewport.addEventListener('scroll',()=>{root.querySelector('.wave-ruler-content').style.transform=`translateX(${-viewport.scrollLeft}px)`},{passive:true});
  for(const [id,which]of [['trimStart','start'],['trimEnd','end'],['startFine','start'],['endFine','end']]){
    root.querySelector(`#${id}`).oninput=event=>setMarkerPosition(which,id.endsWith('Fine')?Number(event.target.value):Number(event.target.value)*editor.buffer.sampleRate);
  }
  root.querySelectorAll('[data-nudge]').forEach(button=>button.onclick=()=>{const which=button.dataset.nudge,step=root.querySelector('#framePrecision').checked?1:Math.max(1,Math.round(editor.buffer.sampleRate/1000));setMarkerPosition(which,editor.selection[which]+Number(button.dataset.direction)*step)});
  root.querySelector('#framePrecision').onchange=()=>{const step=root.querySelector('#framePrecision').checked?1:Math.max(1,Math.round(editor.buffer.sampleRate/1000));root.querySelector('#trimStart').step=String(step/editor.buffer.sampleRate);root.querySelector('#trimEnd').step=String(step/editor.buffer.sampleRate)};
  root.querySelector('#waveZoom').oninput=event=>setZoom(Number(event.target.value));
  root.querySelector('#waveZoomIn').onclick=()=>setZoom(editor.view.zoom*1.25);
  root.querySelector('#waveZoomOut').onclick=()=>setZoom(editor.view.zoom/1.25);
  root.querySelector('#waveFit').onclick=()=>{setZoom(1,0);viewport.scrollLeft=0};
  root.querySelector('#waveZoomSelection').onclick=()=>{const length=editor.selection.end-editor.selection.start;if(length<1)return;setZoom(clamp(editor.frameCount/length,1,24),frameToX((editor.selection.start+editor.selection.end)/2,editor.frameCount,canvas.clientWidth)-viewport.scrollLeft)};
  viewport.addEventListener('wheel',event=>{if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();setZoom(editor.view.zoom*Math.exp(-event.deltaY*.002),event.clientX-viewport.getBoundingClientRect().left)},{passive:false});
  let touches=new Map(),pinch=null;
  viewport.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(touches.size===2){event.preventDefault();event.stopPropagation();dragging=false;const points=[...touches.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);pinch={distance:Math.max(1,distance),zoom:editor.view.zoom};viewport.setPointerCapture(event.pointerId)}},{capture:true});
  viewport.addEventListener('pointermove',event=>{if(!touches.has(event.pointerId))return;touches.set(event.pointerId,{x:event.clientX,y:event.clientY});if(!pinch||touches.size<2)return;event.preventDefault();const points=[...touches.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),center=(points[0].x+points[1].x)/2;setZoom(pinch.zoom*distance/pinch.distance,center-viewport.getBoundingClientRect().left)},{capture:true});
  for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,event=>{touches.delete(event.pointerId);if(touches.size<2)pinch=null},{capture:true});
  root.querySelector('#trimSelection').onclick=()=>{if(editor.cropSelection()){markDirty();refreshSelection()}};
  root.querySelector('#deleteSelection').onclick=()=>{if(editor.deleteSelection()){markDirty();refreshSelection()}};
  root.querySelector('#splitSelection').onclick=()=>{if(editor.splitSelection()){markDirty();refreshSelection()}};
  root.querySelector('#reverseSample').onclick=()=>{editor.reverse();markDirty();refreshSelection()};
  root.querySelector('#removeSilence').onclick=()=>{if(editor.trimSilence(-60)){markDirty();refreshSelection()}else notify('No leading or trailing silence found above -60 dBFS.')};
  checkpointOnInput(root.querySelector('#editGain'));
  root.querySelector('#editGain').oninput=event=>{editor.setGainDb(Number(event.target.value),false);markDirty();refreshSelection()};
  root.querySelector('#normalize').onclick=()=>{if(!editor.normalize(Number(root.querySelector('#normalizeTarget').value),editor.selection.start,editor.selection.end))return notify('Cannot normalize silence.');markDirty();refreshSelection()};
  for(const id of ['fadeIn','fadeOut'])root.querySelector(`#${id}`).onchange=event=>{const currentIn=editor.fadeInFrames/editor.buffer.sampleRate,currentOut=editor.fadeOutFrames/editor.buffer.sampleRate;editor.setFades(id==='fadeIn'?Math.max(0,Number(event.target.value)||0):currentIn,id==='fadeOut'?Math.max(0,Number(event.target.value)||0):currentOut);markDirty();refreshSelection()};
  for(const [id,key]of [['sampleSpeed','speed'],['samplePitch','pitchSemitones'],['sampleCents','pitchCents']]){const control=root.querySelector(`#${id}`);checkpointOnInput(control);control.oninput=event=>{const value=Number(event.target.value);editor.processing[key]=value;event.target.nextElementSibling.value=key==='speed'?`${value.toFixed(2)}×`:key==='pitchSemitones'?`${value} st`:`${value} cents`;markDirty()}}
  root.querySelector('#samplePitchMode').onchange=event=>{editor.checkpoint();editor.processing.mode=event.target.value;markDirty()};
  root.querySelector('#addSampleEffect').onchange=event=>{if(!event.target.value)return;editor.checkpoint();editor.processing.effects.push(createTrackEffect(event.target.value,`sample-${Date.now()}`));markDirty();refreshStructure()};
  root.querySelectorAll('[data-sample-fx-enabled]').forEach(control=>control.onchange=()=>{editor.checkpoint();editor.processing.effects[Number(control.dataset.sampleFxEnabled)].enabled=control.checked;markDirty()});
  root.querySelectorAll('[data-sample-fx-param]').forEach(control=>{checkpointOnInput(control);control.oninput=()=>{const effect=editor.processing.effects[Number(control.dataset.sampleFxParam)],key=control.dataset.param,value=Number(control.value)/Number(control.dataset.scale||1);if(control.dataset.eqBand!==undefined)effect.params.bands[Number(control.dataset.eqBand)][key]=value;else effect.params[key]=value;control.nextElementSibling.value=Number(control.value).toFixed(control.step.includes('.')?2:0);markDirty()}});
  root.querySelectorAll('[data-sample-fx-up],[data-sample-fx-down],[data-sample-fx-remove]').forEach(button=>button.onclick=()=>{editor.checkpoint();if(button.hasAttribute('data-sample-fx-remove'))editor.processing.effects.splice(Number(button.dataset.sampleFxRemove),1);else{const index=Number(button.dataset.sampleFxUp??button.dataset.sampleFxDown),next=index+(button.hasAttribute('data-sample-fx-up')?-1:1);[editor.processing.effects[index],editor.processing.effects[next]]=[editor.processing.effects[next],editor.processing.effects[index]]}markDirty();refreshStructure()});
  const preview=async mode=>{
    if(mode==='stop'){stopPreview();return}
    const token=++request;
    try{
      await engine.init();if(disposed||token!==request)return;
      const entire=mode==='entire',original=mode==='original';
      let output;
      if(original){
        const {start,end}=selectionSeconds();
        if(end<=start)throw new RangeError('Select a non-empty region.');
        output=engine.ctx.createBuffer(editor.buffer.numberOfChannels,editor.selection.end-editor.selection.start,editor.buffer.sampleRate);
        for(let channel=0;channel<output.numberOfChannels;channel++)output.copyToChannel(editor.buffer.getChannelData(channel).subarray(Math.round(start*editor.buffer.sampleRate),Math.round(end*editor.buffer.sampleRate)),channel);
      }else output=renderSampleProcessing(engine.ctx,entire?editor.render(engine.ctx,{applyGain:false}):editor.renderSelection(engine.ctx,{applyGain:false}),editor.processing);
      if(disposed||token!==request)return;
      playBuffer(output,{loop:mode==='loop',original,start:entire?0:editor.selection.start,length:entire?editor.frameCount:editor.selection.end-editor.selection.start});
    }catch(error){if(!disposed){stopPreview();notify(`Sample processing failed: ${error.message}`)}}
  };
  sampleTransport=async()=>{
    if(recording){notify('Space does not control microphone recording. Use Finish Recording or Cancel Recording.');return}
    if(activePreview?.state==='playing'){request++;activePreview.pause();cancelAnimationFrame(cursorRaf);setPlaybackState(false,'Paused');return}
    if(activePreview?.state==='paused'){const current=activePreview;await engine.init();if(disposed||current!==activePreview)return;current.resume();setPlaybackState(true);animate();return}
    await preview(abOriginal?'original':'selection');
  };
  root.querySelector('#playSelection').onclick=()=>preview('selection');root.querySelector('#playEntire').onclick=()=>preview('entire');root.querySelector('#stopPreview').onclick=()=>preview('stop');root.querySelector('#loopPreview').onclick=()=>looping?stopPreview():preview('loop');
  root.querySelector('#previewAB').onclick=()=>{abOriginal=!abOriginal;root.querySelector('#previewAB').textContent=abOriginal?'B: processed':'A/B original';preview(abOriginal?'original':'selection')};
  root.querySelector('#saveSample').onclick=async()=>{try{await engine.init();const output=await renderProcessed(true);await onSave(output,root.querySelector('#sampleName').value)}catch(error){notify(`Sample save failed: ${error.message}`)}};
  root.querySelector('#makeSampler').onclick=onCreateSampler;root.querySelector('#makeRack').onclick=onCreateRack;
  root.onkeydown=event=>{if(event.target.closest('input,select,textarea,button,[contenteditable="true"],[role=slider]'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();root.querySelector(event.shiftKey?'#sampleRedo':'#sampleUndo').click()}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();root.querySelector('#sampleRedo').click()}else if(event.key.toLowerCase()==='s'){event.preventDefault();root.querySelector('#splitSelection').click()}else if(event.key.toLowerCase()==='r'){event.preventDefault();root.querySelector('#reverseSample').click()}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();root.querySelector('#deleteSelection').click()}};
  for(const [id,name,unit,reset,scale]of [['editGain','Sample gain','dB',0,'linear'],['sampleSpeed','Speed','x',1,'log'],['samplePitch','Pitch','st',0,'linear'],['sampleCents','Fine tuning','cents',0,'linear']]){
    const input=root.querySelector(`#${id}`);
    enhanceParameter(input,{name,unit,reset,scale,rotary:true});
  }
  const rack=document.createElement('div');rack.className='device-chain-scroll sample-device-chain';
  const sampleFx=root.querySelector('.sample-fx');sampleFx.append(rack);
  Object.defineProperty(root.querySelector('.sample-studio'),'previewSession',{get:()=>activePreview});
  for(const article of sampleFx.querySelectorAll('.sample-effect'))rack.append(article);
  for(const [index,article]of [...rack.querySelectorAll('.sample-effect')].entries()){
    const effect=editor.processing.effects[index];article.classList.add('effect-device');
    for(const [from,to]of [['data-sample-fx-enabled','data-effect-enabled'],['data-sample-fx-up','data-effect-up'],['data-sample-fx-down','data-effect-down'],['data-sample-fx-remove','data-effect-remove']]){
      const element=article.querySelector(`[${from}]`);element.setAttribute(to,element.getAttribute(from));
    }
    mountDeviceShell(article,{id:effect.id,type:effect.type,title:effect.type});
    const body=article.querySelector('.device-body');
    if(effect.type==='delay'||effect.type==='utility'){
      const key=effect.type==='delay'?'sync':'invert',label=document.createElement('label'),toggle=document.createElement('input');
      label.textContent=key==='sync'?'Tempo sync ':'Invert polarity ';toggle.type='checkbox';toggle.checked=Boolean(effect.params[key]);toggle.dataset.sampleToggle=key;label.append(toggle);body.append(label);
      const syncTime=()=>{const time=article.querySelector('[data-param=time]');if(time){time.disabled=toggle.checked;time.parameterControl?.sync()}};
      toggle.onchange=()=>{editor.checkpoint();effect.params[key]=toggle.checked;syncTime();markDirty()};
      if(key==='sync'){
        const label=document.createElement('label'),choice=document.createElement('select');label.textContent='Beat division ';
        for(const [value,name]of [[.25,'1/16'],[.5,'1/8'],[.75,'1/8 dotted'],[1,'1/4'],[1.5,'1/4 dotted'],[2,'1/2'],[4,'1 bar']])choice.add(new Option(name,value));
        choice.value=String(effect.params.division??1);choice.onchange=()=>{editor.checkpoint();effect.params.division=Number(choice.value);markDirty()};label.append(choice);body.append(label);
      }
    }
    article.querySelector('[data-sample-fx-enabled]').addEventListener('change',()=>eqViews.forEach(view=>view.refresh()));
    for(const input of article.querySelectorAll('[data-sample-fx-param]'))if(effect.type!=='eq')enhanceParameter(input,effectParameterOptions(effect,input));
    if(effect.type==='delay'){const time=article.querySelector('[data-param=time]');time.disabled=Boolean(effect.params.sync);time.parameterControl.sync()}
    if(['compressor','limiter'].includes(effect.type)){
      const meter=document.createElement('output');meter.dataset.sampleReduction=effect.id;meter.textContent='0.0 dB gain reduction';article.querySelector('.device-body').append(meter);
    }
  }
  let eqEditing=false;
  const previewEngine={get ctx(){return engine.ctx},trackNodes:{get(){return activePreview?.graph}}};
  eqViews=mountTrackEqs(rack,{id:'sample-preview',name:'Sample',fx:{effects:editor.processing.effects}},previewEngine,persist=>{
    markDirty();if(persist)eqEditing=false;
  },error=>notify(`Sample EQ failed: ${error.message}`),()=>{if(!eqEditing){editor.checkpoint();eqEditing=true}});
  const message=document.createElement('p');message.className='hint sample-live-hint';message.textContent='Gain and device parameters are live. Region, reverse, fades, speed and pitch prepare a new buffer on Preview; Save always renders current edits once. Space pauses/resumes; Stop resets.';
  root.querySelector('.sample-processing').append(message);
  const meterTick=()=>{
    if(disposed)return;
    for(const output of rack.querySelectorAll('[data-sample-reduction]')){
      const node=activePreview?.graph?.instances.get(output.dataset.sampleReduction)?.node;
      const text=`${Math.max(0,-Number(node?.reduction||0)).toFixed(1)} dB gain reduction`;if(output.textContent!==text)output.textContent=text;
    }
    meterTimer=setTimeout(meterTick,100);
  };
  let meterTimer;meterTick();
  const disposeUI=activeSampleUiDispose;activeSampleUiDispose=()=>{clearTimeout(meterTimer);root.onkeydown=null;disposeUI()};
  if(activePreview&&activePreview.bpm!==bpm){
    activePreview.bpm=bpm;
    if(editor.processing.effects.some(effect=>effect.enabled&&effect.type==='delay'&&effect.params.sync))markDirty();
  }
  if(activePreview&&activeEditor===editor&&activePreview.state!=='stopped'){
    activePreview.onEnded=()=>{if(!disposed)stopPreview()};
    displayStart=activePreview.display?.start||0;displayLength=activePreview.display?.length||editor.frameCount;looping=activePreview.loop;
    abOriginal=activePreview.original;root.querySelector('#previewAB').textContent=abOriginal?'B: processed':'A/B original';
    if(activePreview.state==='playing'){setPlaybackState(true,'Playing live preview');animate()}
    else setPlaybackState(false,'Paused');
  }
  root.tabIndex=0;refreshSelection();updateHistory();restoreDeviceUi(root,savedDeviceUi);
}
