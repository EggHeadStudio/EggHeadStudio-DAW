// Host-side Playwright acceptance. Use fresh disposable origins, never personal projects.
export async function runMobileProductionAcceptance(page,{cleanOrigin,onStage=()=>{},onArchive=()=>{}}={}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},steps=[],errors=[],failures=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const stage=(number,detail)=>{steps.push({number,detail});onStage({number,detail})};
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const field=async(selector,value)=>{const input=page.locator(selector).first();await input.fill(String(value));await input.press('Tab')};
  const numeric=async(selector,value)=>{const input=page.locator(selector).first().locator('..').locator('.parameter-number');await input.fill(String(value));await input.press('Tab')};
  const navigate=async key=>{
    await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${key}"]`).click();
  };
  let cdp;
  const touch=async(locator,dx=0,dy=0)=>{
    await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();check(box,'Touch target has no bounds.');
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/5,y:y+dy*i/5}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const download=async action=>{
    const [file]=await Promise.all([page.waitForEvent('download',{timeout:90000}),action()]);
    check(!await file.failure(),'Download failed.');
    const {readFile}=await import('node:fs/promises'),bytes=await readFile(await file.path());
    return{name:file.suggestedFilename(),base64:bytes.toString('base64'),bytes:bytes.length};
  };
  const inspect=reference=>page.evaluate(async reference=>{
    const fixture=await import(new URL('/tests/workspace-portable-browser.js',location.href));
    return fixture.inspectWorkspacePcm(reference);
  },reference);
  const compare=async(reference,label)=>{
    try{return await inspect(reference)}
    catch(error){
      if(!error.message.includes('Mixed render mismatch:'))throw error;
      const failure={label,error:error.message.split('\n')[0],maximumAllowedError:1e-4,maximumAllowedRmsError:1e-6};
      failures.push(failure);onStage({failed:failure});return failure;
    }
  };
  try{
    check(cleanOrigin,'Supply an unused cleanOrigin for portable restoration.');
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(await page.evaluate(()=>document.visibilityState==='visible'&&!localStorage.getItem('pulse-project')),'Use a visible, empty origin.');
    cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    stage(1,'Visible source loaded at 390x844');
    await page.locator('.project-menu>summary').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#newProject').click();
    check((await read()).tracks.length===0,'New Project did not clear the song.');stage(2,'New Project via Project menu');
    await navigate('sample');
    const bytes=await page.evaluate(async()=>{
      const {toWav}=await import(new URL('./audio.js',document.querySelector('script[type=module]').src));
      const buffer=new OfflineAudioContext(2,1,48000).createBuffer(2,192000,48000);
      for(let channel=0;channel<2;channel++)for(let i=0;i<buffer.length;i++)buffer.getChannelData(channel)[i]=.08*Math.sin(2*Math.PI*1000*i/48000)*(channel?.6:1);
      const bytes=new Uint8Array(await toWav(buffer).arrayBuffer());let binary='';
      for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return btoa(binary);
    });
    const chooser=page.waitForEvent('filechooser');await page.locator('#loadSample').click();
    await(await chooser).setFiles({name:'mobile-production-source.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes,'base64')});
    await page.waitForFunction(()=>document.querySelector('#sampleWave')?.dataset.length==='192000');
    stage(3,'Imported four-second stereo 1 kHz source via file picker');
    await touch(page.locator('#startMarker'),25,0);await touch(page.locator('#endMarker'),-25,0);
    check(Number(await page.locator('#sampleWave').getAttribute('data-start'))>0&&Number(await page.locator('#sampleWave').getAttribute('data-end'))<192000,'Waveform handles did not trim.');
    await field('#trimStart',.25);await field('#trimEnd',3.75);
    await page.locator('#waveZoomIn').click();await page.locator('#waveFit').click();
    stage(4,'Both waveform handles, exact 0.25-3.75 s selection and zoom/fit');
    await page.locator('#addSampleEffect').selectOption('eq');await page.locator('#loopPreview').click();
    await page.waitForFunction(()=>document.querySelector('.sample-studio').previewSession?.state==='playing');
    await page.evaluate(()=>globalThis.ehs5cSampleSource=document.querySelector('.sample-studio').previewSession.source);
    await numeric('#editGain',-3);await page.locator('.eq-selection select').selectOption('band-1');
    await numeric('[data-eq-value=frequency]',1000);await numeric('[data-eq-value=gain]',3);
    check(await page.evaluate(()=>document.querySelector('.sample-studio').previewSession.source===globalThis.ehs5cSampleSource),'Live sample edit restarted source.');
    await page.locator('#previewAB').click();await page.locator('#previewAB').click();await page.locator('#stopPreview').click();
    stage(5,'Gain/EQ changed during active preview without restarting source; A/B');
    await field('#sampleName','mobile-production-processed.wav');await page.locator('#saveSample').click();
    await page.waitForFunction(()=>document.querySelector('#sampleSaveState')?.textContent.includes('Saved sample ready'));
    stage(6,'Processed sample saved as new asset');
    await page.locator('#makeRack').click();stage(7,'Created Rack from saved processed sample');
    await navigate('arrange');
    if(await page.locator('#addFiles').isHidden())await page.locator('#toggleBrowser').click();
    const libraryChooser=page.waitForEvent('filechooser');await page.locator('#addFiles').click();
    await(await libraryChooser).setFiles({name:'mobile-production-source.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes,'base64')});
    await page.waitForFunction(()=>[...document.querySelectorAll('.sample-item')].some(element=>element.textContent.includes('mobile-production-source')));
    if(await page.locator('#toggleBrowser').getAttribute('aria-expanded')==='true')await page.locator('#toggleBrowser').click();
    await navigate('rack');
    await page.locator('#addPad').click();await page.locator('[data-choose-pad="1"]').first().click();
    await page.locator('.sample-picker-list>div').filter({hasText:'mobile-production-source.wav'}).getByRole('button',{name:'Select',exact:true}).click();
    let project=await read();check(project.tracks[0].drumRack.pads[0].asset!==project.tracks[0].drumRack.pads[1].asset,'Pads did not get different samples.');
    stage(8,'Assigned original and processed assets to different stable pads');
    await page.locator('#emptyPattern').click();await page.locator('#newPatternLength').selectOption('4');await page.locator('.track-setup button[type=submit]').click();
    for(const [pad,step]of [[0,0],[1,2],[0,4],[1,6]])await page.locator(`[data-step-pad="${pad}"][data-step="${step}"]`).click();
    await page.locator('#previewPad').click();stage(9,'Four drum hits and pad preview through UI');
    await navigate('sample');await page.locator('#makeSampler').click();stage(10,'Created Sampler from same saved processed sample');
    await page.locator('#emptyPattern').click();await page.locator('#newPatternLength').selectOption('4');await page.locator('.track-setup button[type=submit]').click();
    await page.getByRole('button',{name:'Expand Piano Roll',exact:true}).click();
    await page.locator('#pianoTouchMode').selectOption('draw');
    for(const [midi,beat]of [[60,1],[64,2]]){
      const lane=page.locator(`.piano-lane[data-midi="${midi}"]`);await page.locator('#pianoScroll').evaluate(e=>e.scrollLeft=0);
      await lane.hover({position:{x:beat*40+3,y:11}});const box=await lane.boundingBox(),x=box.x+beat*40+3,y=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(count=>document.querySelectorAll('.piano-note').length===count,beat);
    }
    if(await page.locator('#velocityPanel').getAttribute('open')===null)await page.locator('#velocityPanel>summary').click();
    const velocity=page.locator('.velocity-bar').first(),velocityBefore=(await read()).tracks[1].patterns[0].notes.map(note=>note.velocity);
    await touch(velocity,0,15);
    project=await read();check(project.tracks[1].patterns[0].notes.length===2,'Melody notes missing.');
    check(JSON.stringify(project.tracks[1].patterns[0].notes.map(note=>note.velocity))!==JSON.stringify(velocityBefore),'Connected velocity gesture did not edit notes.');
    await page.locator('.mobile-editor-exit').click();stage(11,'Touch-authored two-note melody and velocity editing');
    await navigate('arrange');project=await read();
    check(project.tracks.length===2&&project.tracks.every(track=>track.clips.length===1),'Instrument Arrangement clips missing.');stage(12,'Independent Rack and Sampler clips arranged at beat zero');
    await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#selectLoopRange').click();
    await field('#rangeStart',0);await field('#rangeEnd',4);await page.locator('#rangeFirstTrack').selectOption('0');await page.locator('#rangeLastTrack').selectOption('1');
    stage(13,'Selected beats 0-4 across both instrument tracks');
    await page.locator('#duplicateSection').click();
    project=await read();check(project.tracks.every(track=>track.clips.length===2&&track.clips[1].bar===1),'Mixed section duplication failed.');
    await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#clearRange').click();stage(14,'Duplicated two-track section to beats 4-8');
    await navigate('recording');await page.locator('#newRecordingTrack').click();await field('#recordingTrackName','Mobile synthetic take');
    await page.locator('#recordingArm').check();await page.locator('#recordingCountIn').selectOption('1');await field('#recordingPosition',0);
    await page.locator('[data-backing]').first().uncheck();await page.locator('[data-backing]').first().check();
    stage(15,'Recording track created, armed, one-bar count-in and backing selected');
    await page.evaluate(()=>{
      const original=navigator.mediaDevices.getUserMedia;
      globalThis.ehs5cRestoreMic=()=>{navigator.mediaDevices.getUserMedia=original};
      navigator.mediaDevices.getUserMedia=async()=>{
        const context=new AudioContext(),destination=context.createMediaStreamDestination(),oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.frequency.value=523.25;gain.gain.value=.12;oscillator.connect(gain).connect(destination);oscillator.start();context.resume();
        globalThis.ehs5cMic={context,oscillator,destination};return destination.stream;
      };
    });
    await page.locator('#studioRecord').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='count-in');
    await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='recording');
    await page.waitForFunction(()=>Number(document.querySelector('#recordingLevel').value)>.05);
    await page.waitForFunction(()=>document.querySelector('#recordingTime').textContent>='00:02.000');
    await page.locator('#studioStop').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='idle');
    check(await page.locator('[data-take]').count()===1,'Recorded take was not saved.');
    await page.evaluate(async()=>{globalThis.ehs5cMic.oscillator.stop();await globalThis.ehs5cMic.context.close()});
    stage(16,'Synthetic 523.25 Hz microphone captured over backing, live meter, Stop & Save');
    const takeId=await page.locator('[data-take]').getAttribute('data-take');
    await page.locator(`[data-preview-take="${takeId}"]`).click();
    for(const [key,value]of [['start',.1],['end',1.8],['fadeIn',.05],['fadeOut',.1],['gain',.8],['bar',.5]])await field(`[data-take-value="${takeId}"][data-key="${key}"]`,value);
    await page.locator(`[data-activate-take="${takeId}"]`).click();
    await page.locator('#studioRecord').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='count-in');
    await page.locator('#studioCancel').click();await page.waitForFunction(()=>document.querySelector('.recording-studio').dataset.recordingState==='idle');
    check(await page.locator('[data-take]').count()===1,'Cancelled count-in changed saved takes.');
    await page.evaluate(async()=>{globalThis.ehs5cMic.oscillator.stop();await globalThis.ehs5cMic.context.close();globalThis.ehs5cRestoreMic()});
    await page.locator(`[data-open-take="${takeId}"]`).click();
    project=await read();const take=project.tracks[2].clips.find(clip=>clip.id===takeId);
    check(take.start===.1&&take.end===1.8&&take.bar===.5&&take.gain===.8&&!take.mute,'Take review edits did not persist.');
    check(await page.locator(`[data-clip="${takeId}"]`).count()===1,'Take missing in Arrangement.');stage(17,'Previewed, trimmed, faded, gained, moved and activated saved take; second count-in cancelled without losing take');
    await page.getByRole('button',{name:'Selected track Mixer',exact:true}).click();
    await numeric('.mobile-expanded-editor [data-vol="2"]',.7);await numeric('.mobile-expanded-editor [data-pan="2"]',-.15);
    await page.locator('.mobile-expanded-editor [data-fx="2"]').click();await page.locator('#addTrackEffect').selectOption('eq');
    stage(18,'Take mixed through selected-track mobile Mixer and EQ device');
    await navigate('master');await page.locator('#masterMode').selectOption('advanced');
    await page.locator('#masterMultibandEnabled').check();await page.locator('#masterImagerEnabled').check();await page.locator('#masterLimiterEnabled').check();
    await numeric('[data-master-param="imager.width"]',.8);await numeric('[data-master-param="multiband.bands.0.threshold"]',-24);
    await numeric('[data-master-param="limiter.ceiling"]',-1.5);await numeric('[data-master-param="outputGainDb"]',-2);
    await page.locator('#renderMasterPreview').click();await page.waitForFunction(()=>document.querySelector('#masterRenderStatus').textContent.startsWith('Rendered'),null,{timeout:90000});
    await page.locator('#masterLevelMatch').uncheck();await page.locator('#masterPlay').click();
    await page.waitForFunction(()=>document.querySelector('.mastering-studio').auditionSession?.graph);
    await page.locator('.graphical-eq .eq-selection select').selectOption('band-2');
    await numeric('[data-eq-value=frequency]',1000);await touch(page.locator('[data-eq-node="band-2"]'),8,-10);
    await page.locator('.eq-plot').scrollIntoViewIfNeeded();await page.waitForFunction(()=>Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)>0);
    const fft=await page.locator('.graphical-eq').getAttribute('data-spectrum-peak-hz');
    await page.locator('#masterCompare').click();await page.locator('#masterCompare').click();await page.locator('#masterStop').click();
    await page.locator('#renderMasterPreview').click();await page.waitForFunction(()=>document.querySelector('#masterRenderStatus').textContent.startsWith('Rendered'),null,{timeout:90000});
    const measurements=await page.locator('#masterIntegrated,#masterTruePeak').allTextContents();
    check(measurements.every(text=>/[0-9]/.test(text)),'Final loudness/true-peak analysis missing.');
    stage(19,`Mobile master modules, touch EQ, actual FFT ${fft} Hz, live A/B and final analysis: ${measurements.join(', ')}`);
    const reference=await inspect(),repeated=await compare(reference,'Repeated original render'),outputs=[];
    const originalPcm=await page.evaluate(async reference=>{
      const compressed=Uint8Array.from(atob(reference.compressedBase64),c=>c.charCodeAt(0));
      const pcm=new Float32Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      let square=0,peak=0;for(const value of pcm){square+=value*value;peak=Math.max(peak,Math.abs(value))}
      return{...reference.shape,rms:Math.sqrt(square/pcm.length),peak};
    },reference);
    await page.locator('#masterExport').click();
    for(const format of ['wav','mp3']){
      await page.locator('#exportFormat').selectOption(format);
      const file=await download(()=>page.locator('#exportStart').click());
      const audio=await page.evaluate(async base64=>{
        const {inspectDownloadedEqAudio}=await import(new URL('/tests/eq-project-browser.js',location.href));
        const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),metrics=await inspectDownloadedEqAudio(bytes);
        const buffer=await new OfflineAudioContext(2,1,48000).decodeAudioData(bytes.buffer),data=buffer.getChannelData(0);
        let real=0,imaginary=0,count=0;
        for(let i=Math.round(1.2*buffer.sampleRate);i<Math.min(data.length,Math.round(2.5*buffer.sampleRate));i++){
          const phase=2*Math.PI*523.25*i/buffer.sampleRate;real+=data[i]*Math.cos(phase);imaginary+=data[i]*Math.sin(phase);count++;
        }
        return{...metrics,recordedToneAmplitude:2*Math.hypot(real,imaginary)/count};
      },file.base64);
      check(audio.rms>.001&&audio.peak<1,'Silent or clipped mobile export.');
      check(audio.recordedToneAmplitude>.005,`${format} does not contain the synthetic recorded tone.`);
      check(Math.abs(20*Math.log10(audio.rms/originalPcm.rms))<.15,`${format} differs from committed master level.`);
      outputs.push({format,name:file.name,bytes:file.bytes,...audio});
    }
    const recordingSignal=await page.evaluate(async()=>{
      const {AudioEngine}=await import(new URL('./audio.js',document.querySelector('script[type=module]').src));
      const {getProjectAssetIds}=await import(new URL('./portable-project.js',document.querySelector('script[type=module]').src));
      const project=JSON.parse(localStorage.getItem('pulse-project')),buffers=new Map(),context=new OfflineAudioContext(2,1,48000);
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try{for(const id of getProjectAssetIds(project)){const file=await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});buffers.set(id,await context.decodeAudioData(await file.arrayBuffer()))}}finally{db.close()}
      const full=await new AudioEngine().render(project,buffers),without=structuredClone(project);
      without.tracks=without.tracks.filter(track=>!track.clips.some(clip=>clip.recording));
      const backing=await new AudioEngine().render(without,buffers);let square=0;
      for(let channel=0;channel<full.numberOfChannels;channel++)for(let i=0;i<full.length;i++){const delta=full.getChannelData(channel)[i]-(backing.getChannelData(channel)[i]||0);square+=delta*delta}
      return{differenceRms:Math.sqrt(square/(full.length*full.numberOfChannels)),recordings:project.tracks.flatMap(track=>track.clips).filter(clip=>clip.recording).length};
    });
    check(recordingSignal.differenceRms>.001,'Recorded take does not contribute to final master.');
    stage(20,'Downloaded and independently decoded mastered WAV/MP3; recorded-take contribution measured');
    if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
    const archive=await download(()=>page.locator('#saveEhs').click()),before=await read();
    await onArchive(archive);
    stage(21,`Downloaded same-project .EHS: ${archive.bytes} bytes`);
    await page.goto(cleanOrigin);await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    const initial=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try{return{autosave:localStorage.getItem('pulse-project'),assets:await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}}finally{db.close()}
    });
    check(initial.autosave===null&&initial.assets===0,'Restoration origin was not empty.');
    await page.locator('#importEhs').setInputFiles({name:archive.name,mimeType:'application/zip',buffer:Buffer.from(archive.base64,'base64')});
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Portable project opened'),null,{timeout:90000});
    const after=await read();check(JSON.stringify(after.tracks)===JSON.stringify(before.tracks)&&JSON.stringify(after.mastering)===JSON.stringify(before.mastering),'Restored song/settings differ.');
    const restored=await compare(reference,'Restored render');await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#play').textContent==='Ⅱ');await page.locator('#stop').click();
    stage(22,restored.error?'Empty-origin settings restored; numerical render failed the unchanged tolerance':'Empty-origin assets, clip/pattern/take/effect/master settings, source PCM hashes and numerical render verified');
    check(!errors.length,errors.join('\n'));
    const evidence={passed:!failures.length,failures,steps,viewport:{width:390,height:844},tracks:before.tracks.length,outputs,recordingSignal,archiveBytes:archive.bytes,originalPcm,repeated,restored,initial,pageErrors:errors};
    if(failures.length)throw Object.assign(new Error('Connected workflow has failed numerical acceptance gates.'),{evidence});
    return evidence;
  }finally{
    if(cdp)await cdp.detach();page.off('pageerror',onError);
    await page.evaluate(async()=>{globalThis.ehs5cRestoreMic?.();if(globalThis.ehs5cMic?.context.state!=='closed')await globalThis.ehs5cMic?.context.close()});
  }
}
