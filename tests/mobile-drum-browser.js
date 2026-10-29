// Continue on the disposable origin created by runMobileArrangementAcceptance.
export async function runMobileDrumFinalization(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')).tracks.find(t=>t.name==='Touch Kit'));
  const navigate=async key=>{await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${key}"]`).click()};
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  if(await page.locator('#addFiles').isHidden())await page.locator('#toggleBrowser').click();
  const bytes=await page.evaluate(async()=>{
    const {toWav}=await import('./src/audio.js'),context=new OfflineAudioContext(1,1,48000),buffer=context.createBuffer(1,4800,48000);
    for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=.15*Math.sin(2*Math.PI*180*i/48000)*Math.exp(-i/1000);
    return [...new Uint8Array(await toWav(buffer).arrayBuffer())];
  });
  const chooser=page.waitForEvent('filechooser');await page.locator('#addFiles').click();
  await(await chooser).setFiles({name:'mobile5b-hit.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes)});
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Imported 1'));
  await navigate('rack');check(await page.locator('[data-trigger]').count()===1,'Expected the one-pad kit from Arrangement acceptance.');
  const first=(await read()).drumRack.pads[0],cdp=await page.context().newCDPSession(page);
  const tap=async selector=>{
    const target=page.locator(selector).first();await target.hover();const box=await target.boundingBox(),at={x:box.x+box.width/2,y:box.y+box.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});
    await page.waitForTimeout(30);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const assign=async index=>{
    await tap(`[data-choose-pad="${index}"]`);await page.locator('#instrumentSamplePicker input').fill('mobile5b-hit');
    await page.getByRole('button',{name:'Select',exact:true}).click();
  };
  try{
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await tap('#addPad');await tap('#removePad');check(await page.locator('[data-trigger]').count()===1,'Removing unused pad failed.');
    await tap('#addPad');await assign(1);
    const numeric=async(selector,value)=>{const field=page.locator(selector).locator('..').locator('.parameter-number');await field.fill(String(value));await field.press('Tab')};
    await numeric('[data-pad-volume="1"]',.7);await numeric('[data-pad-pan="1"]',.25);await numeric('[data-pad-pitch="1"]',3);await tap('#previewPad');
    await tap('[data-step-pad="1"][data-step="4"]');await page.locator('#rackVelocity').fill('.4');await page.locator('#rackApplyVelocity').click();
    await page.locator('#rackSteps').selectOption('32');await page.locator('#patternLength').fill('8');await page.locator('#patternLength').press('Tab');
    let track=await read(),second=track.drumRack.pads[1];
    check(second.asset!==first.asset&&second.volume===.7&&second.pan===.25&&second.pitch===3,'Independent pad assignments/settings failed.');
    check(track.patterns[0].notes.every(n=>n.velocity===.4)&&track.patterns[0].steps===32&&track.patterns[0].lengthBeats===8,'Step velocity/length did not persist.');
    await tap('#removePad');await tap('dialog.pad-removal [data-choice=""]');check(await page.locator('[data-trigger]').count()===2,'Cancel removed a referenced pad.');
    await tap('#removePad');await tap('dialog.pad-removal [data-choice="keep"]');track=await read();
    check(track.patterns[0].notes.some(n=>n.midi===second.note)&&track.drumRack.pads.length===1,'Keep Notes silently discarded notes.');
    await tap('#addPad');const replacement=(await read()).drumRack.pads[1];check(replacement.note!==second.note,'New pad reused an orphan note mapping.');
    await tap('[data-step-pad="1"][data-step="0"]');await tap('#removePad');await tap('dialog.pad-removal [data-choice="delete"]');track=await read();
    check(!track.patterns[0].notes.some(n=>n.midi===replacement.note)&&track.patterns[0].notes.some(n=>n.midi===second.note),'Delete Notes affected unrelated notes.');
    while(await page.locator('[data-trigger]').count()<32)await tap('#addPad');
    check(await page.locator('#addPad').isDisabled(),'Maximum 32-pad Add control remained enabled.');
    await tap('[data-trigger="31"]');check(await page.locator('[data-trigger="31"]').getAttribute('aria-pressed')==='true','Last pad was not touch-selectable.');
    await assign(31);await tap('#previewPad');
    await page.getByRole('button',{name:/^Expand Selected Pad:/}).click();
    check(await page.locator('.selected-pad-editor.mobile-expanded-editor').count()===1,'Pad inspector did not expand.');await page.locator('.mobile-editor-exit').click();
    const snapshot=await read();check(snapshot.drumRack.pads[0].id===first.id&&snapshot.drumRack.pads[0].note===first.note,'Adding/removing pads remapped the first pad.');
    const layouts=[];
    for(const size of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1280,height:900},{width:844,height:390}]){
      await page.setViewportSize(size);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`32-pad overflow at ${size.width}`);
      check(await page.locator('[data-trigger]').count()===32&&await page.locator('.step-row').count()===32,'Rack did not render all 32 rows/pads.');layouts.push(size);
    }
    await navigate('arrange');await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(JSON.stringify(await read())===JSON.stringify(snapshot),'Reload changed pad IDs/mappings, pattern notes or settings.');
    return{initialPads:1,maximumPads:32,differentSamples:true,padParameters:true,padPreviewClicked:true,unusedRemoval:true,cancel:true,keepNotes:true,deleteNotes:true,orphanMappingNotReused:true,stableFirstPad:true,stepVelocity:.4,steps:32,patternBeats:8,reloadExact:true,layouts};
  }finally{await cdp.detach()}
}
