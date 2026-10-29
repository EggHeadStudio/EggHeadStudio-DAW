// Host-side variants on a UI-imported production archive; only microphone input is synthetic.
export async function runMobileClosureAcceptance(page,{onStage=()=>{}}={}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},results={},errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const navigate=async key=>{await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${key}"]`).click()};
  const field=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab')};
  const capture=async action=>{
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:90000}),action()]);
    check(!await download.failure(),'Download failed.');
    const {readFile}=await import('node:fs/promises'),bytes=await readFile(await download.path());
    return{name:download.suggestedFilename(),bytes,base64:bytes.toString('base64')};
  };
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(async()=>{
    const {RecordingStudio}=await import(new URL('./recording-studio.js',document.querySelector('script[type=module]').src));
    const mount=RecordingStudio.prototype.mount,microphone=navigator.mediaDevices.getUserMedia;
    globalThis.ehs5dMics=[];globalThis.ehs5dFrequency=659.25;
    globalThis.ehs5dRestore=()=>{RecordingStudio.prototype.mount=mount;navigator.mediaDevices.getUserMedia=microphone};
    RecordingStudio.prototype.mount=function(...args){globalThis.ehs5dStudio=this;return mount.apply(this,args)};
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext(),oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=globalThis.ehs5dFrequency;gain.gain.value=.12;
      oscillator.connect(gain).connect(destination);oscillator.start();await context.resume();
      globalThis.ehs5dMics.push({context,oscillator,destination});return destination.stream;
    };
  });
  try{
    await navigate('recording');
    await page.locator('#recordingArm').check();await page.locator('#recordingCountIn').selectOption('0');
    const original=await read(),initialTakes=await page.locator('[data-take]').count(),ids=[];
    for(const frequency of [659.25,783.99]){
      await page.evaluate(frequency=>{globalThis.ehs5dFrequency=frequency},frequency);
      await field('#recordingPosition',0);await page.locator('#studioRecord').click();
      await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='recording');
      await page.waitForFunction(()=>document.querySelector('#recordingTime').textContent>='00:01.200');
      await page.locator('#studioStop').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='idle');
      const id=await page.locator('[data-take]').last().getAttribute('data-take');ids.push(id);
      for(const [key,value]of [['start',.05],['end',.8],['gain',.5],['fadeIn',.05],['fadeOut',.08]])await field(`[data-take-value="${id}"][data-key="${key}"]`,value);
      await page.locator(`[data-activate-take="${id}"]`).click();
    }
    check(await page.locator('[data-take]').count()===initialTakes+2,'Normal saves lost a take.');
    const previews=[];
    for(const id of ids){
      await page.locator(`[data-activate-take="${id}"]`).click();await page.locator(`[data-preview-take="${id}"]`).click();
      await page.waitForFunction(()=>globalThis.ehs5dStudio.engine.trackNodes.get(globalThis.ehs5dStudio.trackId).readMeter().leftRms>.005);
      const preview=await page.evaluate(id=>{
        const studio=globalThis.ehs5dStudio,clip=studio.getProject().tracks.flatMap(track=>track.clips).find(clip=>clip.id===id);
        const source=studio.engine.sources[0];
        return{id,correctBuffer:source.buffer===studio.buffers.get(clip.asset),sources:studio.engine.sources.length,
          meter:studio.engine.trackNodes.get(studio.trackId).readMeter().leftRms,clip};
      },id);
      check(preview.correctBuffer&&preview.sources===1&&!preview.clip.mute&&preview.clip.gain===.5&&preview.clip.end===.8,'Take switching/preview/edit failed.');
      previews.push(preview);
    }
    const beforeCancel=JSON.stringify((await read()).tracks);
    await page.locator('#studioRecord').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='recording');
    await page.locator('#studioCancel').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='idle');
    check(JSON.stringify((await read()).tracks)===beforeCancel,'Cancel changed saved takes.');
    results.recording={initialTakes,savedTakes:initialTakes+2,previews,cancelPreserved:true,originalClipsPreserved:original.tracks[2].clips.every(clip=>(JSON.parse(beforeCancel)[2].clips).some(item=>item.id===clip.id))};
    onStage({recording:results.recording});
    await navigate('sample');await page.locator('#record').click();
    await page.waitForFunction(()=>!document.querySelector('#cancelRecord').disabled);
    await page.locator('#cancelRecord').click();
    await page.waitForFunction(()=>document.querySelector('#sampleWave').dataset.length==='0');
    await page.locator('#record').click();await page.waitForFunction(()=>!document.querySelector('#finishRecord').disabled);
    await page.waitForTimeout(1400);await page.locator('#finishRecord').click();
    await page.waitForFunction(()=>Number(document.querySelector('#sampleWave').dataset.length)>1000);
    const sampleLength=await page.locator('#sampleWave').getAttribute('data-length');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#record').click();
    check(await page.locator('#sampleWave').getAttribute('data-length')===sampleLength,'Declined replacement lost sample edits.');
    await page.locator('.workflow-stage').last().scrollIntoViewIfNeeded();
    const playBox=await page.locator('#play').boundingBox();
    check(playBox&&playBox.y>=0&&playBox.y+playBox.height<844,'Shared preview transport is not visible while reviewing Save.');
    await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('.sample-studio').previewSession?.state==='playing');
    await page.locator('#stop').click();await page.waitForFunction(()=>document.querySelector('.sample-studio').previewSession?.state!=='playing');
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#discardSample').click();
    check(await page.locator('#sampleWave').getAttribute('data-length')===sampleLength,'Discard Cancel lost sample.');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#discardSample').click();
    results.sample={cancelEmpty:true,newRecordingFrames:Number(sampleLength),replacementCancelPreserved:true,persistentSharedPreview:true,discardCancelPreserved:true};
    onStage({sample:results.sample});
    await navigate('export');
    const progress=[];
    await page.evaluate(()=>{
      globalThis.ehs5dProgress=[];
      globalThis.ehs5dProgressObserver=new MutationObserver(()=>{
        const status=document.querySelector('#exportStatus'),bar=document.querySelector('#exportProgress');
        if(status)globalThis.ehs5dProgress.push({message:status.textContent,visible:bar?!bar.hidden:false,value:bar?.value});
      });
      globalThis.ehs5dProgressObserver.observe(document.querySelector('#main'),{childList:true,subtree:true,attributes:true,characterData:true});
    });
    await page.locator('#exportStart').click();
    await page.waitForFunction(()=>{const bar=document.querySelector('#exportProgress');return bar&&!bar.hidden&&bar.value>0&&bar.value<1});
    await page.locator('#exportCancel').click();
    await page.waitForFunction(()=>document.querySelector('#exportStatus').textContent.toLowerCase().includes('cancelled'));
    progress.push(...await page.evaluate(()=>globalThis.ehs5dProgress));
    check(progress.some(value=>value.visible&&value.value>0&&value.value<1),'Numerical export progress was not exposed.');
    await field('[data-release-field=title]','Phone closure song');await field('[data-release-field=artist]','EggHeadStudio Test');
    await field('[data-release-field=album]','Mobile closure');
    const png=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='#77bdb2';ctx.fillRect(0,0,96,96);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const chooser=page.waitForEvent('filechooser');await page.locator('#chooseArtwork').click();
    await(await chooser).setFiles({name:'closure-cover.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.waitForFunction(()=>document.querySelector('#artworkStatus').textContent.startsWith('Prepared square'),null,{timeout:60000});
    await page.locator('#artResolution').selectOption('1000');
    await page.waitForFunction(()=>document.querySelector('#artworkStatus').textContent.startsWith('Prepared square 1000'));
    const release=await capture(()=>page.locator('#releaseZipStart').click());
    const packageInfo=await page.evaluate(async base64=>{
      const {unzipSync}=await import('/vendor/fflate/fflate.js'),files=unzipSync(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)));
      const metadata=JSON.parse(new TextDecoder().decode(files['metadata.json']));
      const audio=[];
      for(const [name,bytes]of Object.entries(files))if(name.startsWith('audio/')){
        const {inspectDownloadedEqAudio}=await import('/tests/eq-project-browser.js');
        audio.push({name,bytes:bytes.length,...await inspectDownloadedEqAudio(bytes)});
      }
      const mp3=Object.entries(files).find(([name])=>name.endsWith('.mp3'))[1],view=new DataView(mp3.buffer,mp3.byteOffset,mp3.byteLength),tags={};
      for(let offset=10;offset+10<mp3.length;){
        const id=new TextDecoder().decode(mp3.subarray(offset,offset+4));if(!/^[A-Z0-9]{4}$/.test(id))break;
        const size=view.getUint32(offset+4),payload=mp3.subarray(offset+10,offset+10+size);
        if(['TIT2','TPE1'].includes(id))tags[id]=new TextDecoder('utf-16').decode(payload.subarray(1));
        if(id==='APIC')tags.artwork=payload.length>100;
        offset+=10+size;
      }
      const wav=Object.entries(files).find(([name])=>name.endsWith('.wav'))[1],wavText=new TextDecoder().decode(wav);
      return{entries:Object.keys(files),metadata,audio,tags,wavMetadata:wavText.includes('Phone closure song')&&wavText.includes('EggHeadStudio Test'),hasId3:new TextDecoder().decode(mp3.subarray(0,3))==='ID3'};
    },release.base64);
    check(packageInfo.audio.length===2&&packageInfo.metadata.title==='Phone closure song'&&packageInfo.metadata.artist==='EggHeadStudio Test'&&packageInfo.tags.TIT2==='Phone closure song'&&packageInfo.tags.TPE1==='EggHeadStudio Test'&&packageInfo.tags.artwork&&packageInfo.wavMetadata&&packageInfo.hasId3&&packageInfo.entries.some(name=>name.startsWith('artwork/')),'Release contents/metadata/artwork failed.');
    results.export={cancelled:true,progress,release:{name:release.name,bytes:release.bytes.length,...packageInfo}};
    onStage({export:results.export});
    const snapshot=await read();
    if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
    const archive=await capture(()=>page.locator('#saveEhs').click());
    await field('#projectName','Unsaved mobile changes');
    if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
    await page.locator('#newProject').click();await page.locator('#cancelNewProject').click();
    check((await read()).tracks.length===snapshot.tracks.length,'New Project Cancel lost tracks.');
    if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
    await page.locator('#newProject').click();
    const savedJson=await capture(()=>page.locator('#saveAndNew').click());
    const saved=JSON.parse(savedJson.bytes.toString('utf8'));
    check(saved.name==='Unsaved mobile changes'&&saved.tracks.length===snapshot.tracks.length&&(await read()).tracks.length===0,'Save then New did not preserve the outgoing project.');
    await field('#projectName','Unsaved mobile changes');
    if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
    page.once('dialog',dialog=>dialog.dismiss());await page.locator('#importEhs').setInputFiles({name:archive.name,mimeType:'application/zip',buffer:archive.bytes});
    check((await read()).name==='Unsaved mobile changes','Declined .EHS replacement changed project.');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#importEhs').setInputFiles({name:archive.name,mimeType:'application/zip',buffer:archive.bytes});
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('pulse-project')).name!=='Unsaved mobile changes');
    check(JSON.stringify((await read()).tracks)===JSON.stringify(snapshot.tracks),'Accepted .EHS replacement lost takes.');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(JSON.stringify((await read()).tracks)===JSON.stringify(snapshot.tracks),'Reload lost saved takes.');
    results.project={newCancelPreserved:true,saveThenNewPreserved:true,importCancelPreserved:true,importRestored:true,reloadPreserved:true,archiveBytes:archive.bytes.length};
    check(!errors.length,errors.join('\n'));return{...results,pageErrors:errors};
  }finally{
    page.off('pageerror',onError);
    await page.evaluate(async()=>{
      globalThis.ehs5dStudio?.engine.stop();globalThis.ehs5dProgressObserver?.disconnect();globalThis.ehs5dRestore?.();
      for(const mic of globalThis.ehs5dMics||[]){mic.destination.stream.getTracks().forEach(track=>track.stop());mic.oscillator.stop();await mic.context.close()}
    });
  }
}
