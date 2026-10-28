import {detectPitch,noteName,snapBeats} from './music.js';
import {enhanceParameter} from './ui-controls.js';
import {PianoNoteEditor} from './piano-model.js';
import {pianoBeatAtClientX} from './timeline.js';
import {assignSamplerSource,bindSampleDrop,showSamplePicker} from './instrument-source.js';
import {BASE_ROW_HEIGHT,KEY_WIDTH,PITCH_HIGH,PITCH_LOW,RULER_HEIGHT,VELOCITY_LANE_HEIGHT,applyVelocityDrag,gridHeight,isBlackKey,keyboardKeys,midiAtY,rowTop,velocityAtY,velocityBarHeight} from './piano-layout.js';

const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pianoZoom = 1;
let rowZoom = 1;
// Highest pitch visible at the top edge, so reopening or zooming keeps the same pitch range in view.
let topPitch = 76;
let highlightedPitch = null;
let velocityOpen = true;
const editors = new Map();
let activePianoRoot = null;
let activeSecondsPerBeat = .5;
let originalEngineTick = null;
let activePosition=seconds=>seconds;
const cursorTick = seconds => {
  originalEngineTick?.(seconds);
  const world=activePianoRoot?.querySelector('#pianoWorld');
  const cursor=activePianoRoot?.querySelector('#pianoCursor');
  if(world&&cursor)cursor.style.left=`${KEY_WIDTH+activePosition(seconds)/activeSecondsPerBeat*parseFloat(world.style.getPropertyValue('--beat-width'))}px`;
};
function attachCursor(engine,root,secondsPerBeat,position){
  activePianoRoot=root;
  activeSecondsPerBeat=secondsPerBeat;
  activePosition=position;
  if(engine.onTick!==cursorTick){originalEngineTick=engine.onTick;engine.onTick=cursorTick}
}
function editorFor(track) {
  const notes = track.pattern?.notes || [];
  const key=track.pattern?.id||track.id;
  let editor = editors.get(key);
  if (!editor || editor.notes !== notes) {
    editor = new PianoNoteEditor(notes);
    editors.set(key, editor);
  }
  return editor;
}

