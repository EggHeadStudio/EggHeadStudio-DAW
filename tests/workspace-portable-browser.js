// Browser-side PCM evidence; compression bounds host/browser transfer overhead.
export async function inspectWorkspacePcm(reference=null){
  const {AudioEngine}=await import('../src/audio.js'),{getProjectAssetIds}=await import('../src/portable-project.js');
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
  const buffer=await new AudioEngine().render(project,buffers),shape={frames:buffer.length,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels};
  if(reference){
    if(JSON.stringify(shape)!==JSON.stringify(reference.shape)||JSON.stringify(assets)!==JSON.stringify(reference.assets))throw new Error('Portable shape or source PCM changed.');
    const bytes=await new Response(new Blob([new Uint8Array(reference.compressed)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(),original=new Float32Array(bytes);
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
  return{shape,assets,compressed:Array.from(compressed)};
}

// Host-side fixture: use a genuinely empty origin; no separate-context claim.
export async function runWorkspacePortableAcceptance(page,{cleanOrigin}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const capture=async action=>{
    await page.evaluate(()=>{
      globalThis.ehs4bDownload=null;globalThis.ehs4bDownloadError=null;globalThis.ehs4bAnchor=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){if(this.download){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(bytes=>globalThis.ehs4bDownload={name,bytes:Array.from(new Uint8Array(bytes))}).catch(error=>globalThis.ehs4bDownloadError=error.message);return}globalThis.ehs4bAnchor.call(this)};
    });
    try{
      await action();await page.waitForFunction(()=>globalThis.ehs4bDownload||globalThis.ehs4bDownloadError,null,{timeout:60000});
      return await page.evaluate(()=>{if(globalThis.ehs4bDownloadError)throw new Error(globalThis.ehs4bDownloadError);return globalThis.ehs4bDownload});
    }finally{await page.evaluate(()=>{HTMLAnchorElement.prototype.click=globalThis.ehs4bAnchor;delete globalThis.ehs4bAnchor;delete globalThis.ehs4bDownload;delete globalThis.ehs4bDownloadError})}
  };
  const reference=await page.evaluate(async()=>await(await import('./tests/workspace-portable-browser.js')).inspectWorkspacePcm());
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
    await page.evaluate(({name,bytes})=>{const input=document.querySelector('#importEhs'),transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],name,{type:'application/zip'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}))},archive);
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Portable project opened'),null,{timeout:60000});
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
    check(JSON.stringify(restored.tracks)===JSON.stringify(snapshot.tracks)&&JSON.stringify(restored.mastering)===JSON.stringify(snapshot.mastering),'Portable instruments/clips/effects changed.');
    const after=await page.evaluate(async reference=>await(await import('./tests/workspace-portable-browser.js')).inspectWorkspacePcm(reference),reference);
    await page.locator('#play').click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)>950&&Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)<1050);
    const playbackHz=await page.evaluate(()=>Number(document.querySelector('.graphical-eq').dataset.spectrumPeakHz));
    await page.locator('#stop').click();await page.locator('[data-view=export]').click();
    const outputs=[];
    for(const format of ['wav','mp3']){
      await page.locator('#exportFormat').selectOption(format);
      const file=await capture(()=>page.locator('#exportStart').click());
      const audio=await page.evaluate(async bytes=>await(await import('./tests/eq-project-browser.js')).inspectDownloadedEqAudio(bytes),file.bytes);
      check(Math.abs(20*Math.log10(audio.rms/after.rms))<.15,`${format} output did not match committed mix level.`);
      outputs.push({format,...audio});
    }
    return{initial,isolatedOrigin:true,isolatedContext:false,archiveBytes:archive.bytes.length,settingsEqual:true,sourcePcmIdentical:true,repeated,after,playbackHz,outputs};
  }finally{await page.goto(original);await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'))}
}
