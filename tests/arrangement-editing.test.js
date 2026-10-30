import test from 'node:test';
import assert from 'node:assert/strict';
import {SampleEditor} from '../src/sample-editor.js';
import {TimelineScale,anchoredTimelineScrollLeft,clipViewportWindow,draggedClipStart,editLoopRegion,pinchZoomValue,playheadBeatAtSeconds,timelineBeatsAtClientX} from '../src/timeline.js';
import {ArrangementHistory,copyTimeRange,deleteTimeRange,normalizeTimeSelection,pasteTimeRange,resizeClipAtBeat,sliceAudioClip,splitClipAtTime} from '../src/arrangement.js';
import {clipDurationSeconds,scheduleClipSource,toWav} from '../src/audio.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {normalizeArrangementLoop,parseProject} from '../src/project-state.js';

const context={createBuffer(channels,length,sampleRate){
  const data=Array.from({length:channels},()=>new Float32Array(length));
  return{length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:index=>data[index]};
}};
const makeSource=()=>{
  const buffer=context.createBuffer(1,44100,44100),data=buffer.getChannelData(0);
  for(let frame=0;frame<data.length;frame++)data[frame]=.25*Math.sin(frame*.1+.7);
  return buffer;
};
let nextId=0;const id=()=>`edit-${++nextId}`;
const tracks=()=>[{id:'a',clips:[{id:'one',asset:'audio',bar:0,start:0,end:8,rate:1,gain:.7,fadeIn:1,fadeOut:2}]},{id:'b',clips:[{id:'two',asset:'audio',bar:1,start:1,end:3,rate:2,gain:.4}]},{id:'c',clips:[]},{id:'d',clips:[]}];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('long clip waveform windows remain viewport-bounded and track scrolled source fractions',()=>{
  assert.deepEqual(clipViewportWindow(-10000,50000,0,390),{offset:10000,width:390,start:.2,end:10390/50000});
  assert.deepEqual(clipViewportWindow(100,50,0,390),{offset:0,width:50,start:0,end:1});
  assert.equal(clipViewportWindow(500,50000,0,390),null);
  assert.equal(clipViewportWindow(-50000,100,0,390),null);
  assert.equal(clipViewportWindow(0,0,0,390),null);
});

test('zero snapping preserves absolute frame 0 and exclusive frame N at either edge',()=>{
  const editor=new SampleEditor(makeSource());
  assert.equal(editor.nearestZeroCrossing(0),0);
  assert.equal(editor.nearestZeroCrossing(editor.frameCount),editor.frameCount);
  editor.setBoundary('start',100,true);editor.setBoundary('start',0,true);
  editor.setBoundary('end',editor.frameCount-100,true);editor.setBoundary('end',editor.frameCount,true);
  assert.deepEqual(editor.selection,{start:0,end:44100});
});

test('numeric and fine frame boundaries remain exact without interior zero snap',()=>{
  const editor=new SampleEditor(makeSource());
  assert.equal(editor.setBoundary('start',1),1);
  assert.equal(editor.setBoundary('end',44099),44099);
  editor.setBoundary('start',0);editor.setBoundary('end',editor.duration*editor.buffer.sampleRate);
  assert.deepEqual(editor.selection,{start:0,end:44100});
  assert.throws(()=>editor.setBoundary('start',NaN),RangeError);
});

test('full selection renders and exports every source frame without changing PCM',()=>{
  const source=makeSource(),editor=new SampleEditor(source),output=editor.renderSelection(context);
  assert.equal(output.length,source.length);
  assert.deepEqual(output.getChannelData(0),source.getChannelData(0));
  const wav=toWav(output);assert.equal(wav.size,44+source.length*2);
});

test('shared timeline conversion includes actual scrolled ruler origin at every zoom',()=>{
  for(const zoom of [.4,1,2.5,4]){
    const scale=new TimelineScale(137,39*zoom),ruler={getBoundingClientRect:()=>({left:125-700})},scroll={scrollLeft:700};
    near(timelineBeatsAtClientX(125,ruler,scroll,scale),700/(39*zoom));
    near(scale.beatsToSeconds(scale.secondsToBeats(12.345)),12.345);
    near(scale.pixelsToBeats(scale.beatsToPixels(123.456)),123.456);
  }
});

