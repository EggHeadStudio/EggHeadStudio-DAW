// Continue on the disposable origin prepared by cross-workspace-browser.js.
export async function runWorkspaceTransportAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const space=async()=>{await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Space')};
  const numeric=async(selector,value)=>{const field=page.locator(selector).first().locator('..').locator('.parameter-number');await field.fill(String(value));await field.press('Tab')};
  const songSpace=async()=>{
    await space();await page.waitForFunction(()=>document.querySelector('#play').textContent==='Ⅱ');await space();
    check(await page.locator('#play').textContent()==='▶','Song transport did not pause.');
  };
  const sameMaster=()=>page.evaluate(()=>document.querySelector('.mastering-studio').auditionSession?.source===globalThis.ehs4bMasterSource);
  const rms=()=>page.evaluate(async()=>{
    const state=document.querySelector('.mastering-studio').auditionSession,data=new Float32Array(state.analyser.fftSize);let square=0;
    for(let i=0;i<10;i++){state.analyser.getFloatTimeDomainData(data);for(const value of data)square+=value*value;await new Promise(resolve=>setTimeout(resolve,20))}
    return Math.sqrt(square/(10*data.length));
  });
  let recordingResult;
  try{
    await page.setViewportSize({width:1280,height:1100});await page.locator('[data-view=sample]').click();await page.locator('#makeSampler').click();
    await page.locator('#emptyPattern').click();await page.locator('.track-setup button[type=submit]').click();
    await page.locator('.source-configuration>summary').click();
    await numeric('#samplerAttack',.02);await numeric('#samplerFineTune',10);
    const lane=page.locator('.piano-lane[data-midi="60"]');await lane.hover({position:{x:10,y:8}});await lane.click({position:{x:10,y:8}});
    await songSpace();await page.locator('[data-view=sample]').click();await page.locator('#makeRack').click();
    await page.locator('#emptyPattern').click();await page.locator('.track-setup button[type=submit]').click();
    await page.locator('[data-step-pad="0"][data-step="0"]').click();await numeric('[data-pad-volume]',.7);await page.locator('#previewPad').click();await songSpace();
    const instruments=await page.evaluate(()=>{const project=JSON.parse(localStorage.getItem('pulse-project')),sampler=project.tracks.find(track=>track.sampler),rack=project.tracks.find(track=>track.drumRack);return{samplerAsset:sampler.sampler.asset,padAsset:rack.drumRack.pads[0].asset,samplerNotes:sampler.patterns.flatMap(pattern=>pattern.notes).length,drumNotes:rack.patterns.flatMap(pattern=>pattern.notes).length,attack:sampler.sampler.attack,fine:sampler.sampler.fineTune,padGain:rack.drumRack.pads[0].volume}});
    check(instruments.samplerAsset===instruments.padAsset&&instruments.samplerNotes&&instruments.drumNotes,'Sample reuse or pattern creation failed.');
    check(instruments.attack===.02&&instruments.fine===10&&instruments.padGain===.7,'Shared instrument scalar bindings failed.');
    await page.locator('[data-view=arrange]').click();await page.getByRole('button',{name:'Select Drums track',exact:true}).click();
    if(await page.locator('#toggleBrowser').getAttribute('aria-expanded')==='false')await page.locator('#toggleBrowser').click();
    await page.locator('[data-add]').first().click();await page.locator('#clipLoop').check();await page.locator('#clipDuration').fill('30');await page.locator('#clipDuration').press('Tab');
    await page.locator('#addTrackEffect').selectOption('eq');
    await page.evaluate(async()=>{
      const {RecordingStudio}=await import('./src/recording-studio.js'),mount=RecordingStudio.prototype.mount,mic=navigator.mediaDevices.getUserMedia;
      globalThis.ehs4bRestoreRecording=()=>{RecordingStudio.prototype.mount=mount;navigator.mediaDevices.getUserMedia=mic};
      RecordingStudio.prototype.mount=function(...args){globalThis.ehs4bStudio=this;return mount.apply(this,args)};
      navigator.mediaDevices.getUserMedia=async()=>{
        const context=globalThis.ehs4bStudio.engine.ctx,destination=context.createMediaStreamDestination(),oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.frequency.value=523.25;gain.gain.value=.15;oscillator.connect(gain).connect(destination);oscillator.start();
        globalThis.ehs4bMic={oscillator,gain,destination};return destination.stream;
      };
    });
    await page.getByRole('button',{name:'Recording Studio',exact:true}).click();await space();await page.waitForFunction(()=>document.querySelector('#play').textContent==='Ⅱ');
    const backing=page.locator('[data-backing-volume]').first();
    await backing.evaluate(input=>{input.value='.4';input.dispatchEvent(new Event('input',{bubbles:true}))});
    const backingMix=await page.evaluate(()=>{const studio=globalThis.ehs4bStudio,track=studio.getProject().tracks[0];return{original:track.volume,live:studio.engine.trackNodes.get(track.id).gain.gain.value}});
    check(Math.abs(backingMix.live-backingMix.original*.4)<1e-6,'Idle backing mix was not live.');
    await space();
    await page.locator('.recording-advanced>summary').click();await page.locator('#recordingArm').check();await page.locator('#recordingCountIn').selectOption('0');
    await page.locator('#studioRecord').click();await page.waitForFunction(()=>globalThis.ehs4bStudio.state==='recording');
    await space();await page.waitForTimeout(300);
    check(await page.evaluate(()=>globalThis.ehs4bStudio.state==='recording'),'Space changed the active microphone recording.');
    check((await page.locator('#toast').textContent()).includes('Space is disabled'),'Recording Space safety notification missing.');
    await page.locator('#studioStop').click();await page.waitForFunction(()=>globalThis.ehs4bStudio.state==='idle');
    recordingResult=await page.evaluate(()=>{
      const studio=globalThis.ehs4bStudio,clip=studio.target.clips.findLast(clip=>clip.recording),buffer=studio.buffers.get(clip.asset),data=buffer.getChannelData(0);
      let square=0,peak=0;for(const value of data){square+=value*value;peak=Math.max(peak,Math.abs(value))}
      return{backingOriginal:studio.getProject().tracks[0].volume,frames:buffer.length,rms:Math.sqrt(square/data.length),peak,recordingPreserved:true};
    });
    check(recordingResult.rms>.09&&recordingResult.peak<.151,'Backing or monitoring processing leaked into the dry synthetic recording.');
    await page.evaluate(()=>{const m=globalThis.ehs4bMic;m.oscillator.stop();m.oscillator.disconnect();m.gain.disconnect();m.destination.disconnect();globalThis.ehs4bRestoreRecording()});
    await page.locator('[data-view=master]').click();await page.locator('#masterMode').selectOption('advanced');await page.locator('#renderMasterPreview').click();
    await page.waitForFunction(()=>document.querySelector('#masterRenderStatus').textContent.startsWith('Rendered'),null,{timeout:60000});
    await page.locator('#masterLevelMatch').uncheck();await space();
    await page.waitForFunction(()=>Boolean(document.querySelector('.mastering-studio').auditionSession?.graph));await page.waitForTimeout(4500);
    await page.evaluate(()=>globalThis.ehs4bMasterSource=document.querySelector('.mastering-studio').auditionSession.source);
    const initial=await rms();await numeric('[data-master-param="outputGainDb"]',-6);await page.waitForTimeout(100);const quiet=await rms();
    const outputDb=20*Math.log10(quiet/initial);check(Math.abs(outputDb+6)<.3,`Master live output gain ${outputDb}`);check(await sameMaster(),'Output edit restarted master.');
    await numeric('[data-master-param="outputGainDb"]',0);
    const graph=page.locator('.graphical-eq');await graph.locator('.eq-selection select').selectOption('band-2');
    await numeric('[data-eq-value=frequency]',1000);await numeric('[data-eq-value=gain]',6);await page.waitForTimeout(150);
    const boosted=await rms(),masterEqDb=20*Math.log10(boosted/initial);check(Math.abs(masterEqDb-6)<.4,`Master live EQ ${masterEqDb}`);
    check(await sameMaster(),'EQ edit restarted master.');
    await numeric('[data-eq-value=gain]',0);await page.locator('#masterSatEnabled').check();await numeric('[data-master-param="saturation.mix"]',.4);await numeric('[data-master-param="saturation.drive"]',6);
    await page.locator('#masterImagerEnabled').check();await numeric('[data-master-param="imager.width"]',0);
    await page.locator('#masterMultibandEnabled').check();await numeric('[data-master-param="multiband.bands.1.threshold"]',-40);await numeric('[data-master-param="multiband.bands.1.ratio"]',8);
    await page.waitForTimeout(250);const reduction=await page.evaluate(()=>document.querySelector('.mastering-studio').auditionSession.graph.multibandGainReduction[1]);
    check(reduction>3,`Master dynamics reduction missing: ${reduction}`);
    await page.locator('#masterLimiterEnabled').check();await numeric('[data-master-param="limiter.ceiling"]',-6);
    await page.locator('[data-workflow-master-move="eq-1"]').click();check(await sameMaster(),'Reorder restarted master.');
    await page.locator('#resetMaster').click();check(await sameMaster(),'Reset restarted master.');
    check((await page.locator('#masterLevelMatchStatus').textContent()).includes('pending'),'Cached A/B analysis was not invalidated.');
    await space();check(await page.evaluate(()=>document.querySelector('.mastering-studio').auditionSession===null),'Master Space did not pause.');
    await space();check(await page.evaluate(()=>document.querySelector('.mastering-studio').auditionSession.offset>0),'Master Space did not preserve offset.');
    await page.locator('#masterCompare').click();check(await page.evaluate(()=>document.querySelector('.mastering-studio').auditionSession.graph===null),'A comparison was mastered twice.');
    await page.locator('#masterCompare').click();await page.locator('#masterStop').click();await page.waitForTimeout(60);
    await page.locator('[data-view=export]').click();await songSpace();
    await page.locator('[data-view=arrange]').click();check(!errors.length,errors.join('; '));
    return{instruments,samplerSpace:true,drumSpace:true,backingLive:true,recording:recordingResult,master:{outputDb,masterEqDb,reduction,sourcePreserved:true,pauseOffset:true,aBypass:true,analysisInvalidated:true},exportSongSpace:true,pageErrors:errors};
  }finally{
    page.off('pageerror',onError);
    await page.evaluate(()=>{globalThis.ehs4bRestoreRecording?.();delete globalThis.ehs4bRestoreRecording;delete globalThis.ehs4bMasterSource;delete globalThis.ehs4bStudio;delete globalThis.ehs4bMic});
  }

}

