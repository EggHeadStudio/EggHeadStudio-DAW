const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const cloneRegions=regions=>regions.map(region=>({...region}));

export class SampleEditor {
  constructor(buffer) {
    if(!buffer||!Number.isInteger(buffer.length)||!Number.isFinite(buffer.sampleRate))throw new TypeError('A decoded audio buffer is required.');
    this.buffer=buffer;
    this.regions=[{start:0,end:buffer.length,reverse:false}];
    this.selection={start:0,end:Math.min(buffer.length,1)};
    this.loop={start:0,end:Math.min(buffer.length,1)};
    this.gainDb=0;
    this.fadeInFrames=0;
    this.fadeOutFrames=0;
    this.undoStack=[];
    this.redoStack=[];
  }

  get frameCount(){return this.regions.reduce((total,region)=>total+region.end-region.start,0)}
  get duration(){return this.frameCount/this.buffer.sampleRate}

  checkpoint(){
    this.undoStack.push({regions:cloneRegions(this.regions),selection:{...this.selection},loop:{...this.loop},gainDb:this.gainDb,fadeInFrames:this.fadeInFrames,fadeOutFrames:this.fadeOutFrames});
    if(this.undoStack.length>100)this.undoStack.shift();
    this.redoStack=[];
  }

  restore(state){
    this.regions=cloneRegions(state.regions);
    this.offsets=null;
    this.selection={...state.selection};
    this.loop={...state.loop};
    this.gainDb=state.gainDb;
    this.fadeInFrames=state.fadeInFrames;
    this.fadeOutFrames=state.fadeOutFrames;
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

  render(context){
    const output=context.createBuffer(this.buffer.numberOfChannels,Math.max(1,this.frameCount),this.buffer.sampleRate),gain=10**(this.gainDb/20);
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

  undo(){
    if(!this.undoStack.length)return false;
    this.redoStack.push({regions:cloneRegions(this.regions),selection:{...this.selection},loop:{...this.loop},gainDb:this.gainDb,fadeInFrames:this.fadeInFrames,fadeOutFrames:this.fadeOutFrames});
    this.restore(this.undoStack.pop());
    return true;
  }

  redo(){
    if(!this.redoStack.length)return false;
    this.undoStack.push({regions:cloneRegions(this.regions),selection:{...this.selection},loop:{...this.loop},gainDb:this.gainDb,fadeInFrames:this.fadeInFrames,fadeOutFrames:this.fadeOutFrames});
    this.restore(this.redoStack.pop());
    return true;
  }
}

export function renderSampleStudioHTML(editor,filename='My_Sample.wav',saved=false){
  const duration=editor?editor.duration:0,length=editor?.frameCount||0,selection=editor?.selection||{start:0,end:0};
  return `<section class="studio sample-studio"><div class="section-title"><h2>Sample Studio</h2><p>Record or load audio, select precisely, edit non-destructively, preview, then save a new sample.</p></div>
    <div class="record-controls"><button id="record" class="accent">● Record Own</button><button id="finishRecord" disabled>■ Stop Recording</button><button id="loadSample">＋ Edit Existing Sample</button><span id="recordState">Microphone idle</span></div>
    <div class="wave-panel">
      <div class="sample-wave-toolbar"><label>Zoom <input id="waveZoom" type="range" min="1" max="24" step=".1" value="1"></label><span id="sampleDuration">${duration.toFixed(3)} s · ${editor?.buffer.sampleRate||0} Hz</span><button id="snapZero" aria-pressed="true">Zero-crossing snap: on</button><button id="sampleUndo" ${editor?.undoStack.length?'':'disabled'}>Undo</button><button id="sampleRedo" ${editor?.redoStack.length?'':'disabled'}>Redo</button></div>
      <div id="waveViewport" class="wave-viewport"><div class="wave-canvas-wrap"><canvas id="sampleWave" class="sample-wave" data-duration="${duration}" data-length="${length}" data-start="${selection.start}" data-end="${selection.end}" tabindex="0" aria-label="Audio waveform selection"></canvas><i id="sampleCursor" class="sample-cursor"></i></div></div>
      <div class="edit-grid sample-edit-grid">
        <label>Selection start (s)<input id="trimStart" type="number" min="0" max="${duration}" step=".0001" value="${selection.start/(editor?.buffer.sampleRate||1)}"></label>
        <label>Selection end (s)<input id="trimEnd" type="number" min="0" max="${duration}" step=".0001" value="${selection.end/(editor?.buffer.sampleRate||1)}"></label>
        <label>Gain (dB)<input id="editGain" type="range" min="-60" max="120" step=".1" value="${editor?.gainDb||0}"><output id="gainDbValue">${(editor?.gainDb||0).toFixed(1)} dB</output></label>
        <label>Normalize peak (dBFS)<input id="normalizeTarget" type="number" min="-60" max="0" step=".1" value="-1"></label>
        <label>Fade In (s)<input id="fadeIn" type="number" min="0" max="${duration}" step=".001" value="${(editor?.fadeInFrames||0)/(editor?.buffer.sampleRate||1)}"></label>
        <label>Fade Out (s)<input id="fadeOut" type="number" min="0" max="${duration}" step=".001" value="${(editor?.fadeOutFrames||0)/(editor?.buffer.sampleRate||1)}"></label>
      </div>
      <div class="record-controls sample-tools"><button id="trimSelection" ${length?'':'disabled'}>Crop to selection</button><button id="splitSelection" ${length?'':'disabled'}>Split at selection edges</button><button id="deleteSelection" ${length?'':'disabled'}>Delete selection</button><button id="reverseSample" ${length?'':'disabled'}>Reverse</button><button id="removeSilence" ${length?'':'disabled'}>Remove leading/trailing silence</button><button id="normalize" ${length?'':'disabled'}>Normalize</button><button id="loopPreview" ${length?'':'disabled'}>Preview loop</button><button id="previewEdit" ${length?'':'disabled'}>▶ Preview edited</button><button id="previewAB" ${length?'':'disabled'}>A/B original</button></div>
      <div class="record-controls"><label>Sample name <input id="sampleName" value="${String(filename).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}" ${length?'':'disabled'}></label><button id="saveSample" class="primary" ${length?'':'disabled'}>Save Sample</button><button id="makeSampler" ${saved?'':'disabled'}>Create Sampler</button><button id="makeRack" ${saved?'':'disabled'}>Add to Drum Rack</button><span id="sampleSaveState">${saved?'Saved sample ready to use.':'Edits do not modify the original recording.'}</span></div>
      <p class="hint">Drag across the waveform to select. Keyboard: Space preview, Ctrl/Cmd+Z undo, Ctrl/Cmd+Y redo, Delete remove selection, S split, R reverse. Loop preview repeats the current selection.</p>
    </div></section>`;
}

export function drawSampleStudioWave(canvas,editor,cursorFrame=0){
  if(!canvas||!editor)return;
  const dpr=Math.min(globalThis.devicePixelRatio||1,2),width=canvas.clientWidth||300,height=canvas.clientHeight||170;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  ctx.fillStyle='#121923';ctx.fillRect(0,0,width,height);
  const mid=height/2,data=editor.buffer.getChannelData(0),frames=editor.frameCount;
  ctx.strokeStyle='#79d5c1';ctx.lineWidth=1;
  const stride=Math.max(1,Math.ceil(frames/width/2048));
  for(let x=0;x<width;x++){
    const from=Math.floor(x*frames/width),to=Math.min(frames,Math.max(from+1,Math.floor((x+1)*frames/width)));
    let lo=1,hi=-1;
    for(let frame=from;frame<to;frame+=stride){let sample=(data[editor.sourceFrameAt(frame)]||0)*10**(editor.gainDb/20);if(editor.fadeInFrames)sample*=Math.min(1,frame/editor.fadeInFrames);if(editor.fadeOutFrames)sample*=Math.min(1,(frames-1-frame)/editor.fadeOutFrames);if(sample<lo)lo=sample;if(sample>hi)hi=sample}
    ctx.beginPath();ctx.moveTo(x,(1-hi)*mid);ctx.lineTo(x,(1-lo)*mid);ctx.stroke();
  }
  if(frames&&editor.selection.end>editor.selection.start){ctx.fillStyle='#e9be6233';ctx.fillRect(editor.selection.start/frames*width,0,(editor.selection.end-editor.selection.start)/frames*width,height)}
  ctx.strokeStyle='#e9be62';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(editor.selection.start/Math.max(1,frames)*width,0);ctx.lineTo(editor.selection.start/Math.max(1,frames)*width,height);ctx.moveTo(editor.selection.end/Math.max(1,frames)*width,0);ctx.lineTo(editor.selection.end/Math.max(1,frames)*width,height);ctx.stroke();
}

export function wireSampleStudio(root,{editor,engine,notify,onRecord,onLoad,onSave,onEdit,onCreateSampler,onCreateRack}){
  let dragging=false,zeroSnap=true,looping=false,cursorStart=0,cursorRaf=0,abOriginal=false,gainDragging=false,previewSource=null;
  const canvas=root.querySelector('#sampleWave'),viewport=root.querySelector('#waveViewport');
  const cursor=root.querySelector('#sampleCursor');
  root.querySelector('#record').onclick=onRecord;
  root.querySelector('#loadSample').onclick=onLoad;
  root.tabIndex=0;
  if(!editor){root.querySelector('#waveZoom').disabled=true;root.querySelector('#snapZero').disabled=true;root.querySelector('#sampleUndo').disabled=true;root.querySelector('#sampleRedo').disabled=true;root.querySelector('.sample-edit-grid').hidden=true;root.querySelector('.sample-tools').hidden=true;root.querySelector('#waveViewport').hidden=true;root.tabIndex=0;return}
  const invalidate=()=>{onEdit();root.querySelector('#makeSampler').disabled=true;root.querySelector('#makeRack').disabled=true;root.querySelector('#sampleSaveState').textContent='Unsaved edits';drawSampleStudioWave(canvas,editor);updateHistory()};
  const updateHistory=()=>{root.querySelector('#sampleUndo').disabled=!editor.undoStack.length;root.querySelector('#sampleRedo').disabled=!editor.redoStack.length};
  const refreshSelection=()=>{const duration=editor.duration;canvas.dataset.start=editor.selection.start;canvas.dataset.end=editor.selection.end;canvas.dataset.duration=duration;canvas.dataset.length=editor.frameCount;root.querySelector('#sampleDuration').textContent=`${duration.toFixed(3)} s · ${editor.buffer.sampleRate} Hz`;for(const id of ['trimStart','trimEnd','fadeIn','fadeOut'])root.querySelector(`#${id}`).max=duration;root.querySelector('#trimStart').value=(editor.selection.start/editor.buffer.sampleRate).toFixed(4);root.querySelector('#trimEnd').value=(editor.selection.end/editor.buffer.sampleRate).toFixed(4);root.querySelector('#fadeIn').value=(editor.fadeInFrames/editor.buffer.sampleRate).toFixed(3);root.querySelector('#fadeOut').value=(editor.fadeOutFrames/editor.buffer.sampleRate).toFixed(3);root.querySelector('#editGain').value=editor.gainDb;root.querySelector('#gainDbValue').textContent=`${editor.gainDb.toFixed(1)} dB`;drawSampleStudioWave(canvas,editor)};
  const frameFromPointer=event=>{const rect=canvas.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));let frame=Math.round(fraction*editor.frameCount);if(zeroSnap)frame=editor.nearestZeroCrossing(frame);return frame};
  const selectAt=(event,initial=false)=>{const frame=frameFromPointer(event);if(initial)cursorStart=frame;editor.setSelection(cursorStart,frame);refreshSelection()};
  const setCursor=frame=>{cursor.style.left=`${frame/Math.max(1,editor.frameCount)*canvas.clientWidth}px`};
  const stopPreview=()=>{cancelAnimationFrame(cursorRaf);try{previewSource?.stop()}catch{}previewSource=null;cursor.style.display='none'};
  const playBuffer=(buffer,start=0,end=buffer.duration,loop=false)=>{stopPreview();const source=engine.ctx.createBufferSource();source.buffer=buffer;source.loop=loop;if(loop){source.loopStart=start;source.loopEnd=end}source.connect(engine.ctx.destination);if(loop)source.start(0,start);else source.start(0,start,Math.max(.001,end-start));previewSource=source;cursor.style.display='block';const startTime=engine.ctx.currentTime;const update=()=>{if(previewSource!==source)return;const elapsed=engine.ctx.currentTime-startTime;const position=loop?start+(elapsed%(end-start)):start+elapsed;setCursor(Math.round(position*editor.buffer.sampleRate));if(!loop&&position>=end){previewSource=null;cursor.style.display='none';return}cursorRaf=requestAnimationFrame(update)};update();source.onended=()=>{if(previewSource===source){previewSource=null;cancelAnimationFrame(cursorRaf);cursor.style.display='none'}}};
  const renderEdited=()=>editor.render(engine.ctx);
  const selectionSeconds=()=>({start:editor.selection.start/editor.buffer.sampleRate,end:editor.selection.end/editor.buffer.sampleRate});
  root.querySelector('#sampleUndo').onclick=()=>{if(editor.undo()){invalidate();refreshSelection()}};
  root.querySelector('#sampleRedo').onclick=()=>{if(editor.redo()){invalidate();refreshSelection()}};
  root.querySelector('#snapZero').onclick=event=>{zeroSnap=!zeroSnap;event.currentTarget.textContent=`Zero-crossing snap: ${zeroSnap?'on':'off'}`;event.currentTarget.setAttribute('aria-pressed',String(zeroSnap))};
  canvas.addEventListener('pointerdown',event=>{dragging=true;canvas.setPointerCapture(event.pointerId);selectAt(event,true)});
  canvas.addEventListener('pointermove',event=>{if(dragging)selectAt(event)});
  canvas.addEventListener('pointerup',event=>{if(dragging){selectAt(event);dragging=false}});
  canvas.addEventListener('pointercancel',()=>{dragging=false});
  root.querySelector('#waveZoom').oninput=event=>{const old=viewport.scrollLeft+viewport.clientWidth/2,ratio=canvas.clientWidth?old/canvas.clientWidth:.5;canvas.style.width=`${Math.max(viewport.clientWidth,Math.min(50000,viewport.clientWidth*Number(event.target.value)))}px`;drawSampleStudioWave(canvas,editor);viewport.scrollLeft=ratio*canvas.clientWidth-viewport.clientWidth/2};
  for(const [id,key] of [['trimStart','start'],['trimEnd','end']])root.querySelector(`#${id}`).onchange=event=>{const time=Math.max(0,Math.min(editor.duration,Number(event.target.value)||0))*editor.buffer.sampleRate;editor.setSelection(key==='start'?time:editor.selection.start,key==='end'?time:editor.selection.end);if(editor.selection.end<editor.selection.start)editor.setSelection(editor.selection.end,editor.selection.end);refreshSelection()};
  root.querySelector('#trimSelection').onclick=()=>{if(editor.cropSelection()){invalidate();refreshSelection()}};
  root.querySelector('#deleteSelection').onclick=()=>{if(editor.deleteSelection()){invalidate();refreshSelection()}};
  root.querySelector('#splitSelection').onclick=()=>{if(editor.splitSelection()){invalidate();refreshSelection()}};
  root.querySelector('#reverseSample').onclick=()=>{editor.reverse();invalidate();refreshSelection()};
  root.querySelector('#removeSilence').onclick=()=>{if(editor.trimSilence(-60)){invalidate();refreshSelection()}else notify('No leading or trailing silence found above -60 dBFS.')};
  root.querySelector('#editGain').onpointerdown=()=>{gainDragging=true;editor.checkpoint()};
  root.querySelector('#editGain').onpointerup=()=>{gainDragging=false};
  root.querySelector('#editGain').oninput=event=>{editor.setGainDb(Number(event.target.value),!gainDragging);root.querySelector('#gainDbValue').textContent=`${editor.gainDb.toFixed(1)} dB`;onEdit();root.querySelector('#makeSampler').disabled=true;root.querySelector('#makeRack').disabled=true;root.querySelector('#sampleSaveState').textContent='Unsaved edits';drawSampleStudioWave(canvas,editor);updateHistory()};
  root.querySelector('#normalize').onclick=()=>{const selection=editor.selection.end>editor.selection.start?editor.selection:{start:0,end:editor.frameCount};if(!editor.normalize(Number(root.querySelector('#normalizeTarget').value),selection.start,selection.end))return notify('Cannot normalize silence.');root.querySelector('#editGain').value=editor.gainDb;root.querySelector('#gainDbValue').textContent=`${editor.gainDb.toFixed(1)} dB`;invalidate()};
  for(const [id,key] of [['fadeIn','fadeInFrames'],['fadeOut','fadeOutFrames']])root.querySelector(`#${id}`).onchange=event=>{const currentIn=editor.fadeInFrames/editor.buffer.sampleRate,currentOut=editor.fadeOutFrames/editor.buffer.sampleRate;editor.setFades(key==='fadeIn'?Math.max(0,Number(event.target.value)||0):currentIn,key==='fadeOut'?Math.max(0,Number(event.target.value)||0):currentOut);invalidate()};
  root.querySelector('#previewEdit').onclick=()=>playBuffer(renderEdited());
  root.querySelector('#loopPreview').onclick=()=>{const start=editor.selection.start/editor.buffer.sampleRate,end=editor.selection.end/editor.buffer.sampleRate;if(end<=start)return notify('Select a loop region first.');looping=!looping;root.querySelector('#loopPreview').textContent=looping?'Stop loop preview':'Preview loop';if(looping)playBuffer(renderEdited(),start,end,true);else stopPreview()};
  root.querySelector('#previewAB').onclick=()=>{abOriginal=!abOriginal;root.querySelector('#previewAB').textContent=abOriginal?'B: edited sample':'A/B original';const selection=selectionSeconds();playBuffer(abOriginal?editor.buffer:renderEdited(),abOriginal?0:selection.start,abOriginal?editor.buffer.duration:selection.end)};
  root.querySelector('#saveSample').onclick=()=>onSave(renderEdited(),root.querySelector('#sampleName').value).catch(error=>notify(`Sample save failed: ${error.message}`));
  root.querySelector('#makeSampler').onclick=onCreateSampler;
  root.querySelector('#makeRack').onclick=onCreateRack;
  root.addEventListener('keydown',event=>{if(event.target.matches('input,select,textarea,button'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();root.querySelector(event.shiftKey?'#sampleRedo':'#sampleUndo').click()}else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();root.querySelector('#sampleRedo').click()}else if(event.code==='Space'){event.preventDefault();root.querySelector('#previewEdit').click()}else if(event.key.toLowerCase()==='s'){event.preventDefault();root.querySelector('#splitSelection').click()}else if(event.key.toLowerCase()==='r'){event.preventDefault();root.querySelector('#reverseSample').click()}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();root.querySelector('#deleteSelection').click()}});
  root.tabIndex=0;root.focus({preventScroll:true});drawSampleStudioWave(canvas,editor);updateHistory();
}
