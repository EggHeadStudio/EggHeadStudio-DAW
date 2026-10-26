import {detectPitch,noteName,snapBeats} from './music.js';
import {PianoNoteEditor} from './piano-model.js';

const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const patternBeats = 64;
const lowestMidi = 36;
const highestMidi = 95;
let pianoZoom = 1;
let rowZoom = 1;
const editors = new Map();
let activePianoRoot = null;
let activeSecondsPerBeat = .5;
let originalEngineTick = null;
const cursorTick = seconds => {
  originalEngineTick?.(seconds);
  const world=activePianoRoot?.querySelector('#pianoWorld');
  const cursor=activePianoRoot?.querySelector('#pianoCursor');
  if(world&&cursor)cursor.style.left=`${seconds/activeSecondsPerBeat*parseFloat(world.style.getPropertyValue('--beat-width'))}px`;
};
function attachCursor(engine,root,secondsPerBeat){
  activePianoRoot=root;
  activeSecondsPerBeat=secondsPerBeat;
  if(engine.onTick!==cursorTick){originalEngineTick=engine.onTick;engine.onTick=cursorTick}
}
function editorFor(track) {
  const notes = track.pattern?.notes || [];
  let editor = editors.get(track.id);
  if (!editor || editor.notes !== notes) {
    editor = new PianoNoteEditor(notes);
    editors.set(track.id, editor);
  }
  return editor;
}

function pianoMarkup(track, grid, editor) {
  const displayStep = grid || .0625;
  const beatWidth = 40 * pianoZoom;
  const rowHeight = 22 * rowZoom;
  const notes = track.pattern?.notes || [];
  const rows = [];
  for (let midi = highestMidi; midi >= lowestMidi; midi--) {
    const rowNotes = notes.filter(note => note.midi === midi).map(note => {
      const selected = editor.selected.has(note.id);
      return `<button class="piano-note ${selected?'note-selected':''}" data-note-id="${note.id}" style="left:${note.beat*beatWidth}px;width:${Math.max(8,note.durationBeats*beatWidth)}px;top:${(highestMidi-note.midi)*rowHeight}px;height:${rowHeight-2}px" aria-label="${noteName(note.midi)} note, beat ${note.beat+1}">
        <span>${noteName(note.midi)}</span><i class="note-resize" aria-label="Resize note"></i></button>`;
    }).join('');
    const keyClass = midi % 12 === 1 || midi % 12 === 3 || midi % 12 === 6 || midi % 12 === 8 || midi % 12 === 10 ? 'black-key' : '';
    rows.push(`<div class="piano-lane ${keyClass}" data-midi="${midi}" style="height:${rowHeight}px;--grid-width:${beatWidth*displayStep}px">${rowNotes}</div>`);
  }
  return `<div class="piano-toolbar">
    <label>Grid <select id="pianoGrid"><option value="4">1 bar</option><option value="2">1/2 bar</option><option value="1">1/4 note</option><option value=".5">1/8 note</option><option value=".25">1/16 note</option><option value=".125">1/32 note</option><option value=".0625">1/64 note</option><option value="0">Off</option></select></label>
    <label>New note <select id="noteLength"><option value=".25">1/16</option><option value=".5">1/8</option><option value="1">1/4</option><option value="2">1/2</option><option value="4">1 bar</option><option value="8">2 bars</option></select></label>
    <label>Velocity <input id="noteVelocity" type="range" min=".05" max="1" step=".01" value=".85"></label>
    <label>Time zoom <input id="timeZoom" type="range" min=".5" max="2.5" step=".1" value="${pianoZoom}"></label>
    <label>Key zoom <input id="keyZoom" type="range" min=".7" max="1.6" step=".1" value="${rowZoom}"></label>
    <button id="duplicateNotes">Duplicate</button><button id="copyNotes">Copy</button><button id="pasteNotes">Paste</button>
    <button id="quantizeNotes">Quantize</button><button id="undoNotes">Undo</button><button id="redoNotes">Redo</button><button id="deleteNote" ${editor.selected.size?'':'disabled'}>Delete</button>
  </div>
  <div class="piano-preview" aria-label="Preview sample notes">${Array.from({length:24},(_,i)=>48+i).map(midi=>`<button data-preview-midi="${midi}" aria-label="Preview ${noteName(midi)}">${noteName(midi)}</button>`).join('')}</div>
  <div class="piano-scroll" id="pianoScroll">
    <div class="piano-world" id="pianoWorld" style="width:${patternBeats*beatWidth}px;height:${(highestMidi-lowestMidi+1)*rowHeight}px;--beat-width:${beatWidth}px;--row-height:${rowHeight}px">
      <div class="piano-ruler" style="width:${patternBeats*beatWidth}px;height:28px">${Array.from({length:16},(_,bar)=>`<span style="left:${bar*4*beatWidth}px;width:${4*beatWidth}px">Bar ${bar+1}</span>`).join('')}</div>
      <div class="piano-lanes">${rows.join('')}</div>
      <div class="piano-cursor" id="pianoCursor"></div>
    </div>
  </div>`;
}