export async function runRecordingMonitorAcceptance(page){
    const check=(condition,message)=>{if(!condition)throw new Error(message)};
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    await page.locator('#addTrackEffect').selectOption('utility');
    const gain=page.locator('[data-effect-param][data-param=gain]').locator('..').locator('.parameter-number');
    await gain.fill('-12');await gain.press('Tab');
    await page.evaluate(async()=>{
      const {RecordingStudio}=await import('./src/recording-studio.js'),mount=RecordingStudio.prototype.mount,mic=navigator.mediaDevices.getUserMedia;
      globalThis.ehs4bRestoreMonitor=()=>{RecordingStudio.prototype.mount=mount;navigator.mediaDevices.getUserMedia=mic};
      RecordingStudio.prototype.mount=function(...args){globalThis.ehs4bMonitorStudio=this;return mount.apply(this,args)};
      navigator.mediaDevices.getUserMedia=async()=>{
        const context=globalThis.ehs4bMonitorStudio.engine.ctx,destination=context.createMediaStreamDestination(),oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.frequency.value=523.25;gain.gain.value=.15;oscillator.connect(gain).connect(destination);oscillator.start();
        globalThis.ehs4bMonitorMic={oscillator,gain,destination};return destination.stream;
      };
    });
    try{
      await page.getByRole('button',{name:'Recording Studio',exact:true}).click();
      await page.locator('.recording-advanced>summary').click();await page.locator('#recordingArm').check();await page.locator('#recordingCountIn').selectOption('0');
      await page.locator('#studioRecord').click();await page.waitForFunction(()=>globalThis.ehs4bMonitorStudio.state==='recording');
      await page.locator('#recordingMonitor').check();await page.waitForFunction(()=>globalThis.ehs4bMonitorStudio.capture.monitor.gain.value>.99);
      await page.locator('#recordingMonitor').uncheck();await page.waitForFunction(()=>globalThis.ehs4bMonitorStudio.capture.monitor.gain.value<.01);
      check(await page.evaluate(()=>globalThis.ehs4bMonitorStudio.state==='recording'),'Monitor toggle changed capture state.');
      await page.waitForTimeout(500);await page.locator('#studioStop').click();await page.waitForFunction(()=>globalThis.ehs4bMonitorStudio.state==='idle');
      const dry=await page.evaluate(()=>{
        const studio=globalThis.ehs4bMonitorStudio,clip=studio.target.clips.findLast(c=>c.recording),buffer=studio.buffers.get(clip.asset),data=buffer.getChannelData(0);let square=0,peak=0;
        for(const value of data){square+=value*value;peak=Math.max(peak,Math.abs(value))}
        return{rms:Math.sqrt(square/data.length),peak,frames:data.length,microphoneEnded:globalThis.ehs4bMonitorMic.destination.stream.getTracks().every(track=>track.readyState==='ended')};
      });
      check(dry.rms>.1&&dry.peak<.151&&dry.microphoneEnded,'Monitor/track processing altered dry capture or leaked input.');
      await page.locator('[data-preview-take]').last().click();await page.waitForTimeout(100);
      const preview=await page.evaluate(()=>{
        const studio=globalThis.ehs4bMonitorStudio,graph=studio.engine.trackNodes.get(studio.target.id),meter=graph.readMeter();
        return{sources:studio.engine.sources.length,rms:meter.leftRms,effectGain:graph.instances.values().next().value.ll.gain.value};
      });
      check(preview.sources>0&&preview.rms>.005&&preview.rms<.04,'Take preview did not use the actual attenuated track graph.');
      return{monitorOnOff:true,dry,preview};
    }finally{
      await page.evaluate(()=>{
        const studio=globalThis.ehs4bMonitorStudio;if(studio?.busy)studio.cancel();studio?.engine.stop();
        const mic=globalThis.ehs4bMonitorMic;if(mic){mic.oscillator.stop();mic.oscillator.disconnect();mic.gain.disconnect();mic.destination.disconnect()}
        globalThis.ehs4bRestoreMonitor?.();delete globalThis.ehs4bMonitorStudio;delete globalThis.ehs4bMonitorMic;delete globalThis.ehs4bRestoreMonitor;
      });
    }
}
