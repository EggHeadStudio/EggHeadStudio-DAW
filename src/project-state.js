import {isInstrumentClip,validateInstrumentData} from './instrument-clips.js';

export const DEFAULT_MASTER_SETTINGS=Object.freeze({eq:0,threshold:-12,makeup:0,volume:1});
export const LEGACY_PROJECT_SCHEMA_VERSION=1;
export const INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION=2;
export const PROJECT_SCHEMA_VERSION=INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION;

export function hasTypedInstrumentClips(project){
  return Boolean(Array.isArray(project?.tracks)&&project.tracks.some(track=>Array.isArray(track?.clips)&&track.clips.some(isInstrumentClip)));
}

function assertKnownProjectSchema(schemaVersion){
  if(schemaVersion!==undefined&&(!Number.isInteger(schemaVersion)||schemaVersion<0||schemaVersion>PROJECT_SCHEMA_VERSION)){
    throw new Error(`Unsupported project schema version: ${schemaVersion}`);
  }
}

export function normalizeProjectSchema(project){
  if(!project||typeof project!=='object'||!Array.isArray(project.tracks))throw new Error('Invalid project');
  assertKnownProjectSchema(project.schemaVersion);
  const typed=hasTypedInstrumentClips(project);
  if(typed){
    for(const track of project.tracks)if(track.patterns!==undefined||(track.clips||[]).some(isInstrumentClip))validateInstrumentData(track);
    project.schemaVersion=INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION;
  }else{
    project.schemaVersion=LEGACY_PROJECT_SCHEMA_VERSION;
  }
  return project;
}

export function trackPlaybackType(track){
  return track.drumRack?'drumRack':track.sampler?'sampler':'audio';
}

export function createProjectTrack({name,color,type='audio',assetId=null,duration=0,pitch=null},id,{instrumentClipModel=false}={}){
  name=String(name??'').trim();
  if(!name||name.length>80)throw new RangeError('Track name must contain 1-80 characters.');
  if(!/^#[0-9a-f]{6}$/i.test(color))throw new RangeError('Choose a valid track color.');
  if(!['audio','sampler','drumRack'].includes(type))throw new RangeError('Unsupported track type.');
  if(type==='sampler'&&(!assetId||!Number.isFinite(duration)||duration<=0)&&!instrumentClipModel)throw new Error('Choose a loaded sample for the Sampler track.');
  const track={id,name,color,volume:.85,pan:0,mute:false,solo:false,clips:[],pattern:{notes:[]},fx:{filterType:'lowpass',cutoff:20000,resonance:.7,delay:0,delayTime:.25,feedback:.25}};
  if(instrumentClipModel&&type!=='audio'){
    delete track.pattern;
    track.patterns=[];
  }
  if(type==='sampler')track.sampler={asset:assetId,rootNote:pitch?.midi||60,start:0,end:duration,mode:'melodic',detected:pitch?.name||null,confidence:pitch?.confidence||null};
  if(type==='drumRack')track.drumRack={steps:16,pads:Array.from({length:16},(_,index)=>({name:`Pad ${index+1}`,note:36+index,asset:instrumentClipModel&&index>0?null:assetId,volume:1,pitch:0,pan:0,mute:false}))};
  return track;
}

export function normalizeArrangementLoop(project){
  project.loopStart=Number.isFinite(project.loopStart)&&project.loopStart>=0?project.loopStart:0;
  project.loopEnd=Number.isFinite(project.loopEnd)&&project.loopEnd>project.loopStart?project.loopEnd:project.loopStart+4;
  project.loop=Boolean(project.loop);
  return project;
}

export function createEmptyProject(name='Untitled Project'){
  return{
    id:globalThis.crypto?.randomUUID?.()||`project-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    schemaVersion:LEGACY_PROJECT_SCHEMA_VERSION,
    name,
    bpm:120,
    loop:false,
    loopStart:0,
    loopEnd:4,
    patternBeats:64,
    tracks:[],
    masterSettings:{...DEFAULT_MASTER_SETTINGS}
  };
}

export function serializeProject(project){
  if(!project||typeof project!=='object')throw new Error('Invalid project');
  assertKnownProjectSchema(project.schemaVersion);
  const typed=hasTypedInstrumentClips(project);
  if(typed){
    const copy={...project,schemaVersion:INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION};
    for(const track of copy.tracks||[])if(track.patterns!==undefined||(track.clips||[]).some(isInstrumentClip))validateInstrumentData(track);
    return JSON.stringify(copy,null,2);
  }
  if(project.schemaVersion===INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION)throw new Error('Project schema 2 requires typed instrument clips.');
  return JSON.stringify(project,null,2);
}

export function parseProject(serialized){
  const project=JSON.parse(serialized);
  if(!project||!Array.isArray(project.tracks)||!Number.isFinite(project.bpm))throw new Error('Invalid project');
  assertKnownProjectSchema(project.schemaVersion);
  const typed=hasTypedInstrumentClips(project);
  if(typed&&project.schemaVersion!==INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION)throw new Error('Typed instrument clips require project schema 2.');
  if(!typed&&project.schemaVersion===INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION)throw new Error('Project schema 2 requires typed instrument clips.');
  if(typed)for(const track of project.tracks)if(track.patterns!==undefined||(track.clips||[]).some(isInstrumentClip))validateInstrumentData(track);
  project.schemaVersion=typed?INSTRUMENT_CLIP_PROJECT_SCHEMA_VERSION:LEGACY_PROJECT_SCHEMA_VERSION;
  project.id||=globalThis.crypto?.randomUUID?.()||`project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return project;
}

export function planProjectReset(project,choice){
  if(!['save','discard','cancel'].includes(choice))throw new RangeError(`Unknown project reset choice: ${choice}`);
  if(choice==='cancel')return{choice,project:null,serialized:null};
  return{
    choice,
    project:createEmptyProject(),
    serialized:choice==='save'?serializeProject(project):null
  };
}

export function isTrackAudible(track,tracks){
  const hasSolo=tracks.some(item=>item.solo);
  return !track.mute&&(!hasSolo||track.solo);
}

export function deleteProjectTrack(project,index){
  if(!Number.isInteger(index)||index<0||index>=project.tracks.length)return false;
  const [removed]=project.tracks.splice(index,1);
  for(const track of project.tracks)for(const effect of track.fx?.effects||[]){
    const sidechain=effect.params?.sidechain;
    if(sidechain?.sourceTrackId===removed.id)sidechain.sourceTrackId='';
  }
  return true;
}
