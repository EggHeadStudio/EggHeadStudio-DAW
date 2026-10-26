import {detectPitch,noteName,snapBeats} from './music.js';
let selectedCell = null;

export function renderSamplerHTML(track, assets, buffers, grid) {
  if (selectedCell && selectedCell.trackId !== track.id) selectedCell = null;
  const sampler = track.sampler;
  const buffer = buffers.get(sampler.asset);
  const notes = track.pattern?.notes || [];
  const displayStep = grid || .0625;
  const cellCount = Math.round(16 / displayStep);
  const rows = Array.from({length:24}, (_, i) => 71 - i);
  const options = [...assets.values()].map(asset =>
    `<option value="${asset.id}" ${asset.id === sampler.asset ? 'selected' : ''}>${asset.name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</option>`
  ).join('');
  const cells = rows.map(midi => `<div class="piano-row">
    <span class="piano-key">${noteName(midi)}</span>
    <div class="piano-cells">${Array.from({length:cellCount}, (_, i) => {
      const beat = i * displayStep;
      const active = notes.some(note => note.midi === midi && note.beat >= beat && note.beat < beat + displayStep);
      const selected = selectedCell?.midi === midi && Math.abs(selectedCell.beat - beat) < .001;
      return `<button class="piano-cell ${active ? 'note-on' : ''} ${selected ? 'note-selected' : ''} ${Math.round(beat * 4) % 16 === 0 ? 'bar-start' : ''}" data-midi="${midi}" data-beat="${beat}" aria-label="${noteName(midi)} at beat ${beat + 1}"></button>`;
    }).join('')}</div></div>`).join('');

  return `<section class="studio sampler-studio">
    <div class="section-title"><button id="backArrange">← Arrangement</button><h2>${track.name} · Sampler / Piano Roll</h2>
      <p>Sample-based instrument: piano-roll notes play this sample at different pitches. No MIDI device or MIDI files are used.</p></div>
    <div class="sampler-settings">
      <label>Sample <select id="samplerAsset">${options}</select></label>
      <label>Root key <input id="rootKey" type="number" min="24" max="96" value="${sampler.rootNote}"></label>
      <button id="detectKey">Detect key</button>
      <label>Voice mode <select id="samplerMode"><option value="melodic">Gated</option><option value="oneShot">One-shot</option><option value="loop">Loop</option></select></label>
      <label>Start (s) <input id="samplerStart" type="number" min="0" step=".001" value="${sampler.start || 0}"></label>
      <label>End (s) <input id="samplerEnd" type="number" min=".001" step=".001" value="${sampler.end || buffer?.duration || 1}"></label>
      <label>Attack (s) <input id="samplerAttack" type="number" min="0" max="2" step=".005" value="${sampler.attack ?? .005}"></label>
      <label>Decay (s) <input id="samplerDecay" type="number" min="0" max="5" step=".01" value="${sampler.decay ?? .1}"></label>
      <label>Sustain <input id="samplerSustain" type="number" min="0" max="1" step=".01" value="${sampler.sustain ?? .8}"></label>
      <label>Release (s) <input id="samplerRelease" type="number" min="0" max="5" step=".01" value="${sampler.release ?? .03}"></label>
      <label>Transpose (semitones) <input id="samplerTranspose" type="number" min="-24" max="24" step="1" value="${sampler.transpose ?? 0}"></label>
      <label>Fine tune (cents) <input id="samplerFineTune" type="number" min="-100" max="100" step="1" value="${sampler.fineTune ?? 0}"></label>
    </div>
    <p id="pitchStatus" class="hint">${sampler.detected ? `Detected root: ${sampler.detected}${sampler.confidence ? ` · confidence ${(sampler.confidence * 100).toFixed(0)}%` : ''} · adjust by ear if needed.` : 'Pitch detection works best on clear, sustained single-note samples; drums and chords may need manual tuning.'}</p>
    <div class="sampler-fx"><strong>Track effects</strong>
      <label>Filter <select id="filterType"><option value="lowpass">Low-pass</option><option value="highpass">High-pass</option></select></label>
      <label>Cutoff <input id="filterCutoff" type="range" min="100" max="20000" step="50" value="${track.fx?.cutoff || 20000}"></label>
      <label>Delay mix <input id="delayMix" type="range" min="0" max=".8" step=".01" value="${track.fx?.delay || 0}"></label>
      <label>Delay time <input id="delayTime" type="range" min=".05" max=".75" step=".01" value="${track.fx?.delayTime || .25}"></label>
      <label>Feedback <input id="delayFeedback" type="range" min="0" max=".75" step=".01" value="${track.fx?.feedback || 0}"></label>
    </div>
    <div class="piano-toolbar"><label>Grid <select id="pianoGrid">
      <option value="4">1 bar</option><option value="2">1/2 bar</option><option value="1">1/4 note</option>
      <option value=".5">1/8 note</option><option value=".25">1/16 note</option><option value=".125">1/32 note</option><option value=".0625">1/64 note</option><option value="0">Off</option>
    </select></label><label>Length <select id="noteLength"><option value=".25">1/16</option><option value=".5">1/8</option><option value="1">1/4</option><option value="2">1/2</option><option value="4">1 bar</option></select></label><label>Velocity <input id="noteVelocity" type="range" min=".05" max="1" step=".01" value="${selectedCell ? notes.find(note => note.midi === selectedCell.midi && Math.abs(note.beat - selectedCell.beat) < .001)?.velocity || .85 : .85}"></label><button id="deleteNote" ${selectedCell ? '' : 'disabled'}>Delete note</button><button id="clearPattern">Clear notes</button></div>
    <div class="preview-keyboard" aria-label="Sample preview keyboard">${Array.from({length:24},(_,i)=>48+i).map(midi=>`<button data-preview-midi="${midi}" aria-label="Preview ${noteName(midi)}">${noteName(midi)}</button>`).join('')}</div>
    <div class="piano-scroll"><div class="piano-roll" style="--piano-columns:${cellCount}">
      <div class="piano-ruler"><span>KEY</span>${Array.from({length:cellCount}, (_, i) => `<span class="${Math.round(i * displayStep * 4) % 16 === 0 ? 'bar-start' : ''}">${Math.round(i * displayStep * 4) % 16 === 0 ? `Bar ${Math.floor(i * displayStep / 4) + 1}` : ''}</span>`).join('')}</div>
      ${cells}
    </div></div>
  </section>`;
}

