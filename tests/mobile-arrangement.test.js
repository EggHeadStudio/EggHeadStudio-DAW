import test from 'node:test';
import assert from 'node:assert/strict';
import {arrangementGesture} from '../src/arrangement-workspace.js';
import {ArrangementHistory,copyTimeRange,pasteTimeRange} from '../src/arrangement.js';
import {clipDurationSeconds} from '../src/audio.js';
import {instrumentFixture} from './instrument-fixture.js';

class PointerSurface extends EventTarget {
  setPointerCapture(id){this.pointer=id}
  hasPointerCapture(id){return this.pointer===id}
  releasePointerCapture(id){if(this.pointer===id)this.pointer=null}
  send(type,id=1){const event=new Event(type);Object.assign(event,{pointerId:id,clientX:12});this.dispatchEvent(event)}
}
const down=(id=1,extra={})=>({button:0,pointerId:id,isPrimary:true,preventDefault(){},stopPropagation(){},...extra});

test('Arrangement pointer cancellation restores the draft without committing or retaining capture',()=>{
  for(const abort of ['pointercancel','lostpointercapture']){
    const surface=new PointerSurface();let draft=4,commits=0,cancels=0;
    arrangementGesture(surface,down(),()=>draft=8,()=>commits++,()=>{draft=4;cancels++});
    surface.send('pointermove',2);assert.equal(draft,4);
    surface.send('pointermove');assert.equal(draft,8);
    surface.send(abort);assert.equal(draft,4);assert.equal(cancels,1);assert.equal(commits,0);
    assert.equal(surface.hasPointerCapture(1),false);
    surface.send('pointermove');surface.send('pointerup');assert.equal(draft,4);assert.equal(cancels,1);assert.equal(commits,0);
  }
});

test('Arrangement pointer completion commits once and ignores unrelated pointers',()=>{
  const surface=new PointerSurface();let moves=0,commits=0,cancels=0;
  arrangementGesture(surface,down(),()=>moves++,()=>commits++,()=>cancels++);
  surface.send('pointerup',2);assert.equal(commits,0);
  surface.send('pointermove');surface.send('pointerup');surface.send('lostpointercapture');surface.send('pointerup');
  assert.equal(moves,1);assert.equal(commits,1);assert.equal(cancels,0);
});

test('Arrangement secondary contacts and non-primary buttons do not capture or start edits',()=>{
  for(const event of [down(2,{isPrimary:false}),down(1,{button:2})]){
    const surface=new PointerSurface();let called=false;
    arrangementGesture(surface,event,()=>called=true,()=>called=true,()=>called=true);
    surface.send('pointermove');surface.send('pointerup');assert.equal(called,false);assert.equal(surface.pointer,undefined);
  }
});

test('mobile mixed section duplication at 90 BPM preserves audio phase, fades, gains and independent patterns',()=>{
  const {project,audio,sampler,id}=instrumentFixture();project.bpm=90;
  Object.assign(audio.clips[0],{loop:true,duration:12,rate:1.25,loopOffset:.125,gain:.65,fadeIn:.25,fadeOut:.5,envelopeOffset:.1,envelopeDuration:14});
  const selection={startBeat:5,endBeat:14,firstTrack:0,lastTrack:2},clipboard=copyTimeRange(project.tracks,selection,90);
  const before=JSON.stringify(project.tracks),history=new ArrangementHistory();history.checkpoint(project.tracks,project);
  const copies=pasteTimeRange(project.tracks,clipboard,24,0,id);
  assert.equal(clipboard.durationBeats,9);assert.equal(clipboard.trackCount,3);
  for(const [index,entry]of clipboard.entries.entries()){
    const copy=copies[index];assert.equal(copy.bar*4,24+entry.relativeBeat);
    for(const key of ['asset','loop','rate','loopOffset','gain','fadeIn','fadeOut','envelopeOffset','envelopeDuration','offsetBeats','durationBeats'])assert.equal(copy[key],entry.clip[key],key);
    assert.equal(clipDurationSeconds(copy,90)*90/60,clipDurationSeconds(entry.clip,90)*90/60);
    if(copy.kind==='instrument'){
      const track=project.tracks[entry.trackOffset],pattern=track.patterns.find(p=>p.id===copy.patternId);
      assert.notEqual(copy.patternId,entry.clip.patternId);
      assert.deepEqual(pattern.notes.map(({id,...note})=>note),entry.pattern.notes.map(({id,...note})=>note));
    }
  }
  const after=JSON.stringify(project.tracks);assert.equal(history.undo(project.tracks,project),true);assert.equal(JSON.stringify(project.tracks),before);
  assert.equal(history.redo(project.tracks,project),true);assert.equal(JSON.stringify(project.tracks),after);
  assert.equal(sampler.clips.length,4);
});

test('section destination validation rejects incompatible track bounds before adding any copied clips',()=>{
  const {project,id}=instrumentFixture(),clipboard=copyTimeRange(project.tracks,{startBeat:0,endBeat:16,firstTrack:1,lastTrack:2},90),before=JSON.stringify(project);
  assert.throws(()=>pasteTimeRange(project.tracks,clipboard,24,0,id),/Incompatible/);
  assert.equal(JSON.stringify(project),before);
  assert.throws(()=>pasteTimeRange(project.tracks,clipboard,24,2,id),/enough/);
  assert.equal(JSON.stringify(project),before);
});
