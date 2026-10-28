export const isInstrumentClip=clip=>clip?.kind==='instrument';
export const instrumentType=track=>track.drumRack?'drumRack':track.sampler?'sampler':'audio';
export const clonePattern=(pattern,id=pattern.id)=>({...pattern,id,notes:pattern.notes.map(note=>({...note}))});
export const patternForClip=(track,clip)=>track.patterns?.find(pattern=>pattern.id===clip?.patternId);
export const clipLengthBeats=(clip,bpm)=>isInstrumentClip(clip)?clip.durationBeats:Math.max(0,clip.loop?(Number(clip.duration)||(clip.end-clip.start)/(clip.rate||1)):(clip.end-clip.start)/(clip.rate||1))*bpm/60;

export function legacyPatternLength(track,defaultBeats=64){
  if(!track.drumRack)return defaultBeats;
  const end=(track.pattern?.notes||[]).reduce((end,note)=>Math.max(end,(note.beat||0)+(note.durationBeats||0)),4);
  return Math.min(64,Math.max(4,Math.ceil(end/4)*4));
}

export function migrateInstrumentArrangement(project,idFactory=()=>crypto.randomUUID()){
  let endBeats=16;const updates=[];
  for(const track of project.tracks){
    for(const clip of track.clips||[])endBeats=Math.max(endBeats,clip.bar*4+clipLengthBeats(clip,project.bpm));
    if(instrumentType(track)!=='audio'&&track.pattern?.notes?.length)endBeats=Math.max(endBeats,legacyPatternLength(track,project.patternBeats||16));
  }
  for(const track of project.tracks){
    if(instrumentType(track)==='audio'||Array.isArray(track.patterns))continue;
    const length=legacyPatternLength(track,project.patternBeats||16),legacy=track.pattern||{notes:[]};
    const pattern={id:idFactory(),name:`${track.name} pattern`,lengthBeats:length,notes:(legacy.notes||[]).map(note=>({...note,id:note.id||idFactory(),beat:note.beat??0,midi:note.midi??track.sampler?.rootNote??60,durationBeats:note.durationBeats||.25,velocity:note.velocity??.85}))};
    const clip={id:idFactory(),kind:'instrument',patternId:pattern.id,bar:0,durationBeats:endBeats,offsetBeats:0,loop:true,gain:1,legacyTail:true};
    const next={...track,patterns:[pattern],clips:[...(track.clips||[]),clip]};
    validateInstrumentData(next);updates.push({track,next});
  }
  for(const {track,next}of updates){track.patterns=next.patterns;track.clips=next.clips;delete track.pattern}
  return project;
}

export function createInstrumentClip(track,atBeat,idFactory,{name='New pattern',lengthBeats=4}={}){
  if(instrumentType(track)==='audio')throw new Error('Select a Sampler or Drum Rack track.');
  if(!Array.isArray(track.patterns)&&track.pattern?.notes?.length)throw new Error('Migrate the existing legacy pattern before adding instrument clips.');
  if(!Number.isFinite(atBeat)||atBeat<0||!Number.isFinite(lengthBeats)||lengthBeats<=0||lengthBeats>64||typeof name!=='string'||!name.trim())throw new RangeError('Invalid instrument clip position, name, or pattern length.');
  const pattern={id:idFactory(),name,lengthBeats,notes:[]},clip={id:idFactory(),kind:'instrument',patternId:pattern.id,bar:Math.max(0,atBeat)/4,durationBeats:lengthBeats,offsetBeats:0,loop:true,gain:1};
  track.patterns ||= [];track.patterns.push(pattern);track.clips.push(clip);
  return clip;
}

export function makePatternIndependent(track,clip,idFactory){
  const pattern=patternForClip(track,clip);
  if(!pattern)throw new Error('The instrument clip references a missing pattern.');
  const copy=clonePattern(pattern,idFactory());copy.name=`${pattern.name} copy`;
  copy.notes=copy.notes.map(note=>({...note,id:idFactory()}));
  track.patterns.push(copy);clip.patternId=copy.id;return copy;
}

