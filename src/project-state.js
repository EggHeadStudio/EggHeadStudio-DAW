export const DEFAULT_MASTER_SETTINGS=Object.freeze({eq:0,threshold:-12,makeup:0,volume:1});

export function createEmptyProject(name='Untitled Project'){
  return{
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
  return JSON.stringify(project,null,2);
}

export function parseProject(serialized){
  const project=JSON.parse(serialized);
  if(!project||!Array.isArray(project.tracks)||!Number.isFinite(project.bpm))throw new Error('Invalid project');
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
  project.tracks.splice(index,1);
  return true;
}