test('clip left edge snaps independently of center/right/left grab offsets',()=>{
  for(const offset of [.01,2,3.9])for(const zoom of [.4,1,4]){
    const scale=new TimelineScale(120,39*zoom),intended=8.14;
    const pointer=scale.pixelsToBeats(scale.beatsToPixels(intended+offset));
    assert.equal(draggedClipStart(pointer,offset,.25),8.25);
    near(draggedClipStart(pointer,offset,0),intended);
  }
  assert.equal(draggedClipStart(1,3,.25),0);
});

test('playhead sample insertion uses the selected snap grid in beat coordinates',()=>{
  assert.equal(playheadBeatAtSeconds(2.07,120,.25),4.25);
  assert.equal(playheadBeatAtSeconds(2.07,120,.5),4);
  assert.equal(playheadBeatAtSeconds(2.07,120,0),4.14);
  assert.throws(()=>playheadBeatAtSeconds(-.01,120,.25),RangeError);
  assert.throws(()=>playheadBeatAtSeconds(1,0,.25),RangeError);
});

test('pinch zoom clamps scale and keeps its musical anchor stable across zoom and scroll',()=>{
  assert.equal(pinchZoomValue(1,100,50),.5);
  assert.equal(pinchZoomValue(1,100,1000),4);
  assert.equal(pinchZoomValue(2,100,1),.4);
  for(const zoom of [.4,1,2.5,4])for(const scrollLeft of [0,260,1340]){
    const scale=new TimelineScale(123,39*zoom),anchorClientX=253,rulerContentLeft=80,rulerLeft=rulerContentLeft-scrollLeft;
    const anchorBeat=scale.pixelsToBeats(anchorClientX-rulerLeft);
    const nextZoom=pinchZoomValue(zoom,120,173),nextScale=new TimelineScale(123,39*nextZoom);
    const nextLeft=anchoredTimelineScrollLeft(anchorBeat,anchorClientX,rulerContentLeft,nextScale.pixelsPerBeat);
    const nextRulerLeft=rulerContentLeft-nextLeft,restoredBeat=nextScale.pixelsToBeats(anchorClientX-nextRulerLeft);
    near(restoredBeat,anchorBeat);
  }
});

test('loop brace snaps edges, preserves length while moving, and prevents inversion',()=>{
  assert.deepEqual(editLoopRegion({start:4,end:12},'move',8.14,.25),{start:8.25,end:16.25});
  assert.deepEqual(editLoopRegion({start:4,end:12},'start',5.14,.25),{start:5.25,end:12});
  assert.deepEqual(editLoopRegion({start:4,end:12},'end',3,.25),{start:4,end:4.25});
  assert.deepEqual(editLoopRegion({start:0,end:.01},'start',0,.25),{start:0,end:.01});
});

test('legacy projects receive valid bar-based loop defaults without dropping clip properties',()=>{
  const project=normalizeArrangementLoop(parseProject(JSON.stringify({bpm:123,tracks:tracks(),loopStart:-1,loopEnd:NaN})));
  assert.equal(project.loopStart,0);assert.equal(project.loopEnd,4);assert.equal(project.loop,false);
  assert.deepEqual(project.tracks,tracks());
});

test('audio right trim/reveal keeps left position, source start, speed and pitch',()=>{
  const clip={bar:1,start:1,end:5,rate:2};
  resizeClipAtBeat(clip,'end',8,8,120);
  assert.deepEqual(clip,{bar:1,start:1,end:5,rate:2});
  resizeClipAtBeat(clip,'end',6,8,120);
  assert.equal(clip.end,3);assert.equal(clip.start,1);assert.equal(clip.rate,2);assert.equal(clip.bar,1);
  resizeClipAtBeat(clip,'end',100,8,120);
  assert.equal(clip.end,8);assert.equal(clip.loop,undefined);
});

