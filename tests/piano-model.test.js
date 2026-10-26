import test from 'node:test';
import assert from 'node:assert/strict';
import {PianoNoteEditor} from '../src/piano-model.js';

test('piano editor adds, selects, removes, and restores notes',()=>{
  const notes=[];
  const editor=new PianoNoteEditor(notes);
  const note=editor.add({beat:1,midi:60,durationBeats:1,velocity:.8});
  assert.equal(notes.length,1);
  assert.equal(editor.selected.has(note.id),true);
  assert.equal(editor.removeSelected(),true);
  assert.equal(notes.length,0);
  assert.equal(editor.undo(),true);
  assert.equal(notes.length,1);
  assert.equal(editor.redo(),true);
  assert.equal(notes.length,0);
});

test('piano editor moves and quantizes selected notes within the pattern',()=>{
  const notes=[{id:'a',beat:1.1,midi:60,durationBeats:.5,velocity:.8},{id:'b',beat:2,midi:64,durationBeats:.5,velocity:.7}];
  const editor=new PianoNoteEditor(notes);
  editor.select(['a','b']);
  assert.equal(editor.quantize(.25),true);
  assert.equal(notes[0].beat,1);
  editor.moveSelected(1,2,.25);
  assert.equal(notes[0].beat,2);
  assert.equal(notes[1].beat,3);
  assert.equal(notes[0].midi,62);
});

test('piano editor duplicates selected notes with new identities',()=>{
  const notes=[{id:'a',beat:0,midi:48,durationBeats:1,velocity:.8}];
  const editor=new PianoNoteEditor(notes);
  editor.select(['a']);
  assert.equal(editor.duplicate(.25),true);
  assert.equal(notes.length,2);
  assert.equal(notes[1].beat,1);
  assert.notEqual(notes[1].id,'a');
});

test('piano editor keeps added, moved, and pasted notes inside the pattern',()=>{
  const notes=[{id:'a',beat:63,midi:60,durationBeats:1,velocity:.8}];
  const editor=new PianoNoteEditor(notes);
  editor.select(['a']);
  editor.moveSelected(8,0,0,64);
  assert.equal(notes[0].beat,63);
  editor.copy();
  assert.equal(editor.paste(64,0,64),false);
  const added=editor.add({beat:64,midi:60,durationBeats:8,velocity:.8},64);
  assert.ok(added.beat+added.durationBeats<=64);
});