export function wireSamplerUI(root, {track, tracks, buffers, engine, save, notify, grid, setGrid, back}) {
  const sampler = track.sampler;
  const notes = track.pattern?.notes || [];
  const buffer = () => buffers.get(sampler.asset);
  root.querySelector('#backArrange').onclick = back;
  root.querySelector('#pianoGrid').value = String(grid);
  root.querySelector('#pianoGrid').onchange = event => setGrid(+event.target.value);
  const selectedNote = () => selectedCell && notes.find(note => note.midi === selectedCell.midi && Math.abs(note.beat - selectedCell.beat) < .001);
  root.querySelector('#noteLength').value = String(selectedNote()?.durationBeats || .25);
  root.querySelector('#noteLength').onchange = event => { const note = selectedNote(); if (note) { note.durationBeats = Number(event.target.value); save(); setGrid(grid); } };
  root.querySelector('#noteVelocity').oninput = event => { const note = selectedNote(); if (note) { note.velocity = Number(event.target.value); save(); } };
  root.querySelector('#deleteNote').onclick = () => { const index = notes.indexOf(selectedNote()); if (index >= 0) notes.splice(index, 1); selectedCell = null; track.pattern = {notes}; save(); setGrid(grid); };
  root.querySelector('#clearPattern').onclick = () => { track.pattern.notes = []; selectedCell = null; save(); setGrid(grid); };
  root.querySelector('#samplerAsset').onchange = event => {
    const selected = buffers.get(event.target.value);
    if (!selected) return notify('That sample is not loaded. Reimport it before using it in the sampler.');
    sampler.asset = event.target.value;
    sampler.start = 0;
    sampler.end = selected.duration;
    const pitch = detectPitch(selected);
    if (pitch) { sampler.rootNote = pitch.midi; sampler.detected = pitch.name; sampler.confidence = pitch.confidence; }
    save();
    setGrid(grid);
  };
  root.querySelector('#rootKey').onchange = event => {
    sampler.rootNote = Math.max(24, Math.min(96, Number(event.target.value) || 60));
    save();
  };
  root.querySelector('#detectKey').onclick = () => {
    const selected = buffer();
    const pitch = selected && detectPitch(selected, sampler.start || 0, sampler.end || selected.duration);
    if (!pitch) {
      root.querySelector('#pitchStatus').textContent = 'No stable pitch detected. Set the root key manually; drums and chords are not reliably auto-tuned.';
      return;
    }
    sampler.rootNote = pitch.midi;
    sampler.detected = pitch.name;
    sampler.confidence = pitch.confidence;
    root.querySelector('#rootKey').value = pitch.midi;
    root.querySelector('#pitchStatus').textContent = `Detected ${pitch.name} (${pitch.frequency.toFixed(1)} Hz, ${(pitch.confidence * 100).toFixed(0)}% confidence).`;
    save();
  };
  root.querySelector('#samplerMode').value = sampler.mode || 'melodic';
  root.querySelector('#samplerMode').onchange = event => { sampler.mode = event.target.value; save(); };
  root.querySelector('#samplerAttack').onchange = event => { sampler.attack = Math.max(0, Math.min(2, Number(event.target.value) || 0)); save(); };
  root.querySelector('#samplerDecay').onchange = event => { sampler.decay = Math.max(0, Math.min(5, Number(event.target.value) || 0)); save(); };
  root.querySelector('#samplerSustain').onchange = event => { sampler.sustain = Math.max(0, Math.min(1, Number(event.target.value) || 0)); save(); };
  root.querySelector('#samplerRelease').onchange = event => { sampler.release = Math.max(0, Math.min(5, Number(event.target.value) || 0)); save(); };
  root.querySelector('#samplerTranspose').onchange = event => { sampler.transpose = Math.max(-24, Math.min(24, Number(event.target.value) || 0)); save(); };
  root.querySelector('#samplerFineTune').onchange = event => { sampler.fineTune = Math.max(-100, Math.min(100, Number(event.target.value) || 0)); save(); };
  root.querySelector('#samplerStart').onchange = event => {
    sampler.start = Math.max(0, Math.min(Math.max(0, buffer().duration - .001), Number(event.target.value) || 0));
    save();
  };
  root.querySelector('#samplerEnd').onchange = event => {
    sampler.end = Math.max(sampler.start + .001, Math.min(buffer().duration, Number(event.target.value) || buffer().duration));
    save();
  };
  track.fx ||= {filterType:'lowpass', cutoff:20000, delay:0, delayTime:.25, feedback:.25};
  root.querySelector('#filterType').value = track.fx.filterType;
  for (const [id, key] of [['filterCutoff','cutoff'],['delayMix','delay'],['delayTime','delayTime'],['delayFeedback','feedback']]) {
    root.querySelector(`#${id}`).oninput = event => {
      track.fx[key] = Number(event.target.value);
      engine.syncTracks(tracks);
      save();
    };
  }
  root.querySelector('#filterType').onchange = event => { track.fx.filterType = event.target.value; engine.syncTracks(tracks); save(); };
  root.querySelectorAll('.piano-cell').forEach(cell => {
    cell.onclick = () => {
      const beat = Number(cell.dataset.beat), midi = Number(cell.dataset.midi);
      const displayStep = grid || .0625;
      const index = notes.findIndex(note => note.midi === midi && note.beat >= beat && note.beat < beat + displayStep);
      if (index >= 0) selectedCell = {trackId:track.id,beat:notes[index].beat,midi};
      else {
        const note = {beat:snapBeats(beat, grid),midi,durationBeats:Number(root.querySelector('#noteLength').value)||.25,velocity:.85};
        notes.push(note);
        selectedCell = {trackId:track.id,beat:note.beat,midi};
      }
      notes.sort((a, b) => a.beat - b.beat);
      track.pattern = {notes};
      save();
      setGrid(grid);
      engine.previewNote(track,buffers,midi,.3,tracks).catch(error=>notify(`Preview failed: ${error.message}`));
    };
  });
  root.querySelectorAll('[data-preview-midi]').forEach(key=>key.onclick=()=>engine.previewNote(track,buffers,+key.dataset.previewMidi,.4,tracks).catch(error=>notify(`Preview failed: ${error.message}`)));
}