test('audio left trim preserves right edge, source offset and nonnegative start',()=>{
  const clip={bar:2,start:1,end:5,rate:2},right=clip.bar*4+clipDurationSeconds(clip)*2;
  resizeClipAtBeat(clip,'start',9,8,120);
  near(clip.bar*4+clipDurationSeconds(clip)*2,right);assert.equal(clip.start,2);assert.equal(clip.rate,2);
  resizeClipAtBeat(clip,'start',0,8,120);
  assert.equal(clip.start,0);assert.ok(clip.bar>=0);near(clip.bar*4+clipDurationSeconds(clip)*2,right);
});

test('range normalization supports reverse gestures and multiple tracks',()=>{
  assert.deepEqual(normalizeTimeSelection(12,4,3,1),{startBeat:4,endBeat:12,firstTrack:1,lastTrack:3});
});

test('multi-track copy slices intersections, preserves track gaps, gain and source offsets',()=>{
  const original=tracks(),before=JSON.stringify(original),range=normalizeTimeSelection(4,8,0,1),clipboard=copyTimeRange(original,range,120);
  assert.equal(clipboard.durationBeats,4);assert.equal(clipboard.trackCount,2);assert.equal(clipboard.entries.length,2);
  assert.equal(clipboard.entries[0].clip.start,2);assert.equal(clipboard.entries[0].clip.end,4);
  assert.equal(clipboard.entries[0].clip.gain,.7);assert.equal(clipboard.entries[1].clip.start,1);assert.equal(clipboard.entries[1].clip.end,3);
  assert.equal(JSON.stringify(original),before);
  const pasted=pasteTimeRange(original,clipboard,16,2,id);
  assert.equal(pasted[0].bar,4);assert.equal(pasted[1].bar,4);assert.notEqual(pasted[0].id,'one');
  assert.equal(original[2].clips[0].asset,'audio');assert.equal(original[3].clips[0].asset,'audio');
});

test('duplicate uses the full selected time including empty trailing gaps',()=>{
  const original=tracks(),selection=normalizeTimeSelection(0,20,1,1),clipboard=copyTimeRange(original,selection,120);
  const [copy]=pasteTimeRange(original,clipboard,selection.endBeat,1,id);
  assert.equal(copy.bar,6);assert.equal(clipboard.durationBeats,20);
});

test('out-of-range paste rejects before mutating any track',()=>{
  const original=tracks(),before=JSON.stringify(original),clipboard=copyTimeRange(original,normalizeTimeSelection(0,8,0,1),120);
  assert.throws(()=>pasteTimeRange(original,clipboard,8,3,id),/enough/);assert.equal(JSON.stringify(original),before);
});

test('delete splits intersections without ripple and history restores whole operation',()=>{
  const original=tracks(),history=new ArrangementHistory(),before=JSON.stringify(original),project={loop:false,loopStart:0,loopEnd:4};
  history.checkpoint(original,project);deleteTimeRange(original,normalizeTimeSelection(4,8,0,1),120,id);project.loop=true;
  assert.equal(original[0].clips.length,2);assert.equal(original[0].clips[0].end,2);assert.equal(original[0].clips[1].bar,2);assert.equal(original[0].clips[1].start,4);
  assert.equal(original[1].clips.length,0);
  history.undo(original,project);assert.equal(JSON.stringify(original),before);assert.equal(project.loop,false);
  history.redo(original,project);assert.equal(original[1].clips.length,0);assert.equal(project.loop,true);
});

test('project replacement clears history so undo cannot restore another project',()=>{
  const history=new ArrangementHistory(),original=tracks();
  history.checkpoint(original);original[0].clips=[];history.undo(original);
  history.clear();assert.equal(history.undo(original),false);assert.equal(history.redo(original),false);
  assert.equal(history.undoStack.length,0);assert.equal(history.redoStack.length,0);
});

test('clip undo leaves tracks created after its checkpoint untouched',()=>{
  const history=new ArrangementHistory(),original=tracks();
  history.checkpoint(original);original[0].clips[0].bar=3;
  original.push({id:'later',clips:[{id:'later-clip',asset:'audio',bar:2,start:0,end:1}]});
  history.undo(original);
  assert.equal(original[0].clips[0].bar,0);assert.equal(original.at(-1).clips[0].id,'later-clip');
});

