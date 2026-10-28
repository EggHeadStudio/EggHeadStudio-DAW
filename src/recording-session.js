import {activateRecordingTake,applyPunchToTrack,createRecordingTake} from './recording-model.js';

const stage=(name,error)=>Object.assign(new Error(error?.message||String(error)),{stage:name,cause:error});

export function assembleTakeBuffer(pending,createBuffer){
  if(pending.buffer)return pending.buffer;
  const buffer=createBuffer(1,pending.frames,pending.sampleRate),pcm=buffer.getChannelData(0);
  let offset=0;for(const chunk of pending.chunks){pcm.set(chunk,offset);offset+=chunk.length}
  pending.buffer=buffer;pending.chunks=[];
  return buffer;
}

export function quotaFailure(error){
  return error?.name==='QuotaExceededError'||error?.cause?.name==='QuotaExceededError'||/quota/i.test(error?.message||'');
}

/*
 Commits captured PCM in resumable steps. Every completed step is remembered on `pending`, so a failed encode or storage
 write can be retried without losing the captured audio, and the WAV bytes stay available for a manual download fallback.
*/
export async function commitRecordedTake(pending,{createBuffer,encodeWav,storeAsset,track,timing,bpm,idFactory,compensation,outputLatency=0}){
  const buffer=assembleTakeBuffer(pending,createBuffer);
  if(!pending.wavBytes){
    try{pending.wavBytes=await encodeWav([buffer.getChannelData(0)],pending.sampleRate,{bitDepth:32,dither:false})}catch(error){throw stage('encode',error)}
  }
  if(!pending.stored){
    try{await storeAsset(pending.assetId,new File([pending.wavBytes],`${pending.name}.wav`,{type:'audio/wav'}),buffer);pending.stored=true}catch(error){throw stage('store',error)}
  }
  if(!pending.clip){
    const groupId=timing.punch?`${track.id}-punch-${pending.id}`:`${track.id}-at-${Math.round(timing.position*bpm/60*960)}`;
    const clip=createRecordingTake({id:pending.id,assetId:pending.assetId,groupId,name:pending.name,timing,frames:pending.frames,sampleRate:pending.sampleRate,bpm,inputLatency:0,outputLatency,compensation});
    if(timing.punch)applyPunchToTrack(track,clip,timing.punch,bpm,idFactory);
    track.clips.push(clip);
    if(!timing.punch)activateRecordingTake(track,clip.id);
    pending.clip=clip;
  }
  return pending.clip;
}
