// Host-side Page fixture. Run on a disposable origin, never user project storage.
export async function runCrossWorkspaceAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const numeric=async(selector,value)=>{
    const input=page.locator(selector),field=input.locator('..').locator('.parameter-number');
    await field.fill(String(value));await field.press('Tab');
  };
  const settle=(seconds=.15)=>page.evaluate(async seconds=>{
    const context=document.querySelector('.sample-studio').previewSession.context,end=context.currentTime+seconds,deadline=performance.now()+10000;
    while(context.currentTime<end){if(performance.now()>deadline)throw new Error('Sample audio clock did not advance.');await new Promise(resolve=>setTimeout(resolve,10))}
  },seconds);
  const measure=()=>page.evaluate(async()=>{
    const session=document.querySelector('.sample-studio').previewSession;
    let square=0;for(let i=0;i<20;i++){const value=session.graph.readMeter().leftRms;square+=value*value;await new Promise(resolve=>setTimeout(resolve,20))}
    return Math.sqrt(square/20);
  });
  const sameSource=()=>page.evaluate(()=>document.querySelector('.sample-studio').previewSession.source===globalThis.ehs4bSource);
  const space=async()=>{
    await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Space');
  };
  try{
    await page.setViewportSize({width:1280,height:1100});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use empty disposable origin.');
    await page.locator('[data-view=sample]').click();
    await page.evaluate(async()=>{
      const {toWav}=await import('./src/audio.js'),context=new OfflineAudioContext(2,1,48000),buffer=context.createBuffer(2,48000*4,48000);
      for(let channel=0;channel<2;channel++)for(let frame=0;frame<buffer.length;frame++)buffer.getChannelData(channel)[frame]=.08*Math.sin(2*Math.PI*1000*frame/48000)*(channel? .5:1);
      const file=new File([toWav(buffer)],'4b-live-tone.wav',{type:'audio/wav'}),original=HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click=function(){if(this.type==='file'){const transfer=new DataTransfer();transfer.items.add(file);this.files=transfer.files;this.dispatchEvent(new Event('change'));return}original.call(this)};
      try{document.querySelector('#loadSample').click()}finally{HTMLInputElement.prototype.click=original}
    });
    await page.waitForFunction(()=>document.querySelector('#sampleWave')?.dataset.length==='192000');
    await page.locator('#addSampleEffect').selectOption('eq');await page.locator('#loopPreview').click();
    await page.waitForFunction(()=>document.querySelector('.sample-studio').previewSession?.state==='playing');
    await page.evaluate(()=>{globalThis.ehs4bSource=document.querySelector('.sample-studio').previewSession.source});
    const graph=page.locator('.graphical-eq');
    await graph.locator('[data-eq-smoothing]').fill('0');await graph.locator('[data-eq-smoothing]').dispatchEvent('change');
    await graph.locator('.eq-selection select').selectOption('band-1');await numeric('[data-eq-value=frequency]',1000);
    await settle();const initial=await measure();
    await numeric('#editGain',-6);await settle();const gain=await measure();
    await numeric('#editGain',0);await numeric('[data-eq-value=gain]',6);await settle();const boost=await measure();
    await numeric('[data-eq-value=gain]',0);await graph.locator('.eq-selection select').selectOption('highCut');await numeric('[data-eq-value=frequency]',100);
    await settle();const cut=await measure();
    await numeric('[data-eq-value=frequency]',20000);await graph.locator('.eq-selection select').selectOption('band-1');
    const db=(a,b)=>20*Math.log10(a/b),gainDb=db(gain,initial),boostDb=db(boost,initial),cutDb=db(cut,initial);
    check(Math.abs(gainDb+6)<.2,`Live sample gain ${gainDb}`);check(Math.abs(boostDb-6)<.2,`Live sample EQ ${boostDb}`);check(cutDb< -30,`Live sample filter ${cutDb}`);
    check(await sameSource(),'Live gain/EQ restarted the sample.');
    await page.locator('#addSampleEffect').selectOption('compressor');
    const compressor='[data-sample-fx-param="1"]';
    await numeric(`${compressor}[data-param=threshold]`,0);await numeric(`${compressor}[data-param=ratio]`,1);await settle(.25);const uncompressed=await measure();
    await numeric(`${compressor}[data-param=threshold]`,-40);await numeric(`${compressor}[data-param=ratio]`,12);await settle(.35);const compressed=await measure(),compressionDb=db(compressed,uncompressed);
    check(Math.abs(compressionDb)>3,`Live compressor ineffective: ${compressionDb}`);check(await sameSource(),'Compressor restarted source.');
    await page.locator('[data-sample-fx-enabled="1"]').uncheck();
    await page.locator('.sample-effect').nth(1).locator('.device-fold').click();
    for(const type of ['delay','reverb','saturation']){await page.locator('#addSampleEffect').selectOption(type);check(await sameSource(),`${type} insertion restarted source.`);check(await page.locator('.sample-effect').nth(1).locator('.device-body').isHidden(),'Structural edit lost collapsed state.')}
    for(const [index,key,value]of [[2,'feedback',.4],[2,'mix',.2],[3,'decay',.3],[3,'mix',.1],[4,'drive',4],[4,'mix',.15]])await numeric(`[data-sample-fx-param="${index}"][data-param="${key}"]`,value);
    check(await sameSource(),'Delay/reverb/saturation edits restarted source.');
    await page.locator('[data-sample-toggle=sync]').check();
    await page.locator('#bpm').fill('90');await page.locator('#bpm').press('Tab');
    const syncedDelay=await page.evaluate(()=>[...document.querySelector('.sample-studio').previewSession.graph.instances.values()].find(instance=>instance.type==='delay').delay.delayTime.value);
    check(Math.abs(syncedDelay-2/3)<1e-6&&await sameSource(),'Tempo-synced sample delay did not update live.');
    await page.locator('#bpm').fill('120');await page.locator('#bpm').press('Tab');
    for(const index of [2,3,4])await page.locator(`[data-sample-fx-enabled="${index}"]`).uncheck();
    const layouts=[];
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1100});await graph.locator('.eq-selection select').selectOption('band-1');await numeric('[data-eq-value=gain]',0);
      const point=graph.locator('[data-eq-node=band-1]');await point.hover();
      const cdp=await page.context().newCDPSession(page);
      try{
        await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
        const box=await point.boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+8,y:start.y-10}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        check(await graph.locator('[data-eq-value=gain]').inputValue()!=='0',`EQ touch failed at ${width}`);
        const rotary=page.locator('#editGain');await rotary.scrollIntoViewIfNeeded();const knob=await rotary.boundingBox(),at={x:knob.x+knob.width/2,y:knob.y+knob.height/2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:at.x,y:at.y-10}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        check(Number(await rotary.inputValue())>0,`Rotary touch failed at ${width}`);
        const wave=page.locator('#sampleWave');await wave.hover();const waveBox=await wave.boundingBox(),waveStart={x:waveBox.x+waveBox.width*.25,y:waveBox.y+waveBox.height*.5};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[waveStart]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:waveStart.x+waveBox.width*.4,y:waveStart.y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        check(Number(await wave.getAttribute('data-start'))>0&&Number(await wave.getAttribute('data-end'))<192000,`Waveform selection failed at ${width}`);
        await page.locator('#trimStart').fill('0');await page.locator('#trimStart').press('Tab');await page.locator('#trimEnd').fill('4');await page.locator('#trimEnd').press('Tab');
        const chain=page.locator('.sample-device-chain');await chain.scrollIntoViewIfNeeded();
        await chain.evaluate(element=>element.scrollLeft=0);const chainBox=await chain.boundingBox();
        const scrollStart={x:chainBox.x+chainBox.width*.7,y:chainBox.y+2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[scrollStart]});
        for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:scrollStart.x-i*25,y:scrollStart.y}]});await page.waitForTimeout(20)}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);
        check(await chain.evaluate(element=>element.scrollLeft)>0,`Effect rack did not scroll at ${width}`);
        for(const [selector,state]of [['#stopPreview','stopped'],['#loopPreview','playing']]){
          const button=page.locator(selector);await button.hover();const box=await button.boundingBox(),at={x:box.x+box.width/2,y:box.y+box.height/2};
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(state=>document.querySelector('.sample-studio').previewSession.state===state,state);
        }
      }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach()}
      await numeric('#editGain',0);await numeric('[data-eq-value=frequency]',1000);await numeric('[data-eq-value=gain]',0);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);check(!overflow,`Overflow at ${width}`);
      layouts.push({width,touchEq:true,touchRotary:true,touchWaveform:true,touchPreview:true,touchRackScroll:true,numeric:true,overflow});
    }
    await numeric('#editGain',-3);await page.locator('#sampleUndo').click();check(Number(await page.locator('#editGain').inputValue())===0,'Gain numeric edit needed multiple Undo steps.');
    await page.locator('#sampleRedo').click();check(Number(await page.locator('#editGain').inputValue())===-3,'Gain Redo failed.');
    await numeric('#editGain',0);await page.locator('#loopPreview').click();await page.waitForFunction(()=>document.querySelector('.sample-studio').previewSession.state==='playing');
    await space();check(await page.evaluate(()=>document.querySelector('.sample-studio').previewSession.state==='paused'),'Sample Space did not pause.');
    const paused=await page.evaluate(()=>document.querySelector('.sample-studio').previewSession.position);await page.waitForTimeout(100);
    check(await page.evaluate(()=>document.querySelector('.sample-studio').previewSession.position)===paused,'Paused sample advanced.');
    await space();check(await page.evaluate(()=>document.querySelector('.sample-studio').previewSession.state==='playing'),'Sample Space did not resume.');
    await page.locator('#sampleName').fill('4b-processed-once.wav');await page.locator('#sampleName').press('Space');
    check(await page.evaluate(()=>document.querySelector('.sample-studio').previewSession.state==='playing'),'Typing Space toggled playback.');
    await numeric('#editGain',-6);await graph.locator('.eq-selection select').selectOption('band-1');await numeric('[data-eq-value=frequency]',1000);await numeric('[data-eq-value=gain]',6);
    await page.locator('#saveSample').click();await page.waitForFunction(()=>document.querySelector('#sampleSaveState')?.textContent.includes('Saved sample ready'));
    const saved=await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try{
        const files=await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
        const file=files.find(file=>file.name?.startsWith('4b-processed-once'));if(!file)throw new Error('Saved sample missing');
        const buffer=await new OfflineAudioContext(2,1,48000).decodeAudioData(await file.arrayBuffer());let square=0,peak=0,count=0;
        const data=buffer.getChannelData(0);for(let i=4800;i<data.length;i++){square+=data[i]*data[i];peak=Math.max(peak,Math.abs(data[i]));count++}
        return{rms:Math.sqrt(square/count),peak,sampleRate:buffer.sampleRate,frames:buffer.length};
      }finally{db.close()}
    });
    const expected=.08/Math.sqrt(2);check(Math.abs(20*Math.log10(saved.rms/expected))<.25,'Saved gain/EQ was not applied exactly once.');
    await page.evaluate(()=>globalThis.ehs4bPreview=document.querySelector('.sample-studio').previewSession);
    await page.locator('[data-view=arrange]').click();
    check(await page.evaluate(()=>globalThis.ehs4bPreview.source===null&&globalThis.ehs4bPreview.graph===null),'Workspace switch leaked preview.');
    await space();await page.waitForFunction(()=>document.querySelector('#play').textContent==='Ⅱ');await space();
    check(await page.locator('#play').textContent()==='▶','Arrangement Space did not pause.');
    page.off('pageerror',onError);check(!errors.length,errors.join('; '));
    return{gainDb,boostDb,cutDb,compressionDb,sourcePreserved:true,layouts,sampleSpace:true,typingSafe:true,arrangementSpace:true,saved,savedOnceDb:20*Math.log10(saved.rms/expected),workspaceCleanup:true,pageErrors:errors};
  }finally{page.off('pageerror',onError);await page.evaluate(()=>{delete globalThis.ehs4bSource;delete globalThis.ehs4bPreview})}
}
