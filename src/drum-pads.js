// Drum Rack pad model. Pads have stable ids and explicit note mappings; array position
// is only the display order. `rack.visibleCount` is a floor for how many leading pads are shown.
export const PAD_NOTE_BASE=36;
export const MAX_DRUM_PADS=32;

const defaultName=index=>`Pad ${index+1}`;
const newId=()=>globalThis.crypto?.randomUUID?.()||`pad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;

export function createPad({note=PAD_NOTE_BASE,index=0,asset=null,name=defaultName(index),idFactory=newId}={}){
  return{id:idFactory(),name,note,asset,volume:1,pitch:0,pan:0,mute:false};
}

// Every note list that can reference this rack: all clip patterns, or the legacy whole-track pattern.
export function patternNoteLists(track){
  return Array.isArray(track.patterns)?track.patterns.map(pattern=>pattern.notes||[]):[track.pattern?.notes||[]];
}

export function referencedNotes(track){
  const used=new Set();
  for(const notes of patternNoteLists(track))for(const note of notes)used.add(note.midi);
  return used;
}

export function padReferenceCount(track,pad){
  let count=0;
  for(const notes of patternNoteLists(track))for(const note of notes)if(note.midi===pad.note)count++;
  return count;
}

export function isPadUntouched(pad,index){
  return !pad.asset&&pad.name===defaultName(index)&&pad.volume===1&&pad.pitch===0&&pad.pan===0&&!pad.mute&&pad.note===PAD_NOTE_BASE+index;
}

/**
 * Compatibility rule: leading pads are always visible when they hold a sample, custom name or settings, or
 * are referenced by a note. Trailing untouched default pads (the old fixed 16-pad grid) are hidden, never deleted.
 */
export function visiblePadCount(track){
  const rack=track.drumRack,references=referencedNotes(track);
  let used=0;
  rack.pads.forEach((pad,index)=>{if(!isPadUntouched(pad,index)||references.has(pad.note))used=index+1});
  const stored=Number.isInteger(rack.visibleCount)?rack.visibleCount:0;
  return Math.max(1,Math.min(rack.pads.length,Math.max(stored,used)));
}

export const visiblePads=track=>track.drumRack.pads.slice(0,visiblePadCount(track));

export function normalizeDrumRack(track,idFactory=newId){
  const rack=track.drumRack;
  rack.steps=[16,32,64].includes(rack.steps)?rack.steps:16;
  rack.pads=(Array.isArray(rack.pads)?rack.pads:[]).filter(pad=>pad&&typeof pad==='object').slice(0,MAX_DRUM_PADS);
  if(!rack.pads.length)rack.pads.push(createPad({idFactory}));
  const seen=new Set();
  for(const [index,pad] of rack.pads.entries()){
    if(typeof pad.id!=='string'||!pad.id||seen.has(pad.id))pad.id=idFactory();
    seen.add(pad.id);
    pad.name=typeof pad.name==='string'&&pad.name?pad.name:defaultName(index);
    pad.note=Number.isInteger(pad.note)?pad.note:PAD_NOTE_BASE+index;
    pad.asset=pad.asset||null;
    pad.volume=Number.isFinite(pad.volume)?pad.volume:1;pad.pitch=Number.isFinite(pad.pitch)?pad.pitch:0;
    pad.pan=Number.isFinite(pad.pan)?pad.pan:0;pad.mute=Boolean(pad.mute);
  }
  rack.visibleCount=visiblePadCount(track);
  return rack;
}

// New pads never reuse a note that a pad or a stored pattern note already uses, so existing notes are never remapped.
export function nextFreeNote(track){
  const taken=new Set([...track.drumRack.pads.map(pad=>pad.note),...referencedNotes(track)]);
  for(let note=PAD_NOTE_BASE;note<128;note++)if(!taken.has(note))return note;
  throw new Error('No free note numbers remain for another pad.');
}

export function addPad(track,idFactory=newId){
  const rack=track.drumRack,visible=visiblePadCount(track);
  if(visible>=MAX_DRUM_PADS)throw new Error(`A Drum Rack supports at most ${MAX_DRUM_PADS} pads.`);
  if(visible<rack.pads.length){rack.visibleCount=visible+1;return rack.pads[visible]}
  const pad=createPad({note:nextFreeNote(track),index:rack.pads.length,idFactory});
  rack.pads.push(pad);rack.visibleCount=rack.pads.length;
  return pad;
}

/**
 * Removes a pad. A pad referenced by pattern notes requires an explicit choice: 'keep' leaves the notes in the
 * patterns as silent orphans (no pad owns their note), 'delete' removes them from every pattern.
 */
export function removePad(track,padId,{notes}={}){
  const rack=track.drumRack,index=rack.pads.findIndex(pad=>pad.id===padId),visible=visiblePadCount(track);
  if(index<0)throw new Error('That pad no longer exists.');
  if(index>=visible)throw new Error('Only visible pads can be removed.');
  if(visible<=1)throw new Error('A Drum Rack needs at least one pad. Clear its sample instead.');
  const pad=rack.pads[index],references=padReferenceCount(track,pad);
  if(references&&notes!=='keep'&&notes!=='delete'){
    const error=new Error(`This pad is used by ${references} note${references===1?'':'s'}. Choose to keep or delete them.`);
    error.code='PAD_IN_USE';error.references=references;throw error;
  }
  let deleted=0;
  if(references&&notes==='delete'){
    for(const list of patternNoteLists(track)){
      for(let i=list.length-1;i>=0;i--)if(list[i].midi===pad.note){list.splice(i,1);deleted++}
    }
  }
  rack.pads.splice(index,1);
  rack.visibleCount=Math.max(1,visible-1);
  return{pad,deleted,orphaned:notes==='keep'?references:0};
}

export const padForNote=(track,midi)=>track.drumRack?.pads.find(pad=>pad.note===midi)||null;
