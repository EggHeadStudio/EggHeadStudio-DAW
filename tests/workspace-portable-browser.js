// Browser-side PCM evidence; compression bounds host/browser transfer overhead.
export async function inspectWorkspacePcm(reference=null){
  globalThis.ehsPcmStage='decode';
  const entry=document.querySelector('script[type=module]').src;
  const {AudioEngine}=await import(new URL('./audio.js',entry)),{getProjectAssetIds}=await import(new URL('./portable-project.js',entry));
  const project=JSON.parse(localStorage.getItem('pulse-project')),context=new OfflineAudioContext(2,1,48000),buffers=new Map(),assets=[];
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{
    for(const id of getProjectAssetIds(project)){
      const file=await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      if(!file)throw new Error(`Missing workspace asset ${id}`);
      const buffer=await context.decodeAudioData(await file.arrayBuffer()),hashes=[];
      for(let channel=0;channel<buffer.numberOfChannels;channel++)hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer.getChannelData(channel))),byte=>byte.toString(16).padStart(2,'0')).join(''));
      assets.push({id,frames:buffer.length,sampleRate:buffer.sampleRate,hashes});buffers.set(id,buffer);
    }
  }finally{db.close()}
  globalThis.ehsPcmStage='render';
  const buffer=await new AudioEngine().render(project,buffers),shape={frames:buffer.length,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};
  globalThis.ehsPcmStage='rendered';
  if(reference){
    if(JSON.stringify(shape)!==JSON.stringify(reference.shape)||JSON.stringify(assets)!==JSON.stringify(reference.assets))throw new Error('Portable shape or source PCM changed.');
    globalThis.ehsPcmStage='decompress-reference';
    const compressed=Uint8Array.from(atob(reference.compressedBase64),character=>character.charCodeAt(0));
    const bytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),original=new Float32Array(bytes);
    globalThis.ehsPcmStage='compare';
    let maximum=0,square=0,energy=0,peak=0;
    for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const data=buffer.getChannelData(channel);for(let frame=0;frame<data.length;frame++){
        const difference=data[frame]-original[channel*data.length+frame];maximum=Math.max(maximum,Math.abs(difference));square+=difference*difference;
        energy+=data[frame]*data[frame];peak=Math.max(peak,Math.abs(data[frame]));
      }
    }
    const rmsError=Math.sqrt(square/original.length),rms=Math.sqrt(energy/original.length);
    // Same max bound as instrument-browser-acceptance, plus a tighter RMS gate.
    if(maximum>1e-4||rmsError>1e-6)throw new Error(`Mixed render mismatch: max ${maximum}, RMS ${rmsError}`);
    return{...shape,assets:assets.length,sourcePcmIdentical:true,maxError:maximum,rmsError,rms,peak,bitIdentical:maximum===0,maximumAllowedError:1e-4,maximumAllowedRmsError:1e-6};
  }
  const pcm=new Float32Array(buffer.length*buffer.numberOfChannels);
  for(let channel=0;channel<buffer.numberOfChannels;channel++)pcm.set(buffer.getChannelData(channel),channel*buffer.length);
  const compressed=new Uint8Array(await new Response(new Blob([pcm]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary='';for(let offset=0;offset<compressed.length;offset+=32768)binary+=String.fromCharCode(...compressed.subarray(offset,offset+32768));
  return{shape,assets,compressedBase64:btoa(binary)};
}

// Host-side fixture: use a genuinely empty origin; no separate-context claim.
export async function runWorkspacePortableAcceptance(page,{cleanOrigin,width=1280,onStage=()=>{}}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  await page.setViewportSize({width,height:1100});
  check(await page.evaluate(()=>document.visibilityState==='visible'),'Portable playback requires a genuinely visible browser document.');
  const capture=async action=>{
    onStage('download-start');
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),action()]);
    onStage('download-received');
    const failure=await download.failure();check(!failure,`Download failed: ${failure}`);
    onStage('download-complete');
    const path=await download.path();check(path,'Downloaded file could not be read.');
    const {readFile}=await import('node:fs/promises'),bytes=await readFile(path);
    onStage('download-read');
    return{name:download.suggestedFilename(),base64:bytes.toString('base64'),byteLength:bytes.length};
  };
  onStage('reference-render');
  const reference=await page.evaluate(async()=>await(await import('./tests/workspace-portable-browser.js')).inspectWorkspacePcm());
  onStage('repeated-render');
  const repeated=await page.evaluate(async reference=>await(await import('./tests/workspace-portable-browser.js')).inspectWorkspacePcm(reference),reference);
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
  const archive=await capture(()=>page.locator('#saveEhs').click()),original=page.url();
  try{
    await page.goto(cleanOrigin);await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    const initial=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try{return{autosave:localStorage.getItem('pulse-project'),assets:await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}}finally{db.close()}
    });
    check(initial.autosave===null&&initial.assets===0,'Portable target was not empty.');
    await page.evaluate(({name,base64})=>{const input=document.querySelector('#importEhs'),transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(base64),character=>character.charCodeAt(0))],name,{type:'application/zip'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))},archive);
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Portable project opened'),null,{timeout:60000});
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
    check(JSON.stringify(restored.tracks)===JSON.stringify(snapshot.tracks)&&JSON.stringify(restored.mastering)===JSON.stringify(snapshot.mastering),'Portable instruments/clips/effects changed.');
    const after=await page.evaluate(async reference=>await(await import('./tests/workspace-portable-browser.js')).inspectWorkspacePcm(reference),reference);
    onStage('restored-playback');
    await page.locator('#play').click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)>950&&Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)<1050);
    const playbackHz=await page.evaluate(()=>Number(document.querySelector('.graphical-eq').dataset.spectrumPeakHz));
    await page.locator('#stop').click();
    if(width<=850){await page.locator('[data-mobile-switch]').click();await page.locator('[data-mobile-workspace=export]').click()}
    else await page.locator('[data-view=export]').click();
    const outputs=[];
    for(const format of ['wav','mp3']){
      await page.locator('#exportFormat').selectOption(format);
      const file=await capture(()=>page.locator('#exportStart').click());
      const audio=await page.evaluate(async base64=>await(await import('./tests/eq-project-browser.js')).inspectDownloadedEqAudio(Uint8Array.from(atob(base64),character=>character.charCodeAt(0))),file.base64);
      check(Math.abs(20*Math.log10(audio.rms/after.rms))<.15,`${format} output did not match committed mix level.`);
      outputs.push({format,...audio});
    }
    return{width,actualDownloads:true,initial,isolatedOrigin:true,isolatedContext:false,archiveBytes:archive.byteLength,settingsEqual:true,sourcePcmIdentical:true,repeated,after,playbackHz,outputs};
  }finally{await page.goto(original);await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'))}
}