function pianoMarkup(track, grid, editor) {
  const patternBeats=track.pattern?.lengthBeats||64;
  const displayStep = grid || .0625;
  const beatWidth = 40 * pianoZoom;
  const rowHeight = BASE_ROW_HEIGHT * rowZoom;
  const notes = track.pattern?.notes || [];
  const rows = [];
  for (let midi = PITCH_HIGH; midi >= PITCH_LOW; midi--) {
    const rowNotes = notes.filter(note => note.midi === midi).map(note => {
      const selected = editor.selected.has(note.id);
      return `<button class="piano-note ${selected?'note-selected':''}" data-note-id="${note.id}" style="left:${note.beat*beatWidth}px;width:${Math.max(8,note.durationBeats*beatWidth)}px;top:0;height:${rowHeight-2}px" aria-label="${noteName(note.midi)} note, beat ${note.beat+1}">
        <span>${noteName(note.midi)}</span><i class="note-resize" aria-label="Resize note"></i></button>`;
    }).join('');
    const keyClass = isBlackKey(midi) ? 'black-key' : '';
    rows.push(`<div class="piano-lane ${keyClass}" data-midi="${midi}" style="height:${rowHeight}px;--grid-width:${beatWidth*displayStep}px">${rowNotes}</div>`);
  }
  const keys = keyboardKeys().map(key => `<button class="piano-key ${key.black?'black':'white'} ${key.isC?'is-c':''}" data-key-midi="${key.midi}" style="height:${rowHeight}px" aria-label="Preview ${key.name}">${key.isC||rowHeight>=26?key.name:''}</button>`).join('');
  return `<div class="piano-toolbar">
    <label>Grid <select id="pianoGrid"><option value="4">1 bar</option><option value="2">1/2 bar</option><option value="1">1/4 note</option><option value=".5">1/8 note</option><option value=".25">1/16 note</option><option value=".125">1/32 note</option><option value=".0625">1/64 note</option><option value="0">Off</option></select></label>
    <label>New note <select id="noteLength"><option value=".25">1/16</option><option value=".5">1/8</option><option value="1">1/4</option><option value="2">1/2</option><option value="4">1 bar</option><option value="8">2 bars</option></select></label>
    <label>Velocity <input id="noteVelocity" type="range" min=".05" max="1" step=".01" value=".85"></label>
    <label>Time zoom <input id="timeZoom" type="range" min=".5" max="2.5" step=".1" value="${pianoZoom}"></label>
    <label>Key zoom <input id="keyZoom" type="range" min=".7" max="1.6" step=".1" value="${rowZoom}"></label>
    <button id="duplicateNotes">Duplicate</button><button id="copyNotes">Copy</button><button id="pasteNotes">Paste</button>
    <button id="quantizeNotes">Quantize</button><button id="undoNotes">Undo</button><button id="redoNotes">Redo</button><button id="deleteNote" ${editor.selected.size?'':'disabled'}>Delete</button><output id="noteSelectionStatus" role="status">${editor.selected.size} selected</output>
  </div>
  <div class="piano-scroll" id="pianoScroll">
    <div class="piano-world" id="pianoWorld" style="width:${KEY_WIDTH+patternBeats*beatWidth}px;height:${RULER_HEIGHT+gridHeight(rowHeight)}px;--beat-width:${beatWidth}px;--row-height:${rowHeight}px;--key-width:${KEY_WIDTH}px;--ruler-height:${RULER_HEIGHT}px">
      <div class="piano-ruler" style="height:${RULER_HEIGHT}px"><div class="piano-corner"></div><div class="piano-ruler-bars">${Array.from({length:Math.ceil(patternBeats/4)},(_,bar)=>`<span style="left:${bar*4*beatWidth}px;width:${4*beatWidth}px">Bar ${bar+1}</span>`).join('')}</div></div>
      <div class="piano-keys" id="pianoKeys" aria-label="Piano keyboard">${keys}</div>
      <div class="piano-lanes">${rows.join('')}</div>
      <div class="piano-cursor" id="pianoCursor"></div>
    </div>
  </div>
  <details class="velocity-panel" id="velocityPanel" ${velocityOpen?'open':''}>
    <summary>Velocity</summary>
    <div class="velocity-scroll" id="velocityScroll">
      <div class="velocity-world" id="velocityWorld" style="width:${KEY_WIDTH+patternBeats*beatWidth}px;height:${VELOCITY_LANE_HEIGHT}px">
        <div class="velocity-corner" style="width:${KEY_WIDTH}px">Vel</div>
        ${notes.map(note=>`<button class="velocity-bar ${editor.selected.has(note.id)?'note-selected':''}" data-velocity-id="${note.id}" style="left:${KEY_WIDTH+note.beat*beatWidth}px;height:${velocityBarHeight(note.velocity)}px" aria-label="${noteName(note.midi)} velocity ${Math.round((note.velocity??.85)*127)}" title="${Math.round((note.velocity??.85)*127)}"></button>`).join('')}
      </div>
    </div>
  </details>`;
}

