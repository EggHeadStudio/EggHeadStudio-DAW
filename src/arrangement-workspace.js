import {clipDurationSeconds} from './audio.js';
import {copyTimeRange,deleteTimeRange,moveClipTo,normalizeTimeSelection,pasteTimeRange,resizeClipAtBeat} from './arrangement.js';
import {clipViewportWindow,draggedClipStart,editLoopRegion,pinchZoomValue,quantizeBeat,timelineBeatsAtClientX} from './timeline.js';
import {getWaveformRangePeaks} from './waveform.js';
import {normalizeArrangementLoop} from './project-state.js';
import {assertClipDestination,instrumentType,isInstrumentClip,patternForClip} from './instrument-clips.js';
import {syncArrangementActions} from './workspace-ui.js';

function drawPattern(canvas,track,clip,window,height){
  const width=Math.max(1,Math.ceil(window.width)),dpr=Math.min(devicePixelRatio||1,2),pattern=patternForClip(track,clip);
  canvas.width=width*dpr;canvas.height=height*dpr;
  const context=canvas.getContext('2d');context.scale(dpr,dpr);context.fillStyle='#10252aaa';
  if(!pattern?.notes.length)return;
  let low=127,high=0;for(const note of pattern.notes){low=Math.min(low,note.midi);high=Math.max(high,note.midi)}high=Math.max(low+1,high);
  const start=window.start*clip.durationBeats,end=window.end*clip.durationBeats,scale=width/(end-start),offset=clip.offsetBeats||0;
  for(const note of pattern.notes){
    const first=clip.loop?Math.max(0,Math.floor((start+offset-note.beat-note.durationBeats)/pattern.lengthBeats)):0;
    const last=clip.loop?Math.ceil((end+offset-note.beat)/pattern.lengthBeats):1;
    for(let cycle=first;cycle<last;cycle++){
      const at=cycle*pattern.lengthBeats+note.beat-offset,until=Math.min(clip.durationBeats,at+note.durationBeats);
      if(until<=start||at>=end)continue;
      const left=Math.max(start,at),right=Math.min(end,until),y=4+(high-note.midi)/(high-low)*Math.max(1,height-12);
      context.globalAlpha=.4+.6*(note.velocity??.85);context.fillRect((left-start)*scale,y,Math.max(2,(right-left)*scale),track.drumRack?6:3);
    }
  }
}

function drawClipWave(canvas,buffer,clip,window,height){
  const width=Math.max(1,Math.ceil(window.width)),dpr=Math.min(devicePixelRatio||1,2),rate=clip.rate||1;
  canvas.width=width*dpr;canvas.height=height*dpr;
  const context=canvas.getContext('2d');context.scale(dpr,dpr);context.strokeStyle='#10252aa0';
  const start=Math.floor(clip.start*buffer.sampleRate),end=Math.min(buffer.length,Math.ceil(clip.end*buffer.sampleRate)),cycle=end-start;
  if(cycle<=0)return;
  const sourceFrames=(clip.loop?clipDurationSeconds(clip)*rate:clip.end-clip.start)*buffer.sampleRate;
  const offset=sourceFrames*window.start,span=sourceFrames*(window.end-window.start)/width;
  for(let x=0;x<width;x++){
    const phase=clip.loop?Math.floor((clip.loopOffset||0)*buffer.sampleRate+offset+x*span)%cycle:Math.floor(offset+x*span),from=start+phase;
    const peaks=clip.loop&&span>=cycle?getWaveformRangePeaks(buffer,0,start,end):getWaveformRangePeaks(buffer,0,from,Math.min(end,Math.ceil(from+span)));
    if(clip.loop&&span<cycle&&from+span>end){
      const head=getWaveformRangePeaks(buffer,0,start,Math.ceil(start+from+span-end));
      peaks.minimum=Math.min(peaks.minimum,head.minimum);peaks.maximum=Math.max(peaks.maximum,head.maximum);
    }
    context.beginPath();context.moveTo(x,(1-peaks.maximum)*height/2);context.lineTo(x,(1-peaks.minimum)*height/2);context.stroke();
  }
}

export function arrangementGesture(element,event,move,finish,cancel){
  if(event.button!==0||event.isPrimary===false)return null;
  event.preventDefault();event.stopPropagation();
  const pointerId=event.pointerId;
  element.setPointerCapture(pointerId);
  let ended=false;
  const onMove=next=>{if(next.pointerId===pointerId)move(next)};
  const end=(next,aborted)=>{
    if(ended||next.pointerId!==pointerId)return false;
    ended=true;
    element.removeEventListener('pointermove',onMove);element.removeEventListener('pointerup',onUp);element.removeEventListener('pointercancel',onCancel);element.removeEventListener('lostpointercapture',onCancel);
    if(element.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);
    if(aborted)cancel?.();else finish(next);
    return true;
  };
  const onUp=next=>end(next,false),onCancel=next=>end(next,true);
  element.addEventListener('pointermove',onMove);element.addEventListener('pointerup',onUp);element.addEventListener('pointercancel',onCancel);element.addEventListener('lostpointercapture',onCancel);
  return()=>end({pointerId},true);
}

