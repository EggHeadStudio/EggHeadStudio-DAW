import {clipDurationSeconds} from './audio.js';

const copyClips=tracks=>tracks.map(track=>({id:track.id,clips:(track.clips||[]).map(clip=>({...clip}))}));

export class ArrangementHistory {
  constructor(limit=100){this.limit=limit;this.undoStack=[];this.redoStack=[]}
  checkpoint(tracks){
    this.undoStack.push(copyClips(tracks));
    if(this.undoStack.length>this.limit)this.undoStack.shift();
    this.redoStack=[];
  }
  restore(tracks,snapshot){
    const saved=new Map(snapshot.map(track=>[track.id,track.clips]));
    for(const track of tracks)track.clips=(saved.get(track.id)||[]).map(clip=>({...clip}));
  }
  undo(tracks){
    if(!this.undoStack.length)return false;
    this.redoStack.push(copyClips(tracks));
    this.restore(tracks,this.undoStack.pop());
    return true;
  }
  redo(tracks){
    if(!this.redoStack.length)return false;
    this.undoStack.push(copyClips(tracks));
    this.restore(tracks,this.redoStack.pop());
    return true;
  }
}

export function splitClipAtTime(tracks,trackId,clipId,timeSeconds,bpm,idFactory){
  const track=tracks.find(item=>item.id===trackId),index=track?.clips.findIndex(item=>item.id===clipId)??-1;
  if(index<0||!Number.isFinite(timeSeconds)||!Number.isFinite(bpm)||bpm<=0)return false;
  const clip=track.clips[index],clipStart=clip.bar*240/bpm,clipDuration=clipDurationSeconds(clip);
  if(timeSeconds<=clipStart||timeSeconds>=clipStart+clipDuration)return false;
  const elapsed=timeSeconds-clipStart,splitSource=clip.start+elapsed*(clip.rate||1);
  const right=clip.loop
    ?{...clip,id:idFactory(),bar:timeSeconds/(240/bpm),duration:clipDuration-elapsed}
    :{...clip,id:idFactory(),bar:timeSeconds/(240/bpm),start:splitSource};
  if(clip.loop)clip.duration=elapsed;
  else clip.end=splitSource;
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