export function renderSamplerHTML(track, assets, buffers, grid) {
  const editor = editorFor(track);
  const sampler = track.sampler;
  const buffer = sampler && buffers.get(sampler.asset);
  const instrumentSettings = sampler ? `<section class="sample-source"><h3>Sample Source</h3><strong>${sampler.asset?escapeHTML(assets.get(sampler.asset)?.name||'Missing sample'):'No sample selected — notes you place become audible after you assign a sample.'}</strong><div><button id="chooseSamplerSample">${sampler.asset?'Replace Sample':'Choose Sample'}</button><button id="clearSamplerSample" ${sampler.asset?'':'disabled'}>Clear Sample</button><button id="previewSamplerSample" ${sampler.asset?'':'disabled'}>Preview Sample</button><button id="editSamplerSample" ${sampler.asset?'':'disabled'}>Open in Sample Studio</button></div><div class="sampler-settings">
      <label>Sample <select id="samplerAsset"><option value="">No sample selected</option>${[...assets.values()].map(asset =>
        `<option value="${asset.id}" ${asset.id === sampler.asset ? 'selected' : ''}>${escapeHTML(asset.name)}</option>`
      ).join('')}</select></label>
      <label>Root key <input id="rootKey" type="number" min="24" max="96" value="${sampler.rootNote}"></label>
      <button id="detectKey">Detect key</button>
      <label>Voice mode <select id="samplerMode"><option value="melodic">Gated</option><option value="oneShot">One-shot</option><option value="loop">Loop</option></select></label>
      <label>Start (s) <input id="samplerStart" type="number" min="0" step=".001" value="${sampler.start || 0}"></label>
      <label>End (s) <input id="samplerEnd" type="number" min=".001" step=".001" value="${sampler.end || buffer?.duration || 1}"></label>
      <label>Attack (s) <input id="samplerAttack" type="number" min="0" max="2" step=".005" value="${sampler.attack ?? .005}"></label>
      <label>Decay (s) <input id="samplerDecay" type="number" min="0" max="5" step=".01" value="${sampler.decay ?? .1}"></label>
      <label>Sustain <input id="samplerSustain" type="number" min="0" max="1" step=".01" value="${sampler.sustain ?? .8}"></label>
      <label>Release (s) <input id="samplerRelease" type="number" min="0" max="5" step=".01" value="${sampler.release ?? .03}"></label>
      <label>Transpose <input id="samplerTranspose" type="number" min="-24" max="24" step="1" value="${sampler.transpose ?? 0}"></label>
      <label>Fine tune (cents) <input id="samplerFineTune" type="number" min="-100" max="100" step="1" value="${sampler.fineTune ?? 0}"></label>
    </div>
    <p id="pitchStatus" class="hint">${sampler.detected ? `Detected root: ${sampler.detected}${sampler.confidence ? ` · confidence ${(sampler.confidence*100).toFixed(0)}%` : ''} · adjust by ear if needed.` : 'Pitch detection works best on clear, sustained single notes; chords and percussion may need manual tuning.'}</p></section>` : `<p class="hint">Drum Rack notes trigger their assigned pads; use the step sequencer or place/edit notes here.</p>`;
  return `<section class="studio sampler-studio">
    <div class="section-title"><button id="backArrange">← Arrangement</button><h2>${escapeHTML(track.name)} · Sampler / Piano Roll</h2>
      <p>${sampler ? 'Sample-based instrument. Piano-roll notes trigger actual sample playback; MIDI devices or files are not required.' : 'Drum Rack pad notes trigger assigned samples; the piano roll and step sequencer edit the same pattern.'}</p></div>
    ${instrumentSettings}
    <div class="sampler-fx"><strong>Sampler filter & track effects</strong>
      <label>Filter <select id="filterType"><option value="lowpass">Low-pass</option><option value="highpass">High-pass</option></select></label>
      <label>Cutoff <input id="filterCutoff" type="range" min="100" max="20000" step="50" value="${track.fx?.cutoff || 20000}"></label>
      <label>Resonance <input id="filterQ" type="range" min=".1" max="18" step=".1" value="${track.fx?.resonance || .7}"></label>
      <label>Delay mix <input id="delayMix" type="range" min="0" max=".8" step=".01" value="${track.fx?.delay || 0}"></label>
      <label>Delay time (ms) <input id="delayTime" type="range" min="50" max="750" step="10" value="${(track.fx?.delayTime || .25)*1000}"></label>
      <label>Feedback <input id="delayFeedback" type="range" min="0" max=".75" step=".01" value="${track.fx?.feedback || 0}"></label>
    </div>
    ${pianoMarkup(track,grid,editor)}
  </section>`;
}

