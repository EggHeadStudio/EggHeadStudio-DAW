import {clipDurationSeconds} from './audio.js';
import {copyTimeRange,deleteTimeRange,moveClipTo,normalizeTimeSelection,pasteTimeRange,resizeClipAtBeat} from './arrangement.js';
import {clipViewportWindow,draggedClipStart,editLoopRegion,quantizeBeat,timelineBeatsAtClientX} from './timeline.js';
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

function gesture(element,event,move,finish,cancel){
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  const pointerId=event.pointerId;
  element.setPointerCapture(pointerId);
  const onMove=next=>{if(next.pointerId===pointerId)move(next)};
  const end=(next,aborted)=>{
    if(next.pointerId!==pointerId)return;
    element.removeEventListener('pointermove',onMove);element.removeEventListener('pointerup',onUp);element.removeEventListener('pointercancel',onCancel);
    if(element.hasPointerCapture(pointerId))element.releasePointerCapture(pointerId);
    if(aborted)cancel?.();else finish(next);
  };
  const onUp=next=>end(next,false),onCancel=next=>end(next,true);
  element.addEventListener('pointermove',onMove);element.addEventListener('pointerup',onUp);element.addEventListener('pointercancel',onCancel);
}

export function mountArrangementWorkspace(options){
  const {root,project,buffers,state,scale,grid,selectedTrack,selectedClip,checkpoint,commit,notify,idFactory,render,selectTrack,selectClip,seek,playFrom}=options;
  normalizeArrangementLoop(project);
  const $=selector=>root.querySelector(selector),all=selector=>[...root.querySelectorAll(selector)];
  const arrangement=$('.arrangement'),ruler=$('#ruler'),tools=$('.editor-tools'),lanes=all('.lane');
  const waves=[];
  let waveFrame=0;
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
  const waveResize=new ResizeObserver(()=>{if(arrangement.isConnected)queueWaves();else waveResize.disconnect()});
  waveResize.observe(arrangement);
  lanes.forEach(lane=>waveResize.observe(lane));
  document.querySelector('#loop')?.classList.toggle('active',Boolean(project.loop));
  if(state.projectId!==project.id){
    state.projectId=project.id;state.selection=null;state.clipboard=null;state.insertionBeat=0;
  }
  const mobile=matchMedia('(max-width:850px)').matches;
  if(state.mobile===undefined){state.browserOpen=!mobile;state.mixerOpen=!mobile}
  state.mobile=mobile;
  const beatAt=clientX=>quantizeBeat(timelineBeatsAtClientX(clientX,ruler,arrangement,scale),grid());
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
  const selectionToolbar=document.createElement('div');selectionToolbar.className='range-toolbar';
  selectionToolbar.innerHTML='<output id="rangeSummary" aria-live="polite">No time range</output><label>Start beat <input id="rangeStart" type="number" min="0" step="any"></label><label>End beat <input id="rangeEnd" type="number" min="0" step="any"></label>';
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
      range.intersections=copyTimeRange(project.tracks,range,project.bpm).entries.map(entry=>({clipId:entry.clip.id,track:range.firstTrack+entry.trackOffset,startBeat:range.startBeat+entry.relativeBeat,endBeat:range.startBeat+entry.relativeBeat+scale.secondsToBeats(clipDurationSeconds(entry.clip))}));
    }
    $('#rangeSummary').textContent=range?`Beats ${range.startBeat.toFixed(3)} - ${range.endBeat.toFixed(3)} | Tracks ${range.firstTrack+1} - ${range.lastTrack+1}`:'No time range';
    $('#rangeStart').value=range?.startBeat??'';$('#rangeEnd').value=range?.endBeat??'';
    syncArrangementActions(root,project.tracks[selectedTrack],project.tracks[selectedTrack]?.clips.find(clip=>clip.id===selectedClip),range);
    if(!range)return;
    for(let index=range.firstTrack;index<=range.lastTrack;index++){
      const lane=lanes[index];if(!lane)continue;
      const overlay=document.createElement('div');overlay.className='time-range';
      overlay.style.left=`${scale.beatsToPixels(range.startBeat)}px`;overlay.style.width=`${scale.beatsToPixels(range.endBeat-range.startBeat)}px`;
      for(const edge of ['start','end']){
        const handle=document.createElement('i');handle.className=`range-edge range-edge-${edge}`;handle.setAttribute('aria-label',`Selection ${edge}`);
        handle.onpointerdown=event=>{
          const original={...state.selection};let draft={...original};
          gesture(handle,event,next=>{
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
    state.clipboard=copyTimeRange(project.tracks,state.selection,project.bpm);notify('Range copied, including patterns, track spacing and gaps.');return true;
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
  $('#selectRange').onclick=()=>{state.selectMode=!state.selectMode;render()};
  $('#editClips').onclick=()=>{state.editMode=!state.editMode;render()};
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
    const value=Number(event.target.value);
    if(!Number.isFinite(value)||value<0)return notify('Range boundaries must be non-negative beats.');
    const range={...state.selection,[key]:quantizeBeat(value,grid())};
    state.selection=normalizeTimeSelection(range.startBeat,range.endBeat,range.firstTrack,range.lastTrack);paintSelection();
  };
  const seekGesture=(element,event)=>{
    let beat=beatAt(event.clientX);state.insertionBeat=beat;showInsertion();
    gesture(element,event,next=>{beat=beatAt(next.clientX);state.insertionBeat=beat;showInsertion()},()=>seek(scale.beatsToSeconds(beat)),()=>render());
  };
  ruler.onpointerdown=event=>{if(!event.target.closest('.arrangement-loop'))seekGesture(ruler,event)};
  $('#playhead').onpointerdown=event=>seekGesture($('#playhead'),event);
  loop.onpointerdown=event=>{
    const original=loopState(),edge=event.target.closest('[data-loop-edge]')?.dataset.loopEdge||'move',offset=timelineBeatsAtClientX(event.clientX,ruler,arrangement,scale)-(edge==='end'?original.end:original.start);
    let draft=original;
    gesture(loop,event,next=>{draft=editLoopRegion(original,edge,timelineBeatsAtClientX(next.clientX,ruler,arrangement,scale)-offset,grid());paintLoop(draft)},()=>{
      checkpoint();project.loopStart=draft.start/4;project.loopEnd=draft.end/4;commit();
    },()=>paintLoop(original));
  };
  arrangement.classList.toggle('range-mode',state.selectMode);
  arrangement.classList.toggle('clip-edit-mode',Boolean(state.editMode));
  arrangement.addEventListener('click',event=>{if(state.selectMode&&event.target.closest('.sampler-block')){event.preventDefault();event.stopImmediatePropagation()}},true);
  lanes.forEach((lane,index)=>lane.onpointerdown=event=>{
    if(event.target.closest('.range-edge'))return;
    if(!state.selectMode&&!event.shiftKey){
      if(event.target!==lane)return;
      if(event.pointerType==='touch')return;
    }
    const anchor=event.shiftKey&&state.selection?{beat:state.selection.startBeat,track:state.selection.firstTrack}:{beat:beatAt(event.clientX),track:index};
    let moved=false;
    gesture(lane,event,next=>{
      moved ||= Math.abs(next.clientX-event.clientX)>3||Math.abs(next.clientY-event.clientY)>3;
      const target=selectAt(next);state.selection=normalizeTimeSelection(anchor.beat,beatAt(next.clientX),anchor.track,target<0?index:target);paintSelection();
    },()=>{if(!moved){state.selection=null;state.insertionBeat=beatAt(event.clientX);showInsertion();seek(scale.beatsToSeconds(state.insertionBeat))}paintSelection()},()=>{state.selection=null;paintSelection()});
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
    element.onpointerdown=event=>{
      if(state.selectMode||event.shiftKey)return;
      if(event.pointerType==='touch'&&!state.editMode&&!event.target.closest('[data-resize]')){
        const clear=()=>{element.onpointerup=null;element.onpointercancel=null};
        element.onpointercancel=clear;
        element.onpointerup=next=>{
          clear();
          if(Math.abs(next.clientX-event.clientX)>6||Math.abs(next.clientY-event.clientY)>6)return;
          const now=performance.now(),last=state.lastTap;state.lastTap={id:clip.id,time:now};
          if(isInstrumentClip(clip)&&last?.id===clip.id&&now-last.time<450)options.openClip(clip.id,index);else selectClip(clip.id,index);
        };
        return;
      }
      const handle=event.target.closest('[data-resize]'),edge=handle?.dataset.resize;
      if(edge&&!buffer&&!isInstrumentClip(clip))return notify('Load the clip source before trimming.');
      const original={...clip},grabOffset=timelineBeatsAtClientX(event.clientX,ruler,arrangement,scale)-clip.bar*4;
      const edgeOffset=edge==='end'?grabOffset-scale.secondsToBeats(clipDurationSeconds(clip,project.bpm)):grabOffset;
      let draft={...original},targetIndex=index,moved=false;
      gesture(element,event,next=>{
        moved ||= Math.abs(next.clientX-event.clientX)>3||Math.abs(next.clientY-event.clientY)>3;
        if(!moved)return;
        draft={...original};
        if(edge)resizeClipAtBeat(draft,edge,quantizeBeat(timelineBeatsAtClientX(next.clientX,ruler,arrangement,scale)-edgeOffset,grid()),buffer?.duration||0,project.bpm,patternForClip(project.tracks[index],clip));
        else{
          draft.bar=draggedClipStart(timelineBeatsAtClientX(next.clientX,ruler,arrangement,scale),grabOffset,grid())/4;
          const nextTrack=selectAt(next);targetIndex=nextTrack<0?index:nextTrack;
        }
        element.style.left=`${scale.barsToPixels(draft.bar)}px`;element.style.width=`${scale.timeToPixels(clipDurationSeconds(draft,project.bpm))}px`;
        element.style.transform=`translateY(${lanes[targetIndex].getBoundingClientRect().top-laneTop(index)}px)`;
        if(wave){wave.clip=draft;queueWaves()}
      },()=>{
        if(!moved){
          const now=performance.now(),last=state.lastTap;state.lastTap={id:clip.id,time:now};state.selection=null;
          if(isInstrumentClip(clip)&&last?.id===clip.id&&now-last.time<450)options.openClip(clip.id,index);else selectClip(clip.id,index);return;
        }
        try{assertClipDestination(clip,instrumentType(project.tracks[index]),project.tracks[targetIndex]);checkpoint();moveClipTo(project.tracks,clip.id,project.tracks[targetIndex].id,draft.bar);if(edge&&isInstrumentClip(clip))delete clip.legacyTail;Object.assign(clip,draft);state.selection=null;commit()}catch(error){notify(error.message);render()}
      },render);
    };
    element.querySelectorAll('[data-resize]').forEach(handle=>handle.onpointerdown=null);
  });
  const laneTop=index=>lanes[index].getBoundingClientRect().top;
  // Keep the mixer in the same scroll row as its lane, not in a second scroller.
  const strips=all('.mixer-strip:not(.master-strip)'),actionsByTrack=all('.track-label .track-actions');
  strips.forEach((strip,index)=>{
    strip.classList.add('right-mixer');strip.classList.toggle('track-selected',index===selectedTrack);strip.dataset.mixerTrack=String(index);
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
  if(state.deviceHeight)bottom.style.height=`${state.deviceHeight}px`;
  bottom.addEventListener('pointerup',()=>state.deviceHeight=bottom.getBoundingClientRect().height);
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
