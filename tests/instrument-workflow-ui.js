export async function runInstrumentWorkflowAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const click=selector=>page.locator(selector).first().click({force:true});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use a fresh disposable origin.');
  await page.locator('#projectName').fill('Workflow acceptance');
  await page.locator('#projectName').dispatchEvent('change');
  await click('#newProject');
  if(await page.locator('#newProjectDialog').isVisible())await click('#discardAndNew');
  check(await page.locator('#addSampler,#addRack,.editor-tools #addTrack').count()===0,'Redundant toolbar remains.');
  const add=async(type,name)=>{
    await click('#addTrack');await page.locator('#trackType').selectOption(type);
    await page.locator('#trackName').fill(name);await page.locator('#trackSetup button[type=submit]').click();
  };
  await add('drumRack','Independent Kit');
  let track=(await read()).tracks[0];
  check(track.clips.length===0&&track.drumRack.pads.every(pad=>!pad.asset),'New rack is not empty.');
  await page.evaluate(async()=>{
    const {instrumentBuffers}=await import('./tests/instrument-fixture.js'),{toWav}=await import('./src/audio.js');
    const dt=new DataTransfer();
    for(const [name,buffer]of instrumentBuffers(new OfflineAudioContext(1,44100,44100)))dt.items.add(new File([toWav(buffer)],`${name}.wav`,{type:'audio/wav'}));
    const input=document.querySelector('#importFiles');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Imported 2'));
  const pick=async(selector,filter)=>{
    await click(selector);await page.locator('#instrumentSamplePicker input').fill(filter);
    await page.locator('#instrumentSamplePicker button').filter({hasText:'Select'}).first().click();
  };
  check(await page.locator('[data-trigger]').count()===1,'New rack must have one pad.');
  await click('#addPad');
  await pick('[data-choose-pad="0"]','tone');await pick('[data-choose-pad="1"]','hit');
  track=(await read()).tracks[0];
  check(track.drumRack.pads[0].asset!==track.drumRack.pads[1].asset&&track.drumRack.pads.slice(2).every(pad=>!pad.asset),'Pad assignments leaked.');
  await click('#rackBack');await click('[data-new-pattern="0"]');await click('dialog button[type=submit]');
  check((await read()).tracks[0].clips[0].durationBeats===16,'Default pattern is not four bars.');
  await click('#openPiano');await click('[data-step-pad="0"][data-step="0"]');
  await page.locator('#addTrackEffect').selectOption('utility');await page.locator('[data-effect-param][data-param=gain]').fill('-6');
  await click('#rackBack');await add('sampler','Empty Lead');
  track=(await read()).tracks[1];check(!track.sampler.asset&&track.clips.length===0,'Sampler was not empty.');
  check((await page.locator('.sample-source').textContent()).includes('No sample selected'),'Empty source hint missing.');
  await pick('#chooseSamplerSample','tone');await click('#previewSamplerSample');
  await click('#backArrange');await click('[data-new-pattern="1"]');await click('dialog button[type=submit]');
  await click('#openPiano');
  const lane=page.locator('.piano-lane[data-midi="60"]');await lane.scrollIntoViewIfNeeded();await lane.click({position:{x:10,y:8},force:true});
  track=(await read()).tracks[1];check(track.patterns[0].notes.length===1,'Selected pattern note missing.');
  await page.locator('#addTrackEffect').selectOption('utility');await page.locator('[data-effect-param][data-param=gain]').fill('-6');
  const layouts=[];
  for(const width of [360,390,430,768,1280]){
    await page.setViewportSize({width,height:1000});
    layouts.push(await page.evaluate(width=>({width,overflow:document.documentElement.scrollWidth>innerWidth}),width));
  }
  check(layouts.every(result=>!result.overflow),'Instrument page overflow.');
  await click('#backArrange');await page.reload();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  const project=await read();check(project.tracks.length===2&&project.tracks[0].drumRack.pads[1].asset,'Reload lost instrument data.');
  return{tracks:project.tracks.map(track=>({name:track.name,clips:track.clips.length,beats:track.patterns[0].lengthBeats})),layouts};
}

export async function runInstrumentTouchAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const touch=async(selector)=>{
    const element=page.locator(selector).first();await element.scrollIntoViewIfNeeded();
    const box=await element.boundingBox();check(box,'Missing touch target '+selector);
    const point={x:box.x+box.width/2,y:box.y+box.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
  };
  const click=selector=>page.locator(selector+':visible').first().click(),results=[];
  try{
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(250);
      await click('[data-new-pattern="0"]');await click('dialog button[type=submit]');await click('#openPiano');
      const before=await page.locator('[data-trigger]').count();
      await touch('#addPad');check(await page.locator('[data-trigger]').count()===before+1,'Touch Add Pad failed.');
      await touch(`[data-trigger="${before}"]`);
      check(await page.locator(`[data-trigger="${before}"]`).getAttribute('aria-pressed')==='true','Touch selection failed.');
      await touch(`[data-step-pad="${before}"][data-step="0"]`);
      check(await page.locator(`[data-step-pad="${before}"][data-step="0"]`).getAttribute('class').then(c=>c.includes('step-active')),'Touch step did not activate.');
      await touch('#removePad');await touch('dialog.pad-removal [data-choice=""]');
      check(await page.locator('[data-trigger]').count()===before+1,'Cancel removed a pad.');
      await touch('#removePad');await touch('dialog.pad-removal [data-choice="delete"]');
      check(await page.locator('[data-trigger]').count()===before,'Touch removal failed.');
      results.push({width,padSelection:true,addRemove:true,stepEditing:true,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
      await click('#rackBack');
    }
    return results;
  }finally{await cdp.detach()}
}

export async function runVelocityTouchAcceptance(page){
  await page.locator('[data-clip][data-track-index="1"]').first().dblclick();
  const cdp=await page.context().newCDPSession(page),results=[];
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  try{
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1000});await page.waitForTimeout(250);
      await page.locator('#timeZoom').fill('2.5');await page.locator('#timeZoom').dispatchEvent('input');
      const bar=page.locator('.velocity-bar').first();await bar.scrollIntoViewIfNeeded();
      const box=await bar.boundingBox(),lane=await page.locator('#velocityWorld').boundingBox();
      const before=await bar.getAttribute('aria-label'),target=box.height>lane.height/2?.75:.25;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:lane.y+lane.height*target}]});
      await page.waitForTimeout(100);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(100);
      const after=await page.locator('.velocity-bar').first().getAttribute('aria-label');
      if(before===after)throw new Error('Touch velocity did not change.');
      const velocity=await page.evaluate(id=>JSON.parse(localStorage.getItem('pulse-project')).tracks.flatMap(t=>(t.patterns||[]).flatMap(p=>p.notes)).find(n=>n.id===id)?.velocity,await bar.getAttribute('data-velocity-id'));
      if(Math.abs(velocity-(1-target))>.02||!Number.isFinite(velocity))throw new Error('Touch velocity did not persist.');
      const scroll=await page.evaluate(async()=>{
        const piano=document.querySelector('#pianoScroll'),velocity=document.querySelector('#velocityScroll');
        piano.scrollLeft=piano.scrollWidth-piano.clientWidth;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return{piano:piano.scrollLeft,velocity:velocity.scrollLeft};
      });
      if(Math.abs(scroll.piano-scroll.velocity)>1)throw new Error('Velocity scroll alignment failed.');
      results.push({width,before,after,velocity,scroll});
      await page.evaluate(()=>document.querySelector('#pianoScroll').scrollLeft=0);
    }
    return results;
  }finally{await cdp.detach()}
}
