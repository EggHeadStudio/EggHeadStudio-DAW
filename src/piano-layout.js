// Single authority for the Piano Roll's pitch <-> pixel mapping. Rows run from PITCH_HIGH (top) down to PITCH_LOW.
export const PITCH_LOW=24;
export const PITCH_HIGH=108;
export const KEY_WIDTH=56;
export const RULER_HEIGHT=28;
export const BASE_ROW_HEIGHT=22;

const BLACK_PITCH_CLASSES=new Set([1,3,6,8,10]);
const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export const isBlackKey=midi=>BLACK_PITCH_CLASSES.has(((midi%12)+12)%12);
export const pitchName=midi=>`${NAMES[((midi%12)+12)%12]}${Math.floor(midi/12)-1}`;
export const clampPitch=midi=>Math.max(PITCH_LOW,Math.min(PITCH_HIGH,Math.round(midi)));
export const rowIndex=midi=>PITCH_HIGH-midi;
export const rowTop=(midi,rowHeight)=>rowIndex(midi)*rowHeight;
export const gridHeight=rowHeight=>(PITCH_HIGH-PITCH_LOW+1)*rowHeight;
export const midiAtY=(y,rowHeight)=>clampPitch(PITCH_HIGH-Math.floor(y/rowHeight));

export function keyboardKeys(){
  const keys=[];
  for(let midi=PITCH_HIGH;midi>=PITCH_LOW;midi--)keys.push({midi,name:pitchName(midi),black:isBlackKey(midi),isC:midi%12===0});
  return keys;
}

export const VELOCITY_LANE_HEIGHT=84;
export const clampVelocity=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:.85));
// y is measured from the top of the lane; the top edge is velocity 1.
export const velocityAtY=(y,height=VELOCITY_LANE_HEIGHT)=>clampVelocity(1-y/height);
export const velocityBarHeight=(velocity,height=VELOCITY_LANE_HEIGHT)=>Math.max(2,Math.round(clampVelocity(velocity)*height));

/**
 * Applies a drag to the anchor note's velocity. When the anchor belongs to a multi-note selection the
 * same delta is applied to every selected note (clamped per note), preserving relative dynamics.
 */
export function applyVelocityDrag(notes,selectedIds,anchorId,initial,value){
  const anchor=notes.find(note=>note.id===anchorId);
  if(!anchor)return[];
  const targets=selectedIds.has(anchorId)?notes.filter(note=>selectedIds.has(note.id)):[anchor];
  const delta=clampVelocity(value)-initial[anchorId];
  for(const note of targets)note.velocity=clampVelocity((initial[note.id]??note.velocity)+delta);
  return targets.map(note=>note.id);
}