export function renderSamplerHTML(track, assets, buffers, grid) {
  const editor = editorFor(track);
  const sampler = track.sampler;
  const buffer = sampler && buffers.get(sampler.asset);
  const instrumentSettings = sampler ? `<div class="sampler-settings">
      <label>Sample <select id="samplerAsset">${[...assets.values()].map(asset =>
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
    <p id="pitchStatus" class="hint">${sampler.detected ? `Detected root: ${sampler.detected}${sampler.confidence ? ` · confidence ${(sampler.confidence*100).toFixed(0)}%` : ''} · adjust by ear if needed.` : 'Pitch detection works best on clear, sustained single notes; chords and percussion may need manual tuning.'}</p>` : `<p class="hint">Drum Rack notes trigger their assigned pads; use the step sequencer or place/edit notes here.</p>`;
  return `<section class="studio sampler-studio">
    <div class="section-title"><button id="backArrange">← Arrangement</button><h2>${escapeHTML(track.name)} · Sampler / Piano Roll</h2>
      <p>${sampler ? 'Sample-based instrument. Piano-roll notes trigger actual sample playback; MIDI devices or files are not required.' : 'Drum Rack pad notes trigger assigned samples; the piano roll and step sequencer edit the same pattern.'}</p></div>
    ${instrumentSettings}
    <div class="sampler-fx"><strong>Sampler filter & track effects</strong>
      <label>Filter <select id="filterType"><option value="lowpass">Low-pass</option><option value="highpass">High-pass</option></select></label>
      <label>Cutoff <input id="filterCutoff" type="range" min="100" max="20000" step="50" value="${track.fx?.cutoff || 20000}"></label>
      <label>Resonance <input id="filterQ" type="range" min=".1" max="18" step=".1" value="${track.fx?.resonance || .7}"></label>
      <label>Delay mix <input id="delayMix" type="range" min="0" max=".8" step=".01" value="${track.fx?.delay || 0}"></label>
      <label>Delay time <input id="delayTime" type="range" min=".05" max=".75" step=".01" value="${track.fx?.delayTime || .25}"></label>
      <label>Feedback <input id="delayFeedback" type="range" min="0" max=".75" step=".01" value="${track.fx?.feedback || 0}"></label>
    </div>
    ${pianoMarkup(track,grid,editor)}
  </section>`;
}

