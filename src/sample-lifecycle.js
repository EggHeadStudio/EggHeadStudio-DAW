export function shouldConfirmSampleDiscard({hasBuffer,saved}){
  return Boolean(hasBuffer&&!saved);
}

export function resolveRecordingChunks(chunks,cancelled=false){
  return cancelled||!chunks?.length?null:chunks;
}

export function createEmptySampleSession(){
  return{buffer:null,editor:null,filename:'My_Sample.wav',savedSampleId:null};
}
