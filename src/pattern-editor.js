import {isInstrumentClip,patternForClip} from './instrument-clips.js';

export function selectedPatternContext(track,clipId){
  const clip=track.clips.find(clip=>clip.id===clipId&&isInstrumentClip(clip))||track.clips.find(isInstrumentClip);
  const pattern=clip&&patternForClip(track,clip);
  if(!pattern)throw new Error('Create or select an instrument clip before opening its editor.');
  const adapter={...track,pattern};
  return{clip,pattern,adapter,shared:track.clips.filter(item=>item.patternId===pattern.id).length,
    commit(){pattern.notes=adapter.pattern.notes;adapter.pattern=pattern;track.fx=adapter.fx},
    localBeat(seconds,bpm){
      const beat=seconds*bpm/60-clip.bar*4+(clip.offsetBeats||0);
      return clip.loop?((beat%pattern.lengthBeats)+pattern.lengthBeats)%pattern.lengthBeats:Math.max(0,beat);
    }};
}

export function setPatternLength(pattern,length){
  if(!Number.isFinite(length)||length<=0||length>64)throw new RangeError('Pattern length must be greater than zero and at most 64 beats.');
  if(pattern.notes.some(note=>note.beat>=length))throw new Error('Move or delete notes beyond the new boundary before shortening this pattern.');
  pattern.lengthBeats=length;
}
