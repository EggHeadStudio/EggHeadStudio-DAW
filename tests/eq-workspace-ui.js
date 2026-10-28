// Use a fresh disposable origin; the fixture creates and edits local assets.
export async function runEqWorkspaceAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const number=async(root,key,value)=>{const field=root.locator(`[data-eq-value="${key}"]`).locator('..').locator('.parameter-number');await field.fill(String(value));await field.press('Tab')};
  const add=async name=>{await page.locator('#addTrack').click();await page.locator('#trackType').selectOption('audio');await page.locator('#trackName').fill(name);await page.locator('#trackSetup button[type=submit]').click()};
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use empty project storage.');
  await page.setViewportSize({width:1280,height:1100});await page.locator('.project-menu>summary').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#newProject').click();
  await add('EQ Tone');
  await page.evaluate(async()=>{
    const {toWav}=await import('./src/audio.js'),context=new OfflineAudioContext(2,1,48000),buffer=context.createBuffer(2,48000*12,48000);
    for(let i=0;i<buffer.length;i++){const value=.05*Math.sin(2*Math.PI*1000*i/48000);buffer.getChannelData(0)[i]=value;buffer.getChannelData(1)[i]=value*.5}
    const dt=new DataTransfer();dt.items.add(new File([toWav(buffer)],'eq-tone-1000.wav',{type:'audio/wav'}));
    const input=document.querySelector('#importFiles');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Imported 1'));
  if(await page.locator('#toggleBrowser').getAttribute('aria-expanded')==='false')await page.locator('#toggleBrowser').click();
  await page.locator('[data-add]').first().click();await page.locator('#addTrackEffect').selectOption('eq');
  const graph=page.locator('.graphical-eq'),layouts=[];
  const params=async()=>(await read()).tracks[0].fx.effects[0].params;
  for(const viewport of [360,390,430,768,1280]){
    await page.setViewportSize({width:viewport,height:1100});
    for(const id of ['toggleDevices'])if(await page.locator(`#${id}`).getAttribute('aria-expanded')==='false')await page.locator(`#${id}`).click();
    await graph.locator('.eq-selection select').selectOption('band-1');
    await number(graph,'frequency',800);await number(graph,'gain',0);
    const point=graph.locator('[data-eq-node="band-1"]');await point.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-eq-node="band-1"]')?.getAttribute('aria-valuenow')==='800');
    await point.hover();
    let box=await point.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+15,box.y+box.height/2-12,{steps:5});await page.mouse.up();
    check((await params()).bands[1].frequency>800&&(await params()).bands[1].gain>0,`Mouse dragging failed at ${viewport}`);
    const cdp=await page.context().newCDPSession(page);
    try{
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      const before=(await params()).bands[1];await point.scrollIntoViewIfNeeded();box=await point.boundingBox();
      const start={x:box.x+box.width/2,y:box.y+box.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+12,y:start.y-10}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      check((await params()).bands[1].frequency>before.frequency&&(await params()).bands[1].gain>before.gain,`Touch drag failed at ${viewport}`);
      const saved=(await params()).bands[1];box=await point.boundingBox();const cancel={x:box.x+box.width/2,y:box.y+box.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cancel]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cancel.x-10,y:cancel.y+10}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      const restored=(await params()).bands[1];check(restored.frequency===saved.frequency&&restored.gain===saved.gain,'Touch cancellation changed the filter.');
    }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach()}
    await number(graph,'frequency',1000);await number(graph,'gain',6);await number(graph,'q',2);
    await point.focus();await point.press('ArrowRight');check((await params()).bands[1].frequency>1000,'Node keyboard frequency failed.');
    await number(graph,'frequency',1000);
    await graph.locator('[data-eq-type]').selectOption('highshelf');check((await params()).bands[1].type==='highshelf','Filter type detached.');
    await graph.locator('[data-eq-enabled]').uncheck();check((await params()).bands[1].enabled===false,'Band disable detached.');
    await graph.locator('[data-eq-enabled]').check();await graph.locator('[data-eq-type]').selectOption('peaking');
    await graph.locator('.eq-selection select').selectOption('lowCut');check(await graph.locator('[data-eq-value=gain]').isDisabled(),'Cut exposes unsupported gain.');
    await graph.locator('[data-eq-enabled]').uncheck();check((await params()).lowCutEnabled===false,'Cut disable detached.');
    await graph.locator('.eq-selection select').selectOption('band-1');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);check(!overflow,`Page overflow at ${viewport}`);
    check((await read()).tracks[0].clips.length===1,'EQ editing triggered Arrangement edits.');
    layouts.push({width:viewport,mouse:true,touch:true,cancel:true,numeric:true,keyboard:true,overflow});
  }

  await page.setViewportSize({width:1280,height:1100});
  await page.evaluate(()=>globalThis.ehsOldEq=document.querySelector('.graphical-eq').eqVisualizer);
  await add('EQ Other');await page.locator('#addTrackEffect').selectOption('eq');await number(page.locator('.graphical-eq'),'frequency',2200);
  check(await page.evaluate(()=>globalThis.ehsOldEq.disposed),'Switching tracks leaked the old visualizer.');
  await page.getByRole('button',{name:'Select EQ Tone track',exact:true}).click();
  check((await params()).bands[1].frequency===1000,'Other track changed the first EQ.');
  await page.locator('[data-effect-enabled]').uncheck();await page.waitForFunction(()=>document.querySelector('.graphical-eq').classList.contains('eq-is-bypassed'));
  check((await read()).tracks[0].fx.effects[0].enabled===false,'Device bypass detached.');await page.locator('[data-effect-enabled]').check();
  await page.locator('.device-fold').click();check(await page.locator('.device-body').isHidden(),'Fold failed.');await page.locator('.device-fold').click();
  await page.locator('[data-view=master]').click();await page.locator('#masterMode').selectOption('advanced');
  const master=page.locator('.graphical-eq');check(await master.locator('[data-eq-node]').count()===8,'Master six bands/cuts missing.');
  await master.locator('.eq-selection select').selectOption('band-2');await number(master,'frequency',1500);await number(master,'gain',-4);await number(master,'q',1.5);
  await master.locator('[data-eq-type]').selectOption('lowshelf');
  const settings=(await read()).mastering;check(settings.eq.bands[2].frequency===1500&&settings.eq.bands[2].gain===-4&&settings.eq.bands[2].type==='lowshelf','Master editor detached.');
  const masterPoint=master.locator('[data-eq-node="band-2"]');await masterPoint.hover();
  const masterBox=await masterPoint.boundingBox();await page.mouse.move(masterBox.x+masterBox.width/2,masterBox.y+masterBox.height/2);await page.mouse.down();await page.mouse.move(masterBox.x+masterBox.width/2+15,masterBox.y+masterBox.height/2-10,{steps:5});await page.mouse.up();
  const dragged=(await read()).mastering.eq.bands[2];check(dragged.frequency>1500&&dragged.gain>-4,'Master graphical dragging detached.');
  await number(master,'frequency',1500);await number(master,'gain',-4);
  await page.locator('#masterEqEnabled').uncheck();check(await master.evaluate(e=>e.classList.contains('eq-is-bypassed')),'Master bypass graph stale.');await page.locator('#masterEqEnabled').check();
  const snapshot=await read();await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  const restored=await read();check(JSON.stringify(restored.tracks)===JSON.stringify(snapshot.tracks)&&JSON.stringify(restored.mastering)===JSON.stringify(snapshot.mastering),'EQ persistence failed.');
  page.off('pageerror',onError);check(!errors.length,errors.join('; '));
  return{layouts,trackSwitch:true,deviceBypass:true,fold:true,master:true,persistence:true,pageErrors:errors};
}

