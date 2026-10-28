// Run only on a disposable origin. The microphone is synthetic Web Audio, not a hardware latency test.
export async function runRecordingBrowserAcceptance(page){
 const check=(value,message)=>{if(!value)throw new Error(message)},click=selector=>page.locator(selector).click();
 await page.evaluate(async()=>{
  const {RecordingStudio}=await import('./src/recording-studio.js'),start=RecordingStudio.prototype.start;
  RecordingStudio.prototype.start=function(){window.__testStudio=this;return start.call(this)};
  window.__testMicMode='tone';window.__testMicTracks=[];window.__testMicNodes=[];window.__testStates=[];
  window.__testDownloads=[];const create=URL.createObjectURL;
  URL.createObjectURL=blob=>{window.__testDownloads.push(blob);return create.call(URL,blob)};
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){
   if(window.__testQuota&&args[0] instanceof Blob)throw new DOMException('Injected quota failure','QuotaExceededError');
   return put.apply(this,args);
  };
  navigator.mediaDevices.getUserMedia=async()=>{
   if(window.__testMicMode==='deny')throw new DOMException('Injected permission denial','NotAllowedError');
   const ctx=window.__testStudio.engine.ctx,destination=ctx.createMediaStreamDestination(),track=destination.stream.getAudioTracks()[0];
   track.getSettings=()=>({deviceId:'synthetic-7b'});
   if(window.__testMicMode==='loopback'){
    const delay=ctx.createDelay();delay.delayTime.value=.075;delay.connect(destination);window.__testMicNodes.push(delay);
    const connect=AudioNode.prototype.connect;window.__restoreConnect=()=>AudioNode.prototype.connect=connect;
    AudioNode.prototype.connect=function(...args){if(args[0]===ctx.destination)connect.call(this,delay);return connect.apply(this,args)};
   }else{
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.frequency.value=523.25;gain.gain.value=.2;
    oscillator.connect(gain).connect(destination);oscillator.start();window.__testMicNodes.push(oscillator,gain);
   }
   window.__testMicTracks.push(track);return destination.stream;
  };
 });
 await page.getByRole('button',{name:'Recording Studio',exact:true}).click();
 await page.evaluate(()=>{
  new MutationObserver(()=>{
   const value=document.querySelector('#recordingStatus')?.textContent;
   if(value&&window.__testStates.at(-1)?.value!==value)window.__testStates.push({value,at:performance.now()});
  }).observe(document.querySelector('main'),{subtree:true,childList:true});
 });
 await page.locator('#recordingArm').check();await page.locator('#recordingCountIn').selectOption('1');
 await page.locator('.recording-punch summary').click();await page.locator('#punchEnable').check();
 await page.locator('#punchOut').fill('6');await page.locator('#punchOut').dispatchEvent('change');
 await page.locator('#punchIn').fill('4');await page.locator('#punchIn').dispatchEvent('change');
 await click('#studioRecord');
 await page.waitForFunction(()=>window.__testStudio?.state==='idle'&&window.__testStudio.target?.clips.some(c=>c.recording),null,{timeout:20000});
 const timing=await page.evaluate(()=>{
  const studio=window.__testStudio,clip=studio.target.clips.find(c=>c.recording);
  return{timing:studio.timing,rate:studio.engine.ctx.sampleRate,frames:clip.recording.frames,position:clip.bar*240/studio.getProject().bpm,compensation:studio.compensationInfo.seconds,states:window.__testStates};
 });
 check(timing.frames===timing.rate,'Punch duration must be exactly one second.');
 check(timing.timing.countInSeconds===2,'Count-in timing is incorrect.');
 check(timing.timing.startFrame-timing.timing.playFrame===2*timing.rate,'Pre-roll timing is incorrect.');
 check(timing.states.some(s=>s.value==='COUNT-IN')&&timing.states.some(s=>s.value==='PRE-ROLL'),'Count-in/pre-roll states were not observed.');
 await page.locator('#recordingCountIn').selectOption('0');
 await page.locator('#recordingOffset').fill('50');await page.locator('#recordingOffset').dispatchEvent('change');
 await page.locator('.recording-punch summary').click();await page.locator('#punchPreRoll').selectOption('0');
 await page.evaluate(()=>window.__testQuota=true);await click('#studioRecord');
 await page.waitForFunction(()=>window.__testStudio.state==='unsaved',null,{timeout:10000});
 await click('#downloadBufferedTake');
 const recovery=await page.evaluate(async()=>{
  const blob=window.__testDownloads.at(-1),audio=await new OfflineAudioContext(1,1,48000).decodeAudioData(await blob.arrayBuffer());
  let energy=0;for(const value of audio.getChannelData(0))energy+=value*value;
  return{frames:audio.length,rms:Math.sqrt(energy/audio.length),message:document.querySelector('#toast').textContent};
 });
 check(recovery.frames===48000&&recovery.rms>.1,'Recovery WAV lost captured audio.');
 await page.evaluate(()=>window.__testQuota=false);await click('#retryRecordingSave');
 await page.waitForFunction(()=>window.__testStudio.state==='idle');
 const offsetError=await page.evaluate(()=>{
  const studio=window.__testStudio,clip=studio.target.clips.at(-1);
  return Math.abs(clip.bar*240/studio.getProject().bpm-(2-.05-studio.compensationInfo.seconds));
 });
 check(offsetError<1e-9,'Manual offset compensation was not applied.');
 await page.evaluate(()=>window.__testMicMode='deny');await click('#studioRecord');
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('permission was denied'));
 const denial=await page.locator('#toast').textContent();
 await page.evaluate(()=>window.__testMicMode='loopback');await page.locator('.recording-calibration summary').click();await click('#calibrateRun');
 await page.waitForFunction(()=>window.__testStudio.state==='idle');
 const calibration=await page.evaluate(()=>JSON.parse(localStorage.getItem('ehs-recording-calibration')));
 const measured=Object.values(calibration)[0];
 check(measured&&measured.correlation>.99&&measured.roundTripSeconds>=.075&&measured.roundTripSeconds<.15,'Synthetic loopback calibration failed.');
 await page.evaluate(()=>{window.__restoreConnect();window.__testMicMode='tone'});
 await page.locator('.recording-punch summary').click();await page.locator('#punchEnable').uncheck();
 await click('#studioRecord');await page.waitForFunction(()=>window.__testStudio.state==='recording');await page.waitForTimeout(500);
 await page.evaluate(()=>window.__testStudio.engine.ctx.suspend());
 await page.waitForFunction(()=>window.__testStudio.state==='idle',null,{timeout:10000});
 const interruption=await page.evaluate(()=>{
  const studio=window.__testStudio;return{frames:studio.target.clips.at(-1).recording.frames,tracksEnded:window.__testMicTracks.every(t=>t.readyState==='ended'),takes:studio.target.clips.filter(c=>c.recording).length};
 });
 check(interruption.frames>0&&interruption.tracksEnded,'Interrupted recording did not recover and release the microphone.');
 await page.evaluate(async()=>{for(const node of window.__testMicNodes){if(node.stop)node.stop();node.disconnect()}await window.__testStudio.engine.ctx.resume()});
 return{timing,recovery,offsetError,denial,calibration,interruption};
}
