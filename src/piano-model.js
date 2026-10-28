import {snapBeats} from './music.js';

const cloneNotes = notes => notes.map(note => ({...note}));

export class PianoNoteEditor {
  constructor(notes = []) {
    this.notes = notes;
    this.selected = new Set();
    this.clipboard = [];
    this.undoStack = [];
    this.redoStack = [];
    this.ensureIds();
  }

  ensureIds() {
    for (const note of this.notes) note.id ||= crypto.randomUUID();
  }

  checkpoint() {
    this.undoStack.push(cloneNotes(this.notes));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  add(note, patternBeats = 64) {
    this.checkpoint();
    const beat = Math.max(0, Math.min(patternBeats - 0.0625, Number(note.beat) || 0));
    const durationBeats = Math.max(0.0625, Math.min(Number(note.durationBeats) || 0.25, patternBeats - beat));
    const velocity=Number(note.velocity);
    const created = {...note, beat, durationBeats, midi:Math.max(0,Math.min(127,Number(note.midi)||0)), velocity:Number.isFinite(velocity)?Math.max(0,Math.min(1,velocity)):.85, id: crypto.randomUUID()};
    this.notes.push(created);
    this.selected = new Set([created.id]);
    return created;
  }

  select(ids, additive = false) {
    this.selected = new Set(additive ? [...this.selected, ...ids] : ids);
  }

  removeSelected() {
    if (!this.selected.size) return false;
    this.checkpoint();
    this.notes.splice(0, this.notes.length, ...this.notes.filter(note => !this.selected.has(note.id)));
    this.selected.clear();
    return true;
  }

  moveSelected(beatDelta, midiDelta, grid = 0, patternBeats = 64) {
    const selected = this.notes.filter(note => this.selected.has(note.id));
    if (!selected.length) return false;
    this.checkpoint();
    const minBeat = Math.min(...selected.map(note => note.beat));
    const maxEnd = Math.max(...selected.map(note => note.beat + note.durationBeats));
    const destination = snapBeats(Math.max(0, minBeat + beatDelta), grid);
    const offset = Math.max(-minBeat, Math.min(patternBeats - maxEnd, destination - minBeat));
    for (const note of selected) {
      note.beat = Math.max(0, Math.min(patternBeats - 0.001, note.beat + offset));
      note.midi = Math.max(0, Math.min(127, note.midi + midiDelta));
    }
    return true;
  }

  resizeSelected(duration, grid = 0, patternBeats = 64) {
    const note = this.notes.find(item => this.selected.has(item.id));
    if (!note) return false;
    this.checkpoint();
    note.durationBeats = Math.max(grid || 0.0625, snapBeats(duration, grid));
    note.durationBeats = Math.min(note.durationBeats, patternBeats - note.beat);
    return true;
  }

  setVelocity(value) {
    const selected = this.notes.filter(note => this.selected.has(note.id));
    if (!selected.length) return false;
    this.checkpoint();
    for (const note of selected) note.velocity = Math.max(0, Math.min(1, value));
    return true;
  }

  quantize(grid, patternBeats = 64) {
    if (!grid || !this.selected.size) return false;
    this.checkpoint();
    for (const note of this.notes) {
      if (!this.selected.has(note.id)) continue;
      note.beat = Math.max(0,Math.min(patternBeats - Math.min(patternBeats,note.durationBeats), snapBeats(note.beat, grid)));
    }
    return true;
  }

  copy() {
    const notes = this.notes.filter(note => this.selected.has(note.id));
    if (!notes.length) return false;
    const origin = Math.min(...notes.map(note => note.beat));
    this.clipboard = notes.map(note => ({...note, beat:note.beat-origin}));
    return true;
  }

  paste(atBeat = 0, grid = 0, patternBeats = 64) {
    if (!this.clipboard.length) return false;
    const start = snapBeats(Math.max(0, atBeat), grid);
    const pasted = this.clipboard
      .map(note => ({...note, id:crypto.randomUUID(), beat:start+note.beat}))
      .filter(note => note.beat < patternBeats)
      .map(note => ({...note,durationBeats:Math.min(note.durationBeats,patternBeats-note.beat)}));
    if (!pasted.length) return false;
    this.checkpoint();
    this.notes.push(...pasted);
    this.selected = new Set(pasted.map(note => note.id));
    return true;
  }

  duplicate(grid = 0, patternBeats = 64) {
    if (!this.copy()) return false;
    const end = Math.max(...this.notes.filter(note => this.selected.has(note.id)).map(note => note.beat+note.durationBeats));
    return this.paste(Math.min(patternBeats-.001, end), grid, patternBeats);
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(cloneNotes(this.notes));
    this.notes.splice(0, this.notes.length, ...this.undoStack.pop());
    this.selected.clear();
    this.ensureIds();
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(cloneNotes(this.notes));
    this.notes.splice(0, this.notes.length, ...this.redoStack.pop());
    this.selected.clear();
    this.ensureIds();
    return true;
  }
}