export async function runEqAnalyzerUiAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  await page.setViewportSize({width:1280,height:1100});await page.locator('[data-view=arrange]').click();
  await page.getByRole('button',{name:'Select EQ Tone track',exact:true}).click();
  const graph=page.locator('.graphical-eq');let phase='starting';
  if(!await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')).loop))await page.locator('#loop').click();
  await graph.locator('[data-eq-smoothing]').fill('0');await graph.locator('[data-eq-smoothing]').dispatchEvent('change');
  await page.locator('#toStart').click();await page.locator('#play').click();await graph.locator('.eq-plot').scrollIntoViewIfNeeded();
  const signal=async()=>{await page.waitForFunction(()=>Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)>950&&Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)<1050);return await graph.evaluate(e=>({hz:Number(e.dataset.spectrumPeakHz),db:Number(e.dataset.spectrumPeakDb)}))};
  const layouts=[];
  try{
    for(const width of [360,390,430,768,1280]){
      phase=`width ${width}`;
      await page.setViewportSize({width,height:1100});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await graph.locator('.eq-plot').scrollIntoViewIfNeeded();
      const peak=await signal();check(peak.db> -90,'Generated signal was not measured.');
      layouts.push({width,...peak});
    }
    phase='pre/post';await graph.locator('[data-eq-smoothing]').fill('0');await graph.locator('[data-eq-smoothing]').dispatchEvent('change');
    await graph.locator('[data-eq-tap]').selectOption('pre');const pre=await signal();
    await graph.locator('[data-eq-tap]').selectOption('post');const post=await signal();
    check(Math.abs(post.db-pre.db-6)<.2,`UI Pre/Post differs by ${post.db-pre.db} dB`);
    phase='bypass';await page.locator('[data-effect-enabled]').uncheck();await graph.locator('.eq-plot').scrollIntoViewIfNeeded();const bypass=await signal();
    check(Math.abs(bypass.db-pre.db)<.2,'Bypass analyzer is not at unity.');
    await page.locator('[data-effect-enabled]').check();await graph.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
    const performanceResults=[];
    for(const fftSize of ['2048','4096','8192']){
      phase=`FFT ${fftSize}`;
      await graph.locator('[data-eq-fft]').selectOption(fftSize);await graph.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
      const before=await graph.evaluate(e=>({...e.eqVisualizer.stats}));await page.waitForTimeout(1000);
      const after=await graph.evaluate(e=>({...e.eqVisualizer.stats})),frames=after.frames-before.frames,drawMs=after.drawMs-before.drawMs;
      check(frames>0&&frames<=40,`Analyzer frame throttle failed: ${frames}`);
      performanceResults.push({fftSize:Number(fftSize),frames,drawMs,meanDrawMs:drawMs/frames});
    }
    phase='off/suspension';await graph.locator('[data-eq-analyzer]').uncheck();await graph.locator('.eq-plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>!document.querySelector('.graphical-eq').eqVisualizer.analyzer);
    await graph.locator('[data-eq-analyzer]').check();await graph.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
    await page.evaluate(()=>globalThis.ehsEqContext=document.querySelector('.graphical-eq').eqVisualizer.analyzer.analyser.context);
    await page.evaluate(()=>globalThis.ehsEqContext.suspend());await page.waitForFunction(()=>!document.querySelector('.graphical-eq').eqVisualizer.analyzer);
    await page.evaluate(()=>globalThis.ehsEqContext.resume());await signal();
    phase='track switch';await page.evaluate(()=>globalThis.ehsPreviousEq=document.querySelector('.graphical-eq').eqVisualizer);
    await page.getByRole('button',{name:'Select EQ Other track',exact:true}).click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>globalThis.ehsPreviousEq.disposed);
    await page.waitForFunction(()=>Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakDb)<-90);
    await page.getByRole('button',{name:'Select EQ Tone track',exact:true}).click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
    phase='fold';await page.locator('.device-fold').click();await page.waitForFunction(()=>!document.querySelector('.graphical-eq').eqVisualizer.analyzer);
    const hidden=await graph.evaluate(e=>e.eqVisualizer.stats.frames);await page.waitForTimeout(250);check(await graph.evaluate(e=>e.eqVisualizer.stats.frames)===hidden,'Folded EQ kept drawing.');
    await page.locator('.device-fold').click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
    phase='reorder';await page.locator('#addTrackEffect').selectOption('utility');
    await page.evaluate(()=>globalThis.ehsPreviousEq=document.querySelector('.graphical-eq').eqVisualizer);
    await page.locator('[data-effect-down="0"]').click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
    check(await page.evaluate(()=>globalThis.ehsPreviousEq.disposed&&!globalThis.ehsPreviousEq.analyzer),'Reorder leaked the prior analyzer.');
    check(await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')).tracks[0].fx.effects[1].type==='eq'),'Effect order did not change.');
    phase='bypassed reorder';
    await page.locator('[data-effect-param="0"][data-param=gain]').fill('-12');await page.locator('[data-effect-param="0"][data-param=gain]').dispatchEvent('input');
    await page.locator('[data-effect-enabled="1"]').uncheck();
    await graph.locator('[data-eq-smoothing]').fill('0');await graph.locator('[data-eq-smoothing]').dispatchEvent('change');await graph.locator('.eq-plot').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    const bypassAfterUtility=await signal();
    await page.locator('[data-effect-up="1"]').click();
    await graph.locator('[data-eq-smoothing]').fill('0');await graph.locator('[data-eq-smoothing]').dispatchEvent('change');await graph.locator('.eq-plot').scrollIntoViewIfNeeded();await page.waitForTimeout(250);
    const bypassBeforeUtility=await signal(),bypassedReorderDb=bypassBeforeUtility.db-bypassAfterUtility.db;
    check(Math.abs(bypassedReorderDb-12)<.25,`Bypassed EQ tap did not follow reorder: ${bypassedReorderDb}`);
    await page.locator('[data-effect-down="0"]').click();await page.locator('[data-effect-enabled="1"]').check();
    await page.locator('[data-effect-remove="0"]').click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();await signal();
    phase='remove';await page.getByRole('button',{name:'Select EQ Other track',exact:true}).click();await page.locator('.eq-plot').scrollIntoViewIfNeeded();
    await page.evaluate(()=>globalThis.ehsPreviousEq=document.querySelector('.graphical-eq').eqVisualizer);
    await page.locator('[data-effect-remove="0"]').click();
    check(await page.evaluate(()=>!document.querySelector('.graphical-eq')&&globalThis.ehsPreviousEq.disposed&&!globalThis.ehsPreviousEq.analyzer),'Device removal leaked its visualizer.');
    await page.locator('#addTrackEffect').selectOption('eq');
    await page.getByRole('button',{name:'Select EQ Tone track',exact:true}).click();
    return{layouts,pre,post,bypass,prePostDb:post.db-pre.db,performance:performanceResults,off:true,suspension:true,trackSwitchSilence:true,foldedPaused:true,reorder:true,bypassedReorderDb,removal:true};
  }catch(error){throw new Error(`${phase}: ${error.message}`)}finally{await page.locator('#stop').click();await page.evaluate(()=>{delete globalThis.ehsEqContext;delete globalThis.ehsPreviousEq})}
}
