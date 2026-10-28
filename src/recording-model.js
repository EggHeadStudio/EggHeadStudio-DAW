export function recordingTiming({contextTime,position,bpm,countInBars=0,offsetMs=0,sampleRate,playbackLatency=0}){
  if(![contextTime,position,bpm,offsetMs,sampleRate,playbackLatency].every(Number.isFinite)||contextTime<0||position<0||bpm<=0||sampleRate<=0||playbackLatency<0||Math.abs(offsetMs)>2000||![0,1,2,4].includes(countInBars))throw new Error('Invalid recording timing settings.');
  const countInSeconds=countInBars*4*60/bpm;
  const startFrame=Math.ceil((contextTime+.2+countInSeconds)*sampleRate);
  return{startFrame,startContextTime:startFrame/sampleRate,countInSeconds,position,offsetMs,playbackLatency,clipPosition:Math.max(0,position-offsetMs/1000-playbackLatency)};
}

export function createRecordingTake({id,assetId,groupId,name,timing,frames,sampleRate,bpm,inputLatency=0,outputLatency=0}){
  if(!id||!assetId||!groupId||!Number.isInteger(frames)||frames<=0||!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(bpm)||bpm<=0)throw new Error('Cannot create an empty or invalid recording take.');
  const position=timing.position-timing.offsetMs/1000-(timing.playbackLatency||0),trim=Math.max(0,-position);
  if(frames/sampleRate<=trim)throw new Error('Recording offset trims the entire take. Reduce offset compensation.');
  return{id,asset:assetId,bar:Math.max(0,position)*bpm/240,start:trim,end:frames/sampleRate,rate:1,gain:1,fadeIn:0,fadeOut:0,mute:false,
    recording:{takeId:id,groupId,name,positionSeconds:timing.position,startFrame:timing.startFrame,sampleRate,frames,offsetMs:timing.offsetMs,inputLatency,outputLatency}};
}

export function activateRecordingTake(track,id){
  const clip=track.clips.find(clip=>clip.id===id&&clip.recording);
  if(!clip)throw new Error('Select a recording take.');
  for(const item of track.clips)if(item.recording?.groupId===clip.recording.groupId)item.mute=item.id!==id;
}

export function recordingBackingProject(project,selection){
  const solo=project.tracks.some(track=>track.solo);
  return{...project,loop:false,tracks:project.tracks.map(track=>{
    const monitor=selection.get(track.id);
    return{...track,solo:false,mute:track.mute||(solo&&!track.solo)||monitor?.enabled===false,volume:track.volume*(monitor?.volume??1)};
  })};
}

export function validateRecordingClip(clip){
  if(clip.mute!==undefined&&typeof clip.mute!=='boolean')throw new Error('Invalid clip mute state.');
  const r=clip.recording;if(r===undefined)return;
  if(!r||typeof r.takeId!=='string'||r.takeId!==clip.id||typeof r.groupId!=='string'||!r.groupId||r.groupId.length>128||typeof r.name!=='string'||r.name.length>120||!Number.isInteger(r.frames)||r.frames<=0||!Number.isInteger(r.startFrame)||r.startFrame<0||!Number.isFinite(r.sampleRate)||r.sampleRate<8000||r.sampleRate>192000||!Number.isFinite(r.positionSeconds)||r.positionSeconds<0||!Number.isFinite(r.offsetMs)||Math.abs(r.offsetMs)>2000||![r.inputLatency,r.outputLatency].every(value=>Number.isFinite(value)&&value>=0))throw new Error('Invalid recording take metadata.');
}