export function mountArrangementWorkspace(options){
  const {root,project,buffers,state,scale,grid,selectedTrack,selectedClip,checkpoint,commit,notify,idFactory,render,selectTrack,selectClip,seek,playFrom}=options;
  normalizeArrangementLoop(project);
  const $=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
  const arrangement=$('.arrangement'),ruler=$('#ruler'),tools=$('.editor-tools'),lanes=all('.lane');
  const waves=[];
  let waveFrame=0;
  let disposeInteractions=()=>{};
  const paintWaves=()=>{
    waveFrame=0;
    if(!arrangement.isConnected)return;
    const bounds=arrangement.getBoundingClientRect(),left=bounds.left+arrangement.clientLeft,top=bounds.top+arrangement.clientTop;
    const viewport={left,right:left+arrangement.clientWidth,top,bottom:top+arrangement.clientHeight};
    const visible=waves.map(wave=>{
      const rect=wave.element.getBoundingClientRect();
      return{...wave,height:Math.max(1,rect.height-25),window:rect.bottom>viewport.top&&rect.top<viewport.bottom?clipViewportWindow(rect.left,rect.width,viewport.left,viewport.right):null};
    });
    for(const {canvas,buffer,track,clip,height,window}of visible){
      canvas.hidden=!window;
      if(!window){canvas.width=0;canvas.height=0;continue}
      canvas.style.left=`${window.offset}px`;canvas.style.width=`${window.width}px`;
      if(isInstrumentClip(clip))drawPattern(canvas,track,clip,window,height);else drawClipWave(canvas,buffer,clip,window,height);
    }
  };
  const queueWaves=()=>{if(!waveFrame)waveFrame=requestAnimationFrame(paintWaves)};
  arrangement.addEventListener('scroll',queueWaves,{passive:true});
  const waveResize=new ResizeObserver(()=>{if(arrangement.isConnected)queueWaves();else{waveResize.disconnect();disposeInteractions()}});
  waveResize.observe(arrangement);
  lanes.forEach(lane=>waveResize.observe(lane));
  document.querySelector('#loop')?.classList.toggle('active',Boolean(project.loop));
  if(state.projectId!==project.id){
    state.projectId=project.id;state.selection=null;state.clipboard=null;state.insertionBeat=0;
  }
  const mobile=matchMedia('(max-width:850px)').matches;
  if(state.mobile===undefined){state.browserOpen=!mobile;state.mixerOpen=!mobile}
  state.mobile=mobile;
  const trackGesture=(element,event,move,finish,cancel)=>{
    let cancelGesture;
    const clear=()=>{if(state.cancelClipPointer===cancelGesture)state.cancelClipPointer=null};
    cancelGesture=arrangementGesture(element,event,move,next=>{clear();finish(next)},()=>{clear();cancel?.()});
    if(cancelGesture)state.cancelClipPointer=cancelGesture;
    return cancelGesture;
  };
  const beatAt=clientX=>quantizeBeat(timelineBeatsAtClientX(clientX,ruler,arrangement,scale),grid());
  const activePointers=new Map();let pinch=null,pinchFrame=0;
  const pinchTargets=[ruler,...lanes];
  const clearPinchPreview=()=>{if(pinchFrame)cancelAnimationFrame(pinchFrame);pinchFrame=0;for(const element of pinchTargets){element.style.transform='';element.style.transformOrigin='';element.classList.remove('pinch-preview')}};
  const previewPinch=()=>{
    pinchFrame=0;if(!pinch)return;
    const points=[...activePointers.values()];if(points.length<2)return;
    const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),value=pinchZoomValue(pinch.startZoom,pinch.startDistance,distance);
    pinch.zoom=value;
    const factor=value/pinch.startZoom;
    for(const [index,element]of pinchTargets.entries()){
      element.style.transformOrigin=`${pinch.origins[index]}px 0`;
      element.style.transform=`scaleX(${factor})`;
      element.classList.add('pinch-preview');
    }
  };
  const onPointerDown=event=>{
    if(!mobile||event.pointerType!=='touch'||!arrangement.contains(event.target))return;
    activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(activePointers.size===2){
      const points=[...activePointers.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
      if(distance<24){activePointers.delete(event.pointerId);return}
      state.cancelClipPointer?.();state.cancelClipPointer=null;
      const anchorX=(points[0].x+points[1].x)/2;
      pinch={startZoom:options.zoom||1,startDistance:distance,anchorX,zoom:options.zoom||1,origins:pinchTargets.map(element=>anchorX-element.getBoundingClientRect().left)};
      event.preventDefault();event.stopPropagation();
    }
  };
  const onPointerMove=event=>{
    if(!activePointers.has(event.pointerId))return;
    activePointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch){event.preventDefault();if(!pinchFrame)pinchFrame=requestAnimationFrame(previewPinch)}
  };
  const finishPinch=(commitZoom)=>{
    if(!pinch)return;
    const {zoom:nextZoom,anchorX}=pinch;pinch=null;clearPinchPreview();activePointers.clear();
    if(commitZoom&&Math.abs(nextZoom-(options.zoom||1))>1e-4)options.setZoom?.(nextZoom,anchorX);
  };
  const onPointerUp=event=>{
    if(!activePointers.has(event.pointerId))return;
    if(pinch){finishPinch(true);return}
    activePointers.delete(event.pointerId);
  };
  const onPointerCancel=event=>{
    if(!activePointers.has(event.pointerId))return;
    if(pinch){finishPinch(false);return}
    activePointers.delete(event.pointerId);
  };
  arrangement.addEventListener('pointerdown',onPointerDown,true);
  const preventArrangementPinch=event=>{if(event.touches?.length>1)event.preventDefault()};
  const onGestureStart=event=>event.preventDefault();
  arrangement.addEventListener('touchstart',preventArrangementPinch,{capture:true,passive:false});
  arrangement.addEventListener('touchmove',preventArrangementPinch,{capture:true,passive:false});
  arrangement.addEventListener('gesturestart',onGestureStart,{passive:false});
  document.addEventListener('pointermove',onPointerMove,true);document.addEventListener('pointerup',onPointerUp,true);document.addEventListener('pointercancel',onPointerCancel,true);
  disposeInteractions=()=>{state.cancelClipPointer?.();state.cancelClipPointer=null;finishPinch(false);activePointers.clear();arrangement.removeEventListener('pointerdown',onPointerDown,true);arrangement.removeEventListener('touchstart',preventArrangementPinch,true);arrangement.removeEventListener('touchmove',preventArrangementPinch,true);arrangement.removeEventListener('gesturestart',onGestureStart);document.removeEventListener('pointermove',onPointerMove,true);document.removeEventListener('pointerup',onPointerUp,true);document.removeEventListener('pointercancel',onPointerCancel,true)};
  let maxBeat=Math.max(64,(project.loopEnd||4)*4,...project.tracks.flatMap(track=>(track.clips||[]).map(clip=>clip.bar*4+scale.secondsToBeats(clipDurationSeconds(clip,project.bpm))+16)));
  const width=Math.max(1200,scale.beatsToPixels(maxBeat));
  ruler.style.width=`${width}px`;lanes.forEach(lane=>lane.style.width=`${width}px`);
  ruler.replaceChildren();
  ruler.setAttribute('aria-label','Beat-time ruler');
  const appendTicks=(from,to)=>{for(let beat=from;beat<=to;beat++){
    const label=document.createElement('span');label.style.left=`${scale.beatsToPixels(beat)}px`;
    label.textContent=beat%4===0?String(beat/4+1):scale.pixelsPerBeat>=30?`${Math.floor(beat/4)+1}.${beat%4+1}`:'';
    label.className=beat%4===0?'bar-tick':'beat-tick';ruler.append(label);
  }};
  appendTicks(0,maxBeat);
  const ensureBeat=beat=>{
    if(beat<=maxBeat)return;
    const end=Math.ceil(beat/64)*64;
    appendTicks(Math.floor(maxBeat)+1,end);maxBeat=end;
    const width=scale.beatsToPixels(maxBeat);ruler.style.width=`${width}px`;lanes.forEach(lane=>lane.style.width=`${width}px`);
  };
  tools.insertAdjacentHTML('beforeend',`<button id="selectRange" aria-pressed="${state.selectMode}">Select Range</button><button id="editClips" aria-pressed="${Boolean(state.editMode)}">Edit Clips (touch)</button><button id="clearRange">Clear Range</button><button id="cutRange">Cut</button><button id="deleteRange">Delete Selection</button><button id="setLoopRange">Loop from Range</button><button id="selectLoopRange">Select Loop</button><button id="playInsertion">Play from Marker</button><button id="followPlayhead" aria-pressed="${state.follow}">Follow</button><button id="toggleBrowser" aria-expanded="${state.browserOpen}">Samples</button><button id="toggleMixer" aria-expanded="${state.mixerOpen}">Mixer</button><button id="toggleDevices" aria-expanded="${state.devicesOpen}">Devices</button>`);
  const clipToolbar=document.createElement('div');clipToolbar.className='mobile-clip-toolbar';
  clipToolbar.hidden=!selectedClip;
  clipToolbar.innerHTML=`<strong>Selected clip</strong><button type="button" data-clip-mode="move" aria-pressed="${state.clipMode==='move'}">Move</button><button type="button" data-clip-mode="trim" aria-pressed="${state.clipMode==='trim'}">Trim</button><button type="button" data-clip-action="duplicate">Duplicate</button><button type="button" data-clip-action="delete">Delete</button>`;
  tools.after(clipToolbar);
  clipToolbar.querySelectorAll('[data-clip-mode]').forEach(button=>button.onclick=()=>{
    state.clipMode=state.clipMode===button.dataset.clipMode?null:button.dataset.clipMode;render();
  });
  clipToolbar.querySelector('[data-clip-action="duplicate"]').onclick=()=>options.duplicateClip();
  clipToolbar.querySelector('[data-clip-action="delete"]').onclick=()=>options.deleteClip();
  const selectionToolbar=document.createElement('div');selectionToolbar.className='range-toolbar';
  selectionToolbar.innerHTML='<output id="rangeSummary" aria-live="polite">No time range</output><label>Start beat <input id="rangeStart" type="number" min="0" step="any"></label><label>End beat <input id="rangeEnd" type="number" min="0" step="any"></label><label>First track <select id="rangeFirstTrack"></select></label><label>Last track <select id="rangeLastTrack"></select></label><div class="section-actions"><button id="copySection">Copy section</button><button id="duplicateSection">Duplicate section</button><label>Paste at beat <input id="sectionPasteBeat" type="number" min="0" step="any"></label><button id="pasteSection">Paste section here</button></div>';
  for(const id of ['rangeFirstTrack','rangeLastTrack'])for(const [index,track]of project.tracks.entries()){
    const option=document.createElement('option');option.value=String(index);option.textContent=`${index+1}: ${track.name}`;selectionToolbar.querySelector(`#${id}`).append(option);
  }
  tools.after(selectionToolbar);
  const insertion=document.createElement('i');insertion.className='insertion-marker';ruler.append(insertion);
  const showInsertion=()=>insertion.style.left=`${scale.beatsToPixels(state.insertionBeat)}px`;
  showInsertion();
  const loop=document.createElement('div');loop.className='arrangement-loop';
  loop.innerHTML='<button data-loop-edge="start" aria-label="Loop start">[</button><span>Loop</span><button data-loop-edge="end" aria-label="Loop end">]</button>';ruler.append(loop);
  const loopState=()=>({start:(project.loopStart||0)*4,end:(project.loopEnd||4)*4});
  const paintLoop=value=>{
    loop.style.left=`${scale.beatsToPixels(value.start)}px`;loop.style.width=`${scale.beatsToPixels(value.end-value.start)}px`;
    loop.classList.toggle('loop-enabled',Boolean(project.loop));loop.title=`Loop ${value.start} - ${value.end} beats`;
  };
  paintLoop(loopState());
  const selectAt=event=>lanes.findIndex(lane=>{const rect=lane.getBoundingClientRect();return event.clientY>=rect.top&&event.clientY<rect.bottom});
  const paintSelection=()=>{
    all('.time-range').forEach(element=>element.remove());
    const range=state.selection;
    if(range){
      range.firstTrack=Math.min(range.firstTrack,Math.max(0,project.tracks.length-1));range.lastTrack=Math.min(range.lastTrack,Math.max(0,project.tracks.length-1));
      range.intersections=copyTimeRange(project.tracks,range,project.bpm).entries.map(entry=>({clipId:entry.clip.id,track:range.firstTrack+entry.trackOffset,startBeat:range.startBeat+entry.relativeBeat,endBeat:range.startBeat+entry.relativeBeat+scale.secondsToBeats(clipDurationSeconds(entry.clip,project.bpm))}));
    }
    $('#rangeSummary').textContent=range?`Beats ${range.startBeat.toFixed(3)} - ${range.endBeat.toFixed(3)} | Tracks ${range.firstTrack+1} - ${range.lastTrack+1}`:'No time range';
    $('#rangeStart').value=range?.startBeat??'';$('#rangeEnd').value=range?.endBeat??'';
    $('#rangeFirstTrack').value=String(range?.firstTrack??selectedTrack);$('#rangeLastTrack').value=String(range?.lastTrack??selectedTrack);
    $('#sectionPasteBeat').value=String(state.insertionBeat);
    $('#pasteSection').disabled=!state.clipboard;
    syncArrangementActions(root,project.tracks[selectedTrack],project.tracks[selectedTrack]?.clips.find(clip=>clip.id===selectedClip),range);
    if(!range)return;
    for(let index=range.firstTrack;index<=range.lastTrack;index++){
      const lane=lanes[index];if(!lane)continue;
      const overlay=document.createElement('div');overlay.className='time-range';
      overlay.style.left=`${scale.beatsToPixels(range.startBeat)}px`;overlay.style.width=`${scale.beatsToPixels(range.endBeat-range.startBeat)}px`;
      for(const edge of ['start','end']){
        const handle=document.createElement('button');handle.type='button';handle.className=`range-edge range-edge-${edge}`;handle.setAttribute('aria-label',`Selection ${edge}`);handle.title=`Drag selection ${edge}; exact beats are above the timeline`;
        handle.onkeydown=event=>{
          if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
          event.preventDefault();event.stopPropagation();
          const range=state.selection,key=edge==='start'?'startBeat':'endBeat',beat=quantizeBeat(range[key]+(event.key==='ArrowRight'?1:-1)*(grid()||.25),grid());
          state.selection=normalizeTimeSelection(edge==='start'?beat:range.startBeat,edge==='end'?beat:range.endBeat,range.firstTrack,range.lastTrack);paintSelection();lane.querySelector(`.range-edge-${edge}`)?.focus({preventScroll:true});
        };
        handle.onpointerdown=event=>{
          const original={...state.selection};let draft={...original};
          trackGesture(handle,event,next=>{
            const beat=beatAt(next.clientX);draft=normalizeTimeSelection(edge==='start'?beat:original.startBeat,edge==='end'?beat:original.endBeat,original.firstTrack,original.lastTrack);
            for(const item of all('.time-range')){item.style.left=`${scale.beatsToPixels(draft.startBeat)}px`;item.style.width=`${scale.beatsToPixels(draft.endBeat-draft.startBeat)}px`}
          },()=>{state.selection=draft;paintSelection()},()=>paintSelection());
        };
        overlay.append(handle);
      }
      lane.append(overlay);
    }
  };
  paintSelection();
  const hasRange=()=>state.selection&&state.selection.endBeat>state.selection.startBeat;
  const validateRange=()=>{
    if(!hasRange()){notify('Select a time range first.');return false}
    return true;
  };
  const copy=()=>{
    if(!hasRange()){state.clipboard=null;return options.copyClip()}
    if(!validateRange())return false;
    state.clipboard=copyTimeRange(project.tracks,state.selection,project.bpm);paintSelection();notify('Range copied, including patterns, track spacing and gaps.');return true;
  };
  const remove=()=>{
    if(!hasRange())return options.deleteClip();
    if(!validateRange())return;
    checkpoint();deleteTimeRange(project.tracks,state.selection,project.bpm,idFactory);commit();
  };
  const paste=(at=state.insertionBeat,firstTrack=selectedTrack,clipboard=state.clipboard)=>{
    if(!clipboard)return options.pasteClip();
    try{
      if(firstTrack+clipboard.trackCount>project.tracks.length)throw new Error('Add enough destination tracks before pasting this range.');
      pasteTimeRange(project.tracks,clipboard,at,firstTrack,idFactory,true);
      checkpoint();pasteTimeRange(project.tracks,clipboard,at,firstTrack,idFactory);
      state.selection=normalizeTimeSelection(at,at+clipboard.durationBeats,firstTrack,firstTrack+clipboard.trackCount-1);commit();
    }catch(error){notify(error.message)}
  };
  const duplicate=()=>{
    if(!hasRange())return options.duplicateClip();
    if(!validateRange())return;
    const range=state.selection,clipboard=copyTimeRange(project.tracks,range,project.bpm);
    paste(range.endBeat,range.firstTrack,clipboard);
  };
  const cut=()=>{if(!hasRange()){if(selectedClip){state.clipboard=null;options.copyClip();options.deleteClip()}else notify('Select a clip or time range to cut.');return}if(copy())remove()};
  const loopFromRange=()=>{
    if(!hasRange()){notify('Select a time range to set the loop.');return}
    checkpoint();project.loopStart=state.selection.startBeat/4;project.loopEnd=state.selection.endBeat/4;project.loop=true;
    document.querySelector('#loop')?.classList.add('active');commit();
  };
  $('#copyClip').onclick=copy;$('#pasteClip').onclick=()=>paste();$('#duplicateClip').onclick=duplicate;$('#cutRange').onclick=cut;$('#deleteRange').onclick=remove;
  $('#copySection').onclick=copy;$('#duplicateSection').onclick=duplicate;
  $('#sectionPasteBeat').onchange=event=>{
    const value=event.target.valueAsNumber;
    if(!Number.isFinite(value)||value<0){notify('Paste position must be a non-negative beat.');event.target.value=String(state.insertionBeat);return}
    state.insertionBeat=quantizeBeat(value,grid());event.target.value=String(state.insertionBeat);ensureBeat(state.insertionBeat+4);showInsertion();
  };
  $('#pasteSection').onclick=()=>paste(state.insertionBeat,state.selection?.firstTrack??selectedTrack);
  for(const [id,key]of [['rangeFirstTrack','firstTrack'],['rangeLastTrack','lastTrack']])$(`#${id}`).onchange=event=>{
    if(!hasRange())return;
    const range={...state.selection,[key]:Number(event.target.value)};
    state.selection=normalizeTimeSelection(range.startBeat,range.endBeat,range.firstTrack,range.lastTrack);paintSelection();
  };
  const pan=document.createElement('button');pan.id='scrollArrangement';pan.textContent='Scroll / select';pan.setAttribute('aria-pressed',String(!state.selectMode&&!state.editMode));
  pan.onclick=()=>{state.selectMode=false;state.editMode=false;render()};$('#selectRange').before(pan);
  $('#selectRange').onclick=()=>{state.selectMode=!state.selectMode;state.editMode=false;render()};
  $('#editClips').onclick=()=>{state.editMode=!state.editMode;state.selectMode=false;render()};
  $('#clearRange').onclick=()=>{state.selection=null;paintSelection()};
  $('#setLoopRange').onclick=loopFromRange;
  $('#selectLoopRange').onclick=()=>{state.selection=normalizeTimeSelection(loopState().start,loopState().end,0,Math.max(0,project.tracks.length-1));paintSelection()};
  $('#playInsertion').onclick=()=>playFrom(state.insertionBeat);
  $('#followPlayhead').onclick=()=>{state.follow=!state.follow;render()};
  for(const [id,key,selector]of [['toggleBrowser','browserOpen','.browser'],['toggleMixer','mixerOpen','.right-mixer'],['toggleDevices','devicesOpen','.bottom-panel']]){
    $( `#${id}`).onclick=()=>{state[key]=!state[key];render()};
    all(selector).forEach(element=>element.hidden=!state[key]);
  }
  for(const [id,key]of [['rangeStart','startBeat'],['rangeEnd','endBeat']])$(`#${id}`).onchange=event=>{
    if(!hasRange())return notify('Create a range before adjusting its boundaries.');
    const value=event.target.valueAsNumber;
    if(!Number.isFinite(value)||value<0){notify('Range boundaries must be non-negative beats.');event.target.value=String(state.selection[key]);return}
    const range={...state.selection,[key]:quantizeBeat(value,grid())};
    state.selection=normalizeTimeSelection(range.startBeat,range.endBeat,range.firstTrack,range.lastTrack);paintSelection();
  };
  const seekGesture=(element,event)=>{
    if(event.button!==0||event.isPrimary===false)return;
    const original=state.insertionBeat;
    let beat=beatAt(event.clientX);state.insertionBeat=beat;showInsertion();
    trackGesture(element,event,next=>{beat=beatAt(next.clientX);state.insertionBeat=beat;showInsertion()},()=>{seek(scale.beatsToSeconds(beat));paintSelection()},()=>{state.insertionBeat=original;showInsertion()});
  };
  ruler.onpointerdown=event=>{if(!event.target.closest('.arrangement-loop'))seekGesture(ruler,event)};
  $('#playhead').onpointerdown=event=>seekGesture($('#playhead'),event);
  loop.onpointerdown=event=>{
    const original=loopState(),edge=event.target.closest('[data-loop-edge]')?.dataset.loopEdge||'move',offset=timelineBeatsAtClientX(event.clientX,ruler,arrangement,scale)-(edge==='end'?original.end:original.start);
    let draft=original;
    trackGesture(loop,event,next=>{draft=editLoopRegion(original,edge,timelineBeatsAtClientX(next.clientX,ruler,arrangement,scale)-offset,grid());paintLoop(draft)},()=>{
      checkpoint();project.loopStart=draft.start/4;project.loopEnd=draft.end/4;commit();
    },()=>paintLoop(original));
  };
  arrangement.classList.toggle('range-mode',state.selectMode);
  arrangement.classList.toggle('clip-edit-mode',Boolean(state.editMode));
  arrangement.classList.toggle('mobile-move-mode',mobile&&state.clipMode==='move');
  arrangement.classList.toggle('mobile-clip-trim-mode',mobile&&state.clipMode==='trim');
  arrangement.addEventListener('click',event=>{if(state.selectMode&&event.target.closest('.sampler-block')){event.preventDefault();event.stopImmediatePropagation()}},true);
  lanes.forEach((lane,index)=>lane.onpointerdown=event=>{
    if(event.button!==0||event.isPrimary===false)return;
    if(event.target.closest('.range-edge'))return;
    if(!state.selectMode&&!event.shiftKey){
      if(event.target!==lane)return;
      if(event.pointerType==='touch')return;
    }
    const anchor=event.shiftKey&&state.selection?{beat:state.selection.startBeat,track:state.selection.firstTrack}:{beat:beatAt(event.clientX),track:index};
    const original=state.selection?structuredClone(state.selection):null;
    let moved=false;
    trackGesture(lane,event,next=>{
      moved ||= Math.abs(next.clientX-event.clientX)>3||Math.abs(next.clientY-event.clientY)>3;
      const target=selectAt(next);state.selection=normalizeTimeSelection(anchor.beat,beatAt(next.clientX),anchor.track,target<0?index:target);paintSelection();
    },()=>{if(!moved){state.selection=null;state.insertionBeat=beatAt(event.clientX);showInsertion();seek(scale.beatsToSeconds(state.insertionBeat))}paintSelection()},()=>{state.selection=original;paintSelection()});
  });
  all('[data-clip]').forEach(element=>{
    const index=Number(element.dataset.trackIndex),clip=project.tracks[index].clips.find(item=>item.id===element.dataset.clip);
    element.draggable=false;element.onclick=null;element.ondragstart=null;
    element.classList.toggle('clip-selected',clip.id===selectedClip);
    const buffer=buffers.get(clip.asset);let wave;
    if(buffer||isInstrumentClip(clip)){
      const canvas=document.createElement('canvas');canvas.className='clip-waveform';canvas.setAttribute('aria-hidden','true');element.prepend(canvas);
      wave={element,canvas,buffer,clip,track:project.tracks[index]};waves.push(wave);
    }
    const selectTappedClip=()=>{
      const now=performance.now(),last=state.lastTap;state.lastTap={id:clip.id,time:now};
      state.selection=null;state.clipMode=null;
      if(last?.id===clip.id&&now-last.time<450)options.openClipEditor?.(clip.id,index);
      else selectClip(clip.id,index);
    };
    const startClipEdit=(event,edge)=>{
      if(edge&&!buffer&&!isInstrumentClip(clip))return notify('Load the clip source before trimming.');
      const original={...clip},grabOffset=timelineBeatsAtClientX(event.clientX,ruler,arrangement,scale)-clip.bar*4;
      const edgeOffset=edge==='end'?grabOffset-scale.secondsToBeats(clipDurationSeconds(clip,project.bpm)):grabOffset;
      let draft={...original},targetIndex=index,moved=false;
      const bounds=element.getBoundingClientRect(),pointerOffsetX=event.clientX-bounds.left,pointerOffsetY=event.clientY-bounds.top;
      let dragPreview=null;
      trackGesture(element,event,next=>{
        const wasMoved=moved;
        moved ||= Math.abs(next.clientX-event.clientX)>3||Math.abs(next.clientY-event.clientY)>3;
        if(moved&&!wasMoved){options.activateClip?.(clip.id,index);state.selection=null}
        if(!moved)return;
        draft={...original};
        if(edge)resizeClipAtBeat(draft,edge,quantizeBeat(timelineBeatsAtClientX(next.clientX,ruler,arrangement,scale)-edgeOffset,grid()),buffer?.duration||0,project.bpm,patternForClip(project.tracks[index],clip));
        else{
          draft.bar=draggedClipStart(timelineBeatsAtClientX(next.clientX,ruler,arrangement,scale),grabOffset,grid())/4;
          const nextTrack=selectAt(next);targetIndex=nextTrack<0?index:nextTrack;
          if(!dragPreview){
            dragPreview=element.cloneNode(true);
            dragPreview.removeAttribute('data-clip');dragPreview.classList.add('clip-drag-preview');
            dragPreview.setAttribute('aria-hidden','true');dragPreview.querySelectorAll('button').forEach(button=>button.remove());
            const sourceCanvas=element.querySelector('canvas'),previewCanvas=dragPreview.querySelector('canvas');
            if(sourceCanvas&&previewCanvas){previewCanvas.width=sourceCanvas.width;previewCanvas.height=sourceCanvas.height;previewCanvas.getContext('2d')?.drawImage(sourceCanvas,0,0)}
            dragPreview.style.height=`${bounds.height}px`;
            document.body.append(dragPreview);element.classList.add('clip-move-active');
          }
          dragPreview.style.left=`${next.clientX-pointerOffsetX}px`;
          dragPreview.style.top=`${next.clientY-pointerOffsetY}px`;
          dragPreview.style.width=`${scale.timeToPixels(clipDurationSeconds(draft,project.bpm))}px`;
          lanes.forEach((lane,laneIndex)=>lane.parentElement.classList.toggle('clip-drop-target',laneIndex===targetIndex));
        }
        if(edge){
          element.style.left=`${scale.barsToPixels(draft.bar)}px`;
          element.style.width=`${scale.timeToPixels(clipDurationSeconds(draft,project.bpm))}px`;
        }
        if(wave){wave.clip=draft;queueWaves()}
      },()=>{
        element.classList.remove('clip-move-active');dragPreview?.remove();
        lanes.forEach(lane=>lane.parentElement.classList.remove('clip-drop-target'));
        if(!moved){selectTappedClip();return}
        try{assertClipDestination(clip,instrumentType(project.tracks[index]),project.tracks[targetIndex]);checkpoint();moveClipTo(project.tracks,clip.id,project.tracks[targetIndex].id,draft.bar);if(edge&&isInstrumentClip(clip))delete clip.legacyTail;Object.assign(clip,draft);state.selection=null;state.clipMode=null;commit()}catch(error){notify(error.message);render()}
      },()=>{
        element.classList.remove('clip-move-active');dragPreview?.remove();
        lanes.forEach(lane=>lane.parentElement.classList.remove('clip-drop-target'));
        element.style.left=`${scale.barsToPixels(original.bar)}px`;element.style.width=`${scale.timeToPixels(clipDurationSeconds(original,project.bpm))}px`;element.style.transform='';
        if(wave){wave.clip=clip;queueWaves()}
      });
    };
    element.onpointerdown=event=>{
      if(event.button!==0||event.isPrimary===false)return;
      if(state.selectMode||event.shiftKey)return;
      const handle=event.target.closest('[data-resize]'),edge=handle?.dataset.resize;
      if(mobile&&event.pointerType==='touch'){
        const selected=selectedClip===clip.id,explicitMode=state.clipMode;
        if(state.editMode){startClipEdit(event,edge);return}
        if(explicitMode==='move'){startClipEdit(event,null);return}
        if(edge){
          if(!selected&&!state.editMode)return;
          startClipEdit(event,edge);return;
        }
        if(explicitMode==='trim')return;
        let cancelled=false,moved=false;
        const pointerId=event.pointerId,startX=event.clientX,startY=event.clientY;
        const clear=()=>{
          clearTimeout(timer);document.removeEventListener('pointermove',onMove,true);document.removeEventListener('pointerup',onUp,true);document.removeEventListener('pointercancel',onCancel,true);
          element.classList.remove('clip-move-active');if(state.cancelClipPointer===cancelPending)state.cancelClipPointer=null;
        };
        const cancelPending=()=>{cancelled=true;clear()};
        const onMove=next=>{
          if(next.pointerId!==pointerId||cancelled)return;
          if(!moved&&Math.hypot(next.clientX-startX,next.clientY-startY)>10){moved=true;cancelPending()}
        };
        const onUp=next=>{if(next.pointerId!==pointerId||cancelled)return;clear();if(!moved&&Math.hypot(next.clientX-startX,next.clientY-startY)<=10)selectTappedClip()};
        const onCancel=next=>{if(next.pointerId===pointerId)cancelPending()};
        const timer=setTimeout(()=>{
          if(cancelled)return;
          clear();element.classList.add('clip-move-active');startClipEdit(event,null);
        },350);
        state.cancelClipPointer=cancelPending;
        document.addEventListener('pointermove',onMove,true);document.addEventListener('pointerup',onUp,true);document.addEventListener('pointercancel',onCancel,true);
        return;
      }
      if(edge&&!buffer&&!isInstrumentClip(clip))return notify('Load the clip source before trimming.');
      startClipEdit(event,edge);
    };
    element.querySelectorAll('[data-resize]').forEach(handle=>handle.onpointerdown=null);
  });
  // Keep the mixer in the same scroll row as its lane, not in a second scroller.
  const strips=all('.mixer-strip:not(.master-strip)'),actionsByTrack=all('.track-label .track-actions');
  strips.forEach((strip,index)=>{
    strip.classList.add('right-mixer');strip.classList.toggle('track-selected',index===selectedTrack);strip.dataset.mixerTrack=String(index);strip.dataset.mobileEditorId=project.tracks[index].id;
    strip.hidden=!state.mixerOpen;strip.onclick=event=>{if(!event.target.closest('input,button'))selectTrack(index)};
    for(const input of strip.querySelectorAll('input'))input.setAttribute('aria-label',`${project.tracks[index].name} ${input.hasAttribute('data-vol')?'volume':'pan'}`);
    const actions=actionsByTrack[index];strip.append(actions.cloneNode(true));
    for(const button of strip.querySelectorAll('button')){
      const selector=button.hasAttribute('data-mute')?'data-mute':button.hasAttribute('data-solo')?'data-solo':button.hasAttribute('data-fx')?'data-fx':button.hasAttribute('data-track-settings')?'data-track-settings':'data-remove';
      const source=actions.querySelector(`[${selector}]`);button.onclick=event=>{event.stopPropagation();source?.click()};
    }
    lanes[index].parentElement.append(strip);
  });
  const bottom=$('.bottom-panel');bottom.hidden=!state.devicesOpen;
  bottom.querySelector('.pane-head').firstChild.textContent='DEVICES & CLIP EDITOR ';
  if(project.tracks[selectedTrack]?.sampler||project.tracks[selectedTrack]?.drumRack){
    const instrument=document.createElement('button');instrument.className='selected-instrument';instrument.textContent=project.tracks[selectedTrack].drumRack?'Drum Rack Setup (pads & samples)':'Sampler Setup (sample & keys)';
    instrument.onclick=()=>{state.selectMode=false;options.openClip(selectedClip,selectedTrack)};$('.device-panel').prepend(instrument);
  }
  paintWaves();
  return{ensureBeat,handleKey(event){
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(mod&&key==='l'){event.preventDefault();loopFromRange();return true}
    if(mod&&key==='x'){event.preventDefault();cut();return true}
    if(mod&&key==='v'&&state.clipboard){event.preventDefault();paste();return true}
    if(!hasRange())return false;
    const action=mod&&key==='c'?copy:mod&&key==='d'?duplicate:!mod&&(key==='delete'||key==='backspace')?remove:null;
    if(!action)return false;event.preventDefault();action();return true;
  }};
}
