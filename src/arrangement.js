import {clipDurationSeconds} from './audio.js';

const copyClips=tracks=>tracks.map(track=>({id:track.id,clips:(track.clips||[]).map(clip=>({...clip}))}));

export class ArrangementHistory {
  constructor(limit=100){this.limit=limit;this.undoStack=[];this.redoStack=[]}
  clear(){this.undoStack=[];this.redoStack=[]}
  checkpoint(tracks,project){
    const snapshot=copyClips(tracks);
    if(project)snapshot.loop={loop:project.loop,loopStart:project.loopStart,loopEnd:project.loopEnd};
    this.undoStack.push(snapshot);
    if(this.undoStack.length>this.limit)this.undoStack.shift();
    this.redoStack=[];
  }
  restore(tracks,snapshot,project){
    const saved=new Map(snapshot.map(track=>[track.id,track.clips]));
    for(const track of tracks)if(saved.has(track.id))track.clips=saved.get(track.id).map(clip=>({...clip}));
    if(project&&snapshot.loop)Object.assign(project,snapshot.loop);
  }
  undo(tracks,project){
    if(!this.undoStack.length)return false;
    const current=copyClips(tracks);if(project)current.loop={loop:project.loop,loopStart:project.loopStart,loopEnd:project.loopEnd};
    this.redoStack.push(current);
    this.restore(tracks,this.undoStack.pop(),project);
    return true;
  }
  redo(tracks,project){
    if(!this.redoStack.length)return false;
    const current=copyClips(tracks);if(project)current.loop={loop:project.loop,loopStart:project.loopStart,loopEnd:project.loopEnd};
    this.undoStack.push(current);
    this.restore(tracks,this.redoStack.pop(),project);
    return true;
  }
}

export function splitClipAtTime(tracks,trackId,clipId,timeSeconds,bpm,idFactory){
  const track=tracks.find(item=>item.id===trackId),index=track?.clips.findIndex(item=>item.id===clipId)??-1;
  if(index<0||!Number.isFinite(timeSeconds)||!Number.isFinite(bpm)||bpm<=0)return false;
  const clip=track.clips[index],clipStart=clip.bar*240/bpm,clipDuration=clipDurationSeconds(clip);
  if(timeSeconds<=clipStart||timeSeconds>=clipStart+clipDuration)return false;
  const elapsed=timeSeconds-clipStart;
  const right=sliceAudioClip(clip,elapsed,clipDuration,bpm,idFactory());
  Object.assign(clip,sliceAudioClip(clip,0,elapsed,bpm,clip.id));
  track.clips.splice(index+1,0,right);
  return right;
}

export function moveClipTo(tracks,clipId,targetTrackId,bar){
  const source=tracks.find(track=>track.clips.some(clip=>clip.id===clipId)),target=tracks.find(track=>track.id===targetTrackId);
  if(!source||!target||!Number.isFinite(bar)||bar<0)return false;
  const clip=source.clips.find(item=>item.id===clipId);
  if(source!==target){source.clips=source.clips.filter(item=>item.id!==clipId);target.clips.push(clip)}
  clip.bar=bar;
  return true;
}

export function resizeClipBoundary(clip,edge,sourceSeconds,assetDuration,bpm){
  if(!clip||!Number.isFinite(sourceSeconds)||!Number.isFinite(assetDuration)||assetDuration<=0||!Number.isFinite(bpm)||bpm<=0)return false;
  if(edge==='start'){
    const next=Math.max(0,Math.min(clip.end-.001,sourceSeconds));
    clip.bar+=(next-clip.start)/(clip.rate||1)/(240/bpm);
    clip.start=next;
  }else if(edge==='end'){
    clip.end=Math.max(clip.start+.001,Math.min(assetDuration,sourceSeconds));
  }else return false;
  return true;
}

export function duplicateClip(tracks,trackId,clipId,bpm,idFactory){
  const track=tracks.find(item=>item.id===trackId),clip=track?.clips.find(item=>item.id===clipId);
  if(!clip||!Number.isFinite(bpm)||bpm<=0)return null;
  const copy={...clip,id:idFactory(),bar:clip.bar+clipDurationSeconds(clip)/(240/bpm)};
  track.clips.push(copy);
  return copy;
}

export function normalizeTimeSelection(startBeat,endBeat,firstTrack,lastTrack){
  if(![startBeat,endBeat,firstTrack,lastTrack].every(Number.isFinite))throw new RangeError('Selection coordinates must be finite.');
  return{startBeat:Math.max(0,Math.min(startBeat,endBeat)),endBeat:Math.max(0,Math.max(startBeat,endBeat)),firstTrack:Math.max(0,Math.min(firstTrack,lastTrack)),lastTrack:Math.max(0,Math.max(firstTrack,lastTrack))};
}