export function wireSamplerUI(root, {track, tracks, buffers, engine, save, notify, grid, setGrid, back, playhead=()=>0, secondsPerBeat=.5}) {
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
  root.querySelector('#pasteNotes').onclick = () => {if(editor.paste(playhead()/secondsPerBeat,grid)){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#duplicateNotes').onclick = () => {if(editor.duplicate(grid)){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#quantizeNotes').onclick = () => {if(editor.quantize(grid)){track.pattern={notes};save();setGrid(grid)}};
  root.querySelector('#noteVelocity').oninput = event => {if(editor.setVelocity(+event.target.value)){track.pattern={notes};save()}};
  if (sampler) root.querySelector('#samplerAsset').onchange = event => {
    const selected = buffers.get(event.target.value);
    if (!selected) return notify('That sample is not loaded. Reimport it before using it in the sampler.');
    sampler.asset=event.target.value;sampler.start=0;sampler.end=selected.duration;
    const pitch=detectPitch(selected);if(pitch){sampler.rootNote=pitch.midi;sampler.detected=pitch.name;sampler.confidence=pitch.confidence}
    save();setGrid(grid);
  };
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
  }
  if (sampler) {
    root.querySelector('#samplerStart').onchange=event=>{sampler.start=Math.max(0,Math.min(Math.max(0,buffer().duration-.001),Number(event.target.value)||0));save()};
    root.querySelector('#samplerEnd').onchange=event=>{sampler.end=Math.max(sampler.start+.001,Math.min(buffer().duration,Number(event.target.value)||buffer().duration));save()};
  }
  track.fx ||= {filterType:'lowpass',cutoff:20000,resonance:.7,delay:0,delayTime:.25,feedback:.25};
  root.querySelector('#filterType').value=track.fx.filterType;
  for(const [id,key] of [['filterCutoff','cutoff'],['filterQ','resonance'],['delayMix','delay'],['delayTime','delayTime'],['delayFeedback','feedback']])root.querySelector(`#${id}`).oninput=event=>{track.fx[key]=Number(event.target.value);engine.syncTracks(tracks);save()};
  root.querySelector('#filterType').onchange=event=>{track.fx.filterType=event.target.value;engine.syncTracks(tracks);save()};

  const world=root.querySelector('#pianoWorld');
  let gesture=null;
  const worldBeatWidth=40*pianoZoom,rowHeight=22*rowZoom;
  function drawSelection() {
    root.querySelectorAll('.piano-note').forEach(element=>element.classList.toggle('note-selected',editor.selected.has(element.dataset.noteId)));
    root.querySelector('#deleteNote').disabled=!editor.selected.size;
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
    gesture={id,mode:resize?'resize':'move',x:event.clientX,y:event.clientY,beat:note.beat,midi:note.midi,duration:note.durationBeats,changed:false,initial:notes.filter(item=>editor.selected.has(item.id)).map(item=>({id:item.id,beat:item.beat,midi:item.midi}))};
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
      for(const original of gesture.initial){const note=notes.find(item=>item.id===original.id);if(!note)continue;note.beat=Math.max(0,original.beat+beatDelta);note.midi=Math.max(0,Math.min(127,original.midi+midiDelta));noteElementStyle(note.id,note)}
    }
    gesture.changed=true;
  });
  world.addEventListener('pointerup',event=>{
    if(gesture?.changed){track.pattern={notes};save();setGrid(grid)}
    gesture=null;
  });
  world.addEventListener('click',event=>{
    if(event.target.closest('.piano-note')){const id=event.target.closest('.piano-note').dataset.noteId;if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey)editor.select([id]);drawSelection();return}
    const lane=event.target.closest('.piano-lane');if(!lane)return;
    const durationBeats=Math.max(grid||.0625,+root.querySelector('#noteLength').value);
    const rect=lane.getBoundingClientRect(),beat=Math.min(patternBeats-durationBeats,snapBeats(Math.max(0,(event.clientX-rect.left+root.querySelector('#pianoScroll').scrollLeft)/worldBeatWidth),grid)),midi=+lane.dataset.midi;
    const note=editor.add({beat,midi,durationBeats,velocity:.85},patternBeats);
    track.pattern={notes};save();setGrid(grid);engine.previewNote(track,buffers,note.midi,.25,tracks).catch(error=>notify(`Preview failed: ${error.message}`));
  });
  function noteElementStyle(id,note) {
    const element=root.querySelector(`.piano-note[data-note-id="${id}"]`);
    if(!element)return;
    element.style.left=`${note.beat*worldBeatWidth}px`;
    element.style.top=`${(highestMidi-note.midi)*rowHeight}px`;
    element.style.width=`${Math.max(8,note.durationBeats*worldBeatWidth)}px`;
  }
  for(const key of root.querySelectorAll('[data-preview-midi]'))key.onclick=()=>engine.previewNote(track,buffers,+key.dataset.previewMidi,.4,tracks).catch(error=>notify(`Preview failed: ${error.message}`));
  root.addEventListener('keydown',event=>{
    if(event.target.matches('input,select'))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();if(event.shiftKey?editor.redo():editor.undo()){track.pattern={notes};save();setGrid(grid)}}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'){event.preventDefault();editor.copy()}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='v'){event.preventDefault();if(editor.paste(playhead()/secondsPerBeat,grid)){track.pattern={notes};save();setGrid(grid)}}
    else if(event.key==='Delete'||event.key==='Backspace'){if(editor.removeSelected()){track.pattern={notes};save();setGrid(grid)}}
    else if(event.key.toLowerCase()==='d'){if(editor.duplicate(grid)){track.pattern={notes};save();setGrid(grid)}}
  });
  root.tabIndex=0;
  attachCursor(engine,root,secondsPerBeat);
  root.querySelector('#backArrange').onclick=()=>{if(activePianoRoot===root)activePianoRoot=null;back()};
}
