import test from 'node:test';
import assert from 'node:assert/strict';
import {MOBILE_WORKSPACES,WorkspaceNavigation} from '../src/mobile-workspace.js';
import {PianoNoteEditor} from '../src/piano-model.js';

test('mobile workspace catalog exposes all existing production workspaces',()=>{
  assert.deepEqual(MOBILE_WORKSPACES.map(([key])=>key),['arrange','keys','rack','sample','recording','master','export']);
});
test('workspace navigation shares one current location and respects capture guards',()=>{
  const navigation=new WorkspaceNavigation();
  assert.equal(navigation.visit('sample'),true);
  assert.equal(navigation.visit('recording',true),false);assert.equal(navigation.current,'sample');
  assert.equal(navigation.back(true),null);assert.equal(navigation.current,'sample');
  assert.equal(navigation.back(),'arrange');assert.equal(navigation.back(),null);
  assert.equal(navigation.visit('unknown'),false);assert.equal(navigation.visit('arrange'),false);
});
test('internal workspace changes join bounded transient Back history',()=>{
  const navigation=new WorkspaceNavigation();
  navigation.sync('keys');navigation.sync('keys');assert.deepEqual(navigation.history,['arrange']);
  navigation.sync('sample');assert.equal(navigation.back(),'keys');
  for(let i=0;i<100;i++)navigation.visit(i%2?'sample':'arrange');
  assert.equal(navigation.history.length,32);
});
test('cancelled note gestures restore notes, selection and Undo/Redo history',()=>{
  const notes=[{id:'a',beat:1,midi:60,durationBeats:1,velocity:.8}];
  const editor=new PianoNoteEditor(notes);editor.selected.add('a');editor.moveSelected(1,1);editor.undo();
  const snapshot=editor.gestureSnapshot(),reference=editor.notes;
  editor.select(['a']);editor.checkpoint();notes[0].beat=7;notes[0].midi=70;notes[0].durationBeats=2;
  editor.cancelGesture(snapshot);
  assert.equal(editor.notes,reference);assert.deepEqual(notes,snapshot.notes);assert.equal(editor.redoStack.length,1);
  assert.equal(editor.selected.size,0);assert.equal(editor.redo(),true);assert.equal(notes[0].beat,2);
});
test('cancelled velocity gestures preserve a full history without losing oldest transaction',()=>{
  const notes=[{id:'a',beat:0,midi:60,durationBeats:1,velocity:.8}],editor=new PianoNoteEditor(notes);
  for(let i=0;i<100;i++){editor.checkpoint();notes[0].beat=i/4}
  editor.selected.add('a');const snapshot=editor.gestureSnapshot();
  editor.checkpoint();notes[0].velocity=.1;editor.cancelGesture(snapshot);
  assert.equal(notes[0].velocity,.8);assert.equal(editor.undoStack.length,100);
  assert.equal(editor.undoStack[0],snapshot.undo[0]);assert.deepEqual([...editor.selected],['a']);
});