export function sliceAudioClip(clip,fromSeconds,toSeconds,bpm,id){
  const duration=clipDurationSeconds(clip),from=Math.max(0,fromSeconds),to=Math.min(duration,toSeconds),rate=clip.rate||1;
  if(to<=from)return null;
  const result={...clip,id,bar:clip.bar+from*bpm/240,envelopeOffset:(clip.envelopeOffset||0)+from,envelopeDuration:clip.envelopeDuration??duration};
  if(clip.loop){
    result.duration=to-from;
    result.loopOffset=((clip.loopOffset||0)+from*rate)%(clip.end-clip.start);
  }else{
    result.start=clip.start+from*rate;result.end=clip.start+to*rate;
  }
  return result;
}

export function copyTimeRange(tracks,selection,bpm){
  const secondsPerBeat=60/bpm,entries=[];
  for(let index=selection.firstTrack;index<=selection.lastTrack;index++){
    const track=tracks[index];if(!track)continue;
    for(const clip of track.clips||[]){
      const startBeat=clip.bar*4,from=Math.max(selection.startBeat,startBeat),to=Math.min(selection.endBeat,startBeat+clipDurationSeconds(clip)/secondsPerBeat);
      if(to<=from)continue;
      entries.push({trackOffset:index-selection.firstTrack,relativeBeat:from-selection.startBeat,clip:sliceAudioClip(clip,(from-startBeat)*secondsPerBeat,(to-startBeat)*secondsPerBeat,bpm,clip.id)});
    }
  }
  return{durationBeats:selection.endBeat-selection.startBeat,trackCount:selection.lastTrack-selection.firstTrack+1,entries};
}

export function pasteTimeRange(tracks,clipboard,atBeat,firstTrack,idFactory){
  if(!Number.isFinite(atBeat)||atBeat<0||!Number.isInteger(firstTrack)||firstTrack<0)throw new RangeError('Invalid paste destination.');
  if(firstTrack+clipboard.trackCount>tracks.length)throw new Error('The destination needs enough existing tracks for this range.');
  const additions=clipboard.entries.map(entry=>({track:tracks[firstTrack+entry.trackOffset],clip:{...entry.clip,id:idFactory(),bar:(atBeat+entry.relativeBeat)/4}}));
  for(const entry of additions)entry.track.clips.push(entry.clip);
  return additions.map(entry=>entry.clip);
}

export function deleteTimeRange(tracks,selection,bpm,idFactory){
  const secondsPerBeat=60/bpm;
  for(let index=selection.firstTrack;index<=selection.lastTrack;index++){
    const track=tracks[index];if(!track)continue;
    track.clips=track.clips.flatMap(clip=>{
      const at=clip.bar*4,from=(selection.startBeat-at)*secondsPerBeat,to=(selection.endBeat-at)*secondsPerBeat,duration=clipDurationSeconds(clip);
      if(to<=0||from>=duration)return[clip];
      return[sliceAudioClip(clip,0,Math.min(from,duration),bpm,clip.id),sliceAudioClip(clip,Math.max(0,to),duration,bpm,idFactory())].filter(Boolean);
    });
  }
}

export function resizeClipAtBeat(clip,edge,beat,assetDuration,bpm){
  const startBeat=clip.bar*4,endBeat=startBeat+clipDurationSeconds(clip)*bpm/60,rate=clip.rate||1;
  if(edge==='end'){
    const duration=Math.max(1/44100,(beat-startBeat)*60/bpm);
    if(clip.loop)clip.duration=Math.max(1/44100,duration);
    else clip.end=Math.min(assetDuration,clip.start+Math.max(1/44100,duration)*rate);
  }else if(edge==='start'){
    if(clip.loop){
      const next=Math.max(0,Math.min(endBeat-1/960,beat)),delta=(next-startBeat)*60/bpm;
      clip.loopOffset=(((clip.loopOffset||0)+delta*rate)%(clip.end-clip.start)+(clip.end-clip.start))%(clip.end-clip.start);
      clip.bar=next/4;clip.duration=(endBeat-next)*60/bpm;
    }else{
      const earliest=Math.max(0,startBeat-clip.start/rate*bpm/60),next=Math.max(earliest,Math.min(endBeat-1/960,beat));
      clip.start+=(next-startBeat)*60/bpm*rate;clip.bar=next/4;
    }
  }else throw new RangeError('Unknown clip edge.');
  delete clip.envelopeOffset;delete clip.envelopeDuration;
  return clip;
}