test('cut and re-paste preserve every overlapping clip rather than deduplicating audible layers',()=>{
  const project=[{id:'bass',clips:[
    {id:'original',asset:'audio',bar:3,start:0,end:3,rate:1},
    {id:'pasted',asset:'audio',bar:4,start:0,end:2,rate:1}
  ]}],range=normalizeTimeSelection(16,20,0,0);
  const sampleAt=beat=>project[0].clips.reduce((sum,clip)=>{
    const time=(beat-clip.bar*4)/2;
    return sum+(time>=0&&time<clipDurationSeconds(clip)?Math.sin(clip.start+time):0);
  },0);
  const positions=[14,16.5,17.5,18.5,19.5,20.5],before=positions.map(sampleAt);
  const clipboard=copyTimeRange(project,range,120);
  assert.equal(clipboard.entries.length,2);
  deleteTimeRange(project,range,120,id);assert.equal(project[0].clips.length,1);
  pasteTimeRange(project,clipboard,16,0,id);assert.equal(project[0].clips.length,3);
  positions.map(sampleAt).forEach((value,index)=>near(value,before[index]));
});

test('sliced loop and split retain cycle phase, source region and gain envelope',()=>{
  const clip={id:'loop',bar:1,start:1,end:3,loop:true,duration:8,rate:2,fadeIn:2,fadeOut:1,gain:.8};
  const copy=sliceAudioClip(clip,.75,3,120,'copy');
  assert.equal(copy.start,1);assert.equal(copy.end,3);assert.equal(copy.loopOffset,1.5);assert.equal(copy.duration,2.25);assert.equal(copy.envelopeOffset,.75);
  const original=[{id:'a',clips:[clip]}],right=splitClipAtTime(original,'a','loop',2.75,120,id);
  assert.equal(right.loopOffset,1.5);assert.equal(right.envelopeOffset,.75);assert.equal(clip.envelopeDuration,8);
});

test('live/offline shared scheduling applies loop phase and sliced fade position',()=>{
  const scheduled=[],automation=[],source={start:(...args)=>scheduled.push(['start',...args]),stop:(...args)=>scheduled.push(['stop',...args])};
  const gain={gain:{setValueAtTime:(...args)=>automation.push(['set',...args]),linearRampToValueAtTime:(...args)=>automation.push(['ramp',...args])}};
  const clip=sliceAudioClip({bar:0,start:1,end:3,loop:true,duration:8,rate:2,gain:1,fadeIn:2},.75,1,120,'sliced');
  scheduleClipSource({},source,gain,clip,10);
  assert.deepEqual(scheduled,[['start',10,2.5],['stop',10.25]]);
  assert.deepEqual(automation,[['set',.375,10],['ramp',.5,10.25]]);
});

test('loop left trim keeps right edge and does not alter source cycle',()=>{
  const clip={bar:0,start:1,end:3,rate:1,loop:true,duration:8};
  resizeClipAtBeat(clip,'start',3,10,120);
  assert.equal(clip.loopOffset,1.5);assert.equal(clip.duration,6.5);assert.equal(clip.bar,.75);assert.equal(clip.start,1);assert.equal(clip.end,3);
});

test('EHS v1 retains sliced loop phase, selection-independent edits and old clip fields',async()=>{
  const source=makeSource(),clip={id:'one',asset:'source',bar:0,start:0,end:1,rate:1,loop:true,duration:3,gain:.5,fadeIn:1,legacyProperty:'keep'};
  const project={name:'Editing roundtrip',bpm:120,loop:true,loopStart:1,loopEnd:3,tracks:[{id:'a',clips:[sliceAudioClip(clip,.25,2,120,'copy')]}]};
  const archive=await createPortableProjectArchive(project,{assetFiles:new Map([['source',toWav(source)]])});
  const restored=await openPortableProjectArchive(archive,{useWorker:false});
  assert.equal(restored.manifest.formatVersion,1);assert.deepEqual(restored.project.tracks,project.tracks);assert.equal(restored.project.loopStart,1);
});