export function sliceInstrumentClip(clip,fromBeats,toBeats,id){
  const from=Math.max(0,fromBeats),to=Math.min(clip.durationBeats,toBeats);
  if(to<=from)return null;
  const sliced={...clip,id,bar:clip.bar+from/4,durationBeats:to-from,offsetBeats:(clip.offsetBeats||0)+from};
  delete sliced.legacyTail;
  return sliced;
}

export function resizeInstrumentClip(clip,edge,beat,pattern){
  if(!Number.isFinite(beat))throw new RangeError('Instrument clip boundary must be finite.');
  const start=clip.bar*4,end=start+clip.durationBeats;
  if(edge==='end'){
    const maximum=clip.loop?Infinity:Math.max(1/960,pattern.lengthBeats-(clip.offsetBeats||0));
    clip.durationBeats=Math.max(1/960,Math.min(maximum,beat-start));
  }else if(edge==='start'){
    const next=Math.max(0,start-(clip.offsetBeats||0),Math.min(end-1/960,beat)),delta=next-start;
    clip.bar=next/4;clip.durationBeats=end-next;clip.offsetBeats=(clip.offsetBeats||0)+delta;
  }else throw new RangeError('Unknown instrument clip edge.');
  delete clip.legacyTail;
  return clip;
}

export function assertClipDestination(clip,sourceType,target){
  const type=instrumentType(target);
  if(isInstrumentClip(clip)?type!==sourceType:type!=='audio')throw new Error(`Incompatible destination: ${isInstrumentClip(clip)?sourceType:'audio'} clips require a matching track type.`);
  if(isInstrumentClip(clip)&&!Array.isArray(target.patterns)&&target.pattern?.notes?.length)throw new Error('Migrate the destination legacy pattern before moving or pasting instrument clips.');
}

export function validateInstrumentData(track){
  if(track.patterns===undefined){
    if(track.clips?.some(isInstrumentClip))throw new Error('Instrument clips require a pattern collection.');
    return;
  }
  if(!Array.isArray(track.patterns)||instrumentType(track)==='audio')throw new Error('Invalid instrument pattern collection.');
  const ids=new Set();
  for(const pattern of track.patterns){
    if(!pattern||typeof pattern.id!=='string'||!pattern.id||pattern.id.length>128||ids.has(pattern.id)||typeof pattern.name!=='string'||pattern.name.length>120||!Number.isFinite(pattern.lengthBeats)||pattern.lengthBeats<=0||pattern.lengthBeats>64||!Array.isArray(pattern.notes))throw new Error('Invalid instrument pattern.');
    ids.add(pattern.id);
    const noteIds=new Set();
    for(const note of pattern.notes){
      if(!note||typeof note.id!=='string'||!note.id||note.id.length>128||noteIds.has(note.id)||!Number.isFinite(note.beat)||note.beat<0||note.beat>=pattern.lengthBeats||!Number.isInteger(note.midi)||note.midi<0||note.midi>127||!Number.isFinite(note.durationBeats)||note.durationBeats<=0||!Number.isFinite(note.velocity)||note.velocity<0||note.velocity>1)throw new Error('Invalid instrument note.');
      noteIds.add(note.id);
    }
  }
  const clipIds=new Set();
  for(const clip of track.clips||[]){
    if(typeof clip.id!=='string'||!clip.id||clip.id.length>128||clipIds.has(clip.id))throw new Error('Invalid or duplicate instrument clip identity.');
    clipIds.add(clip.id);
    if(!isInstrumentClip(clip))continue;
    if(!ids.has(clip.patternId)||!Number.isFinite(clip.bar)||clip.bar<0||!Number.isFinite(clip.durationBeats)||clip.durationBeats<=0||!Number.isFinite(clip.offsetBeats)||clip.offsetBeats<0||typeof clip.loop!=='boolean'||clip.gain!==undefined&&(!Number.isFinite(clip.gain)||clip.gain<0)||clip.legacyTail!==undefined&&typeof clip.legacyTail!=='boolean')throw new Error('Invalid instrument clip or pattern reference.');
  }
}