export function wireSamplerUI(root, {track, tracks, assets, buffers, engine, save, notify, preview,openSample,grid, setGrid, back, playhead=()=>0, secondsPerBeat=.5,position=seconds=>seconds}) {
  const patternBeats=track.pattern?.lengthBeats||64;
  const sampler = track.sampler;
  const notes = track.pattern?.notes || [];
  const buffer = () => sampler && buffers.get(sampler.asset);
  const editor = editorFor(track);
  root.querySelector('#backArrange').onclick = back;
  root.querySelector('#pianoGrid').value = String(grid);
  root.querySelector('#pianoGrid').onchange = event => setGrid(+event.target.value);
  root.querySelector('#timeZoom').oninput = event => {pianoZoom=+event.target.value;setGrid(grid)};
  root.querySelector('#keyZoom').oninput = event => {rowZoom=+event.target.value;setGrid(grid)};
  root.querySelector('#undoNotes').onclick = () => {if(editor.undo()){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#redoNotes').onclick = () => {if(editor.redo()){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#deleteNote').onclick = () => {if(editor.removeSelected()){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#copyNotes').onclick = () => editor.copy();
  root.querySelector('#pasteNotes').onclick = () => {if(editor.paste(playhead()/secondsPerBeat,grid,patternBeats)){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#duplicateNotes').onclick = () => {if(editor.duplicate(grid,patternBeats)){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#quantizeNotes').onclick = () => {if(editor.quantize(grid,patternBeats)){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#noteVelocity').oninput = event => {if(editor.setVelocity(+event.target.value)){track.pattern={notes};save()}};
  if(sampler){
    const assign=id=>{assignSamplerSource(sampler,id,buffers.get(id));save();setGrid(grid)};
    root.querySelector('#samplerAsset').onchange=event=>{try{assign(event.target.value)}catch(error){notify(error.message)}};
    root.querySelector('#chooseSamplerSample').onclick=()=>showSamplePicker({assets,buffers,preview,onSelect:assign,notify});
    root.querySelector('#clearSamplerSample').onclick=()=>assign(null);
    root.querySelector('#previewSamplerSample').onclick=()=>engine.previewNote(track,buffers,sampler.rootNote,.75,tracks).catch(error=>notify(error.message));
    root.querySelector('#editSamplerSample').onclick=()=>openSample(sampler.asset);
    bindSampleDrop(root.querySelector('.sample-source'),assign,notify);
  }
  if (sampler) root.querySelector('#rootKey').onchange = event => {sampler.rootNote=Math.max(24,Math.min(96,Number(event.target.value)||60));save()};
  if (sampler) root.querySelector('#detectKey').onclick = () => {
    const selected=buffer(),pitch=selected&&detectPitch(selected,sampler.start||0,sampler.end||selected.duration);
    if(!pitch){root.querySelector('#pitchStatus').textContent='No stable pitch detected. Set the root key manually; drums and chords are not reliably auto-tuned.';return}
    sampler.rootNote=pitch.midi;sampler.detected=pitch.name;sampler.confidence=pitch.confidence;
    root.querySelector('#rootKey').value=pitch.midi;
    root.querySelector('#pitchStatus').textContent=`Detected ${pitch.name} (${pitch.frequency.toFixed(1)} Hz, ${(pitch.confidence*100).toFixed(0)}% confidence).`;save();
  };
  if (sampler) for(const [id,key,minimum,maximum] of [['samplerMode','mode',0,0],['samplerAttack','attack',0,2],['samplerDecay','decay',0,5],['samplerSustain','sustain',0,1],['samplerRelease','release',0,5],['samplerTranspose','transpose',-24,24],['samplerFineTune','fineTune',-100,100]]) {
    const input=root.querySelector(`#${id}`);
    if(key==='mode')input.value=sampler.mode||'melodic';
    input.onchange=event=>{sampler[key]=key==='mode'?event.target.value:Math.max(minimum,Math.min(maximum,Number(event.target.value)||0));save()};
    if(key!=='mode'){
      input.type='range';
      input.oninput=input.onchange;
      const defaults={attack:.005,decay:.1,sustain:.8,release:.03,transpose:0,fineTune:0};
      enhanceParameter(input,{name:`Sampler ${key}`,reset:defaults[key],rotary:true,unit:['attack','decay','release'].includes(key)?'s':key==='transpose'?'st':key==='fineTune'?'cents':'',format:key==='sustain'?'percent':'number'});
    }
  }
  if (sampler) {
    const hint=document.createElement('p');hint.className='hint';hint.textContent='Envelope, root key and tuning apply to newly triggered notes. Filter and track effects update active voices. Space plays/pauses the Arrangement, including this track’s clips.';
    root.querySelector('.sample-source').append(hint);
    root.querySelector('#samplerStart').onchange=event=>{if(!buffer())return notify('Choose a sample first.');sampler.start=Math.max(0,Math.min(Math.max(0,buffer().duration-.001),Number(event.target.value)||0));save()};
    root.querySelector('#samplerEnd').onchange=event=>{if(!buffer())return notify('Choose a sample first.');sampler.end=Math.max(sampler.start+.001,Math.min(buffer().duration,Number(event.target.value)||buffer().duration));save()};
  }
  track.fx ||= {filterType:'lowpass',cutoff:20000,resonance:.7,delay:0,delayTime:.25,feedback:.25};
  root.querySelector('#filterType').value=track.fx.filterType;
  for(const [id,key] of [['filterCutoff','cutoff'],['filterQ','resonance'],['delayMix','delay'],['delayTime','delayTime'],['delayFeedback','feedback']])root.querySelector(`#${id}`).oninput=event=>{track.fx[key]=Number(event.target.value)/(id==='delayTime'?1000:1);engine.syncTracks(tracks);save()};
  root.querySelector('#filterType').onchange=event=>{track.fx.filterType=event.target.value;engine.syncTracks(tracks);save()};
  for(const [id,name,unit,reset,scale,format]of [
    ['filterCutoff','Cutoff','Hz',20000,'log','number'],['filterQ','Resonance','Q',.7,'log','number'],
    ['delayMix','Delay mix','',0,'linear','percent'],['delayTime','Delay time','ms',250,'log','number'],
    ['delayFeedback','Feedback','',.25,'linear','percent']
  ])enhanceParameter(root.querySelector(`#${id}`),{name,unit,reset,scale,format,rotary:true});

  const world=root.querySelector('#pianoWorld');
  let gesture=null;
  const worldBeatWidth=40*pianoZoom,rowHeight=BASE_ROW_HEIGHT*rowZoom;
  const scroller=root.querySelector('#pianoScroll');
  const highlight=midi=>{
    highlightedPitch=midi;
    root.querySelectorAll('.piano-key.key-active,.piano-lane.lane-active').forEach(element=>element.classList.remove('key-active','lane-active'));
    root.querySelector(`.piano-key[data-key-midi="${midi}"]`)?.classList.add('key-active');
    root.querySelector(`.piano-lane[data-midi="${midi}"]`)?.classList.add('lane-active');
  };
  scroller.scrollTop=rowTop(topPitch,rowHeight);
  scroller.addEventListener('scroll',()=>{topPitch=midiAtY(Math.max(0,scroller.scrollTop),rowHeight)},{passive:true});
  if(highlightedPitch!==null)highlight(highlightedPitch);
  for(const key of root.querySelectorAll('.piano-key'))key.onclick=()=>{const midi=+key.dataset.keyMidi;highlight(midi);engine.previewNote(track,buffers,midi,.4,tracks).catch(error=>notify(`Preview failed: ${error.message}`))};
  const velocityScroll=root.querySelector('#velocityScroll'),velocityPanel=root.querySelector('#velocityPanel');
  // The velocity lane shares the Piano Roll's horizontal scroll position and zoom; scrollLeft is mirrored both ways.
  let syncing=false;
  const mirror=(from,to)=>from.addEventListener('scroll',()=>{if(syncing)return;syncing=true;to.scrollLeft=from.scrollLeft;syncing=false},{passive:true});
  mirror(scroller,velocityScroll);mirror(velocityScroll,scroller);
  velocityScroll.scrollLeft=scroller.scrollLeft;
  velocityPanel.addEventListener('toggle',()=>{velocityOpen=velocityPanel.open;if(velocityOpen)velocityScroll.scrollLeft=scroller.scrollLeft});
  let velocityDrag=null;
  const drawVelocities=()=>{
    for(const bar of root.querySelectorAll('.velocity-bar')){
      const note=notes.find(item=>item.id===bar.dataset.velocityId);if(!note)continue;
      bar.style.height=`${velocityBarHeight(note.velocity)}px`;bar.title=String(Math.round(note.velocity*127));
      bar.setAttribute('aria-label',`${noteName(note.midi)} velocity ${Math.round(note.velocity*127)}`);
      bar.classList.toggle('note-selected',editor.selected.has(note.id));
    }
  };
  const velocityY=event=>velocityAtY(event.clientY-velocityScroll.querySelector('#velocityWorld').getBoundingClientRect().top,VELOCITY_LANE_HEIGHT);
  velocityScroll.addEventListener('pointerdown',event=>{
    const bar=event.target.closest('.velocity-bar');if(!bar)return;
    event.preventDefault();
    const id=bar.dataset.velocityId;
    if(!editor.selected.has(id))editor.select([id],event.ctrlKey||event.metaKey||event.shiftKey);
    velocityDrag={id,pointerId:event.pointerId,changed:false,initial:Object.fromEntries(notes.map(note=>[note.id,note.velocity??.85]))};
    bar.setPointerCapture(event.pointerId);drawSelection();drawVelocities();
  });
  velocityScroll.addEventListener('pointermove',event=>{
    if(!velocityDrag)return;
    const value=velocityY(event);
    if(!velocityDrag.changed){editor.checkpoint();velocityDrag.changed=true}
    applyVelocityDrag(notes,editor.selected,velocityDrag.id,velocityDrag.initial,value);
    drawVelocities();
  });
  const endVelocityDrag=()=>{
    if(velocityDrag?.changed){track.pattern={notes};save();root.querySelector('#noteVelocity').value=notes.find(item=>item.id===velocityDrag.id)?.velocity??.85}
    velocityDrag=null;
  };
  velocityScroll.addEventListener('pointerup',endVelocityDrag);
  velocityScroll.addEventListener('pointercancel',endVelocityDrag);
  function drawSelection() {
    root.querySelectorAll('.piano-note').forEach(element=>element.classList.toggle('note-selected',editor.selected.has(element.dataset.noteId)));
    drawVelocities?.();
    root.querySelector('#deleteNote').disabled=!editor.selected.size;
    root.querySelector('#noteSelectionStatus').value=`${editor.selected.size} selected`;
    const selected=notes.find(note=>editor.selected.has(note.id));
    if(selected)root.querySelector('#noteVelocity').value=selected.velocity??.85;
  }
  world.addEventListener('pointerdown',event=>{
    const noteElement=event.target.closest('.piano-note');
    if(!noteElement)return;
    event.preventDefault();
    const id=noteElement.dataset.noteId;
    const resize=event.target.closest('.note-resize');
    if(!editor.selected.has(id))editor.select([id],event.ctrlKey||event.metaKey||event.shiftKey);
    const note=notes.find(item=>item.id===id);
    gesture={id,pointerId:event.pointerId,mode:resize?'resize':'move',x:event.clientX,y:event.clientY,beat:note.beat,midi:note.midi,duration:note.durationBeats,changed:false,initial:notes.filter(item=>editor.selected.has(item.id)).map(item=>({id:item.id,beat:item.beat,midi:item.midi}))};
    noteElement.setPointerCapture(event.pointerId);
  });
  world.addEventListener('pointermove',event=>{
    if(!gesture)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(Math.abs(dx)<5&&Math.abs(dy)<5)return;
    if(!gesture.changed){editor.checkpoint();gesture.changed=true}
    if(gesture.mode==='resize'){
      const note=notes.find(item=>item.id===gesture.id);
      note.durationBeats=Math.min(patternBeats-note.beat,Math.max(grid||.0625,snapBeats(gesture.duration+dx/worldBeatWidth,grid)));
      noteElementStyle(gesture.id,note);
    }else{
      const minBeat=Math.min(...gesture.initial.map(note=>note.beat));
      const maxEnd=Math.max(...gesture.initial.map(note=>note.beat+notes.find(item=>item.id===note.id).durationBeats));
      const proposed=snapBeats(Math.max(0,gesture.beat+dx/worldBeatWidth),grid)-gesture.beat;
      const beatDelta=Math.max(-minBeat,Math.min(patternBeats-maxEnd,proposed));
      const midiDelta=Math.round(-dy/rowHeight);
      const minMidi=Math.min(...gesture.initial.map(note=>note.midi)),maxMidi=Math.max(...gesture.initial.map(note=>note.midi)),pitchDelta=Math.max(PITCH_LOW-minMidi,Math.min(PITCH_HIGH-maxMidi,midiDelta));
      for(const original of gesture.initial){const note=notes.find(item=>item.id===original.id);if(!note)continue;note.beat=Math.max(0,original.beat+beatDelta);note.midi=original.midi+pitchDelta;noteElementStyle(note.id,note)}
    }
    gesture.changed=true;
  });
  world.addEventListener('pointerup',event=>{
    if(gesture?.changed){
      track.pattern={notes};save();
      // Keep the dragged note mounted until its synthetic click has targeted it.
      requestAnimationFrame(()=>{if(root.querySelector('#pianoWorld')===world)setGrid(grid)});
    }
    gesture=null;
  });
  world.addEventListener('pointercancel',()=>{
    if(gesture?.changed){track.pattern={notes};save();setGrid(grid)}
    gesture=null;
  });
  world.addEventListener('click',event=>{
    if(event.target.closest('.piano-note')){const id=event.target.closest('.piano-note').dataset.noteId;if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey)editor.select([id]);drawSelection();return}
    const lane=event.target.closest('.piano-lane');if(!lane)return;
    const durationBeats=Math.min(patternBeats,Math.max(grid||.0625,+root.querySelector('#noteLength').value));
    const beat=Math.min(patternBeats-durationBeats,snapBeats(pianoBeatAtClientX(event.clientX,lane.getBoundingClientRect().left,worldBeatWidth),grid)),midi=+lane.dataset.midi;
    const note=editor.add({beat,midi,durationBeats,velocity:Number(root.querySelector('#noteVelocity').value)},patternBeats);
    track.pattern={notes};save();setGrid(grid);engine.previewNote(track,buffers,note.midi,.25,tracks).catch(error=>notify(`Preview failed: ${error.message}`));
  });
  function noteElementStyle(id,note) {
    const element=root.querySelector(`.piano-note[data-note-id="${id}"]`);
    if(!element)return;
    const lane=root.querySelector(`.piano-lane[data-midi="${note.midi}"]`),captured=gesture&&element.hasPointerCapture(gesture.pointerId);
    if(lane&&element.parentElement!==lane){lane.append(element);if(captured)element.setPointerCapture(gesture.pointerId)}
    element.style.left=`${note.beat*worldBeatWidth}px`;
    element.style.top='0';
    element.style.width=`${Math.max(8,note.durationBeats*worldBeatWidth)}px`;
  }
  root.addEventListener('keydown',event=>{
    if(event.target.matches('input,select'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey?editor.redo():editor.undo()){track.pattern={notes};save();setGrid(grid)}}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'){event.preventDefault();editor.copy()}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='v'){event.preventDefault();if(editor.paste(playhead()/secondsPerBeat,grid,patternBeats)){track.pattern={notes};save();setGrid(grid)}}
    else if(event.key==='Delete'||event.key==='Backspace'){if(editor.removeSelected()){track.pattern={notes};save();setGrid(grid)}}
    else if(event.key.toLowerCase()==='d'){if(editor.duplicate(grid,patternBeats)){track.pattern={notes};save();setGrid(grid)}}
  });
  root.tabIndex=0;
  attachCursor(engine,root,secondsPerBeat,position);
  root.querySelector('#backArrange').onclick=()=>{if(activePianoRoot===root)activePianoRoot=null;back()};
}
