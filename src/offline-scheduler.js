export const OFFLINE_WINDOW_SECONDS=1;

function checkCancelled(signal){
 if(signal?.aborted)throw signal.reason||new DOMException('Offline rendering cancelled.','AbortError');
}

export async function renderOfflineWindows(ctx,{schedule,release,dispose,signal,failure,onProgress}){
 checkCancelled(signal);
 const windowFrames=Math.max(128,Math.floor(OFFLINE_WINDOW_SECONDS*ctx.sampleRate/128)*128);
 let boundary=Math.min(ctx.length,windowFrames);
 schedule(0,boundary/ctx.sampleRate);
 let suspended=boundary<ctx.length?ctx.suspend(boundary/ctx.sampleRate):null;
 const rendering=ctx.startRendering(),finished=rendering.then(buffer=>({buffer}),error=>({error}));
 const wait=promise=>Promise.race(failure?[promise,failure]:[promise]);
 try{
 while(suspended){
  const result=await wait(Promise.race([suspended.then(()=>null),finished]));
  if(result){
   if('error'in result)throw result.error;
   throw new Error('Offline rendering completed before its scheduled suspension.');
  }
  checkCancelled(signal);
  release(ctx.currentTime);
  onProgress?.(boundary/ctx.length);
  const from=boundary;
  boundary=Math.min(ctx.length,boundary+windowFrames);
  schedule(from/ctx.sampleRate,boundary/ctx.sampleRate);
  suspended=boundary<ctx.length?ctx.suspend(boundary/ctx.sampleRate):null;
  await ctx.resume();
 }
 const rendered=await wait(rendering);
 checkCancelled(signal);
 onProgress?.(1);
 return rendered;
 }catch(error){
  dispose?.();
  // OfflineAudioContext has no close(): retire the graph, then drain silence.
  try{
   if(suspended)await Promise.race([suspended,rendering]);
   if(ctx.state==='suspended')await ctx.resume();
   await rendering;
  }catch(cleanupError){
   if(cleanupError!==error)throw new AggregateError([error,cleanupError],'Offline rendering failed and its context could not finish cleanup.');
  }
  throw error;
 }
}
