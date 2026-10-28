// Pass a Playwright Page on a disposable origin with no saved project.
export async function runUxArchitectureAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const click=async selector=>{
    const target=page.locator(selector).first();
    const parents=await target.evaluate(element=>[...element.closest('main,header').querySelectorAll('details')].filter(details=>details.contains(element)&&!details.open).map(details=>details.className));
    for(const className of parents)await page.locator(`details.${className.split(' ').join('.')}>summary`).click();
    await target.click();
  };
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(await page.evaluate(()=>localStorage.getItem('pulse-project')===null),'Use a fresh disposable origin.');
  check(await page.locator('#exportMix').count()===0,'Duplicate global export shortcut remains.');
  await click('#newProject');
  check((await read()).tracks.length===0,'New project failed.');
  await page.evaluate(async()=>{
    const {instrumentBuffers}=await import('./tests/instrument-fixture.js'),{toWav}=await import('./src/audio.js');
    const transfer=new DataTransfer();
    for(const [name,buffer]of instrumentBuffers(new OfflineAudioContext(1,44100,44100)))transfer.items.add(new File([toWav(buffer)],`${name}.wav`,{type:'audio/wav'}));
    const input=document.querySelector('#importFiles');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Imported 2'));
  await page.locator('.browser-tabs button').filter({hasText:'Instruments'}).click();
  await page.locator('.browser-category:visible button').filter({hasText:'Sampler'}).click();
  await page.locator('#trackName').fill('UX Lead');await page.locator('#trackSetup button[type=submit]').click();
  check(await page.locator('#addTrackEffect').count()===0&&await page.locator('#instrumentTrackGain').count()===0,'Instrument editor duplicates track controls.');
  await page.locator('#chooseSamplerSample').click();
  await page.locator('#instrumentSamplePicker input').fill('tone');
  await page.locator('#instrumentSamplePicker button').filter({hasText:'Select'}).first().click();
  await page.locator('#emptyPattern').click();await page.locator('dialog button[type=submit]').click();
  const lane=page.locator('.piano-lane[data-midi="60"]');await lane.scrollIntoViewIfNeeded();await lane.click({position:{x:10,y:8}});
  await page.locator('#openTrackDevices').click();
  check((await page.locator('.instrument-device h3').textContent())==='Sampler','Instrument is not first in chain.');
  check((await read()).tracks[0].patterns[0].notes.length===1,'Instrument navigation lost the note.');
  await page.locator('.browser-tabs').getByRole('button',{name:'Effects',exact:true}).click();
  await page.locator('.browser-category:visible').getByRole('button',{name:'Utility',exact:true}).click();
  const numeric=page.getByRole('spinbutton',{name:'Gain (dB), numeric entry (dB)',exact:true});
  await numeric.fill('-6');await numeric.press('Tab');
  check((await read()).tracks[0].fx.effects[0].params.gain===-6,'Numeric control is not bound to project state.');
  await numeric.fill('');await numeric.press('Tab');
  check((await read()).tracks[0].fx.effects[0].params.gain===-6&&await numeric.evaluate(input=>!input.validity.valid),'Invalid numeric entry was silently accepted.');
  await numeric.fill('-6');await numeric.press('Tab');
  const gain=page.locator('[data-effect-param][data-param=gain]');
  await gain.focus();await gain.press('ArrowUp');
  check((await read()).tracks[0].fx.effects[0].params.gain===-5.5,'Native range keyboard adjustment failed.');
  await gain.press('Home');check((await read()).tracks[0].fx.effects[0].params.gain===-60,'Range Home failed.');
  const box=await gain.boundingBox();
  await page.mouse.move(box.x+25,box.y+25);await page.mouse.down();await page.mouse.move(box.x+25,box.y+5,{steps:5});await page.mouse.up();
  const dragged=(await read()).tracks[0].fx.effects[0].params.gain;
  check(dragged>-60&&dragged<0,'Rotary pointer movement failed.');
  await page.getByRole('button',{name:'Reset Gain (dB) to 0.0 dB',exact:true}).click();
  check((await read()).tracks[0].fx.effects[0].params.gain===0,'Parameter reset failed.');
  const widthInput=page.getByRole('spinbutton',{name:'Stereo width, numeric entry',exact:true});
  await widthInput.fill('1.25');await widthInput.press('Tab');
  await page.locator('[data-effect-param][data-param=width]').press('ArrowUp');
  check((await read()).tracks[0].fx.effects[0].params.width===1.26,'Linear parameter and numeric entry diverged.');
  await page.getByRole('button',{name:'Reset Stereo width to 1.00',exact:true}).click();
  await numeric.fill('-6');await numeric.press('Tab');
  await page.locator('.device-fold').click();
  check(await page.locator('.device-body').isHidden(),'Collapse did not hide only device body.');
  check((await read()).tracks[0].fx.effects[0].enabled,'Collapse changed DSP bypass state.');
  await page.locator('.device-fold').click();
  await page.locator('[data-effect-enabled]').uncheck();check(!(await read()).tracks[0].fx.effects[0].enabled,'Bypass did not persist.');
  await page.locator('[data-effect-enabled]').check();
  await page.locator('#addTrackEffect').selectOption('delay');
  await page.locator('[data-effect-up="1"]').click();
  check((await read()).tracks[0].fx.effects.map(e=>e.type).join(',')==='delay,utility','Device order failed.');
  await page.locator('[data-effect-remove="0"]').click();
  await page.locator('.device-presets>summary').click();
  await page.locator('#effectPresetName').fill('UX chain');await page.locator('#saveEffectPreset').click();
  check(await page.locator('#effectPresetSelect option').count()===2,'Preset access failed.');
  await page.locator('[data-clip]').first().click({button:'right'});
  check(await page.locator('.arrangement-edit-menu').getAttribute('open')!==null,'Clip context menu did not open authoritative Edit actions.');
  await click('#duplicateClip');check((await read()).tracks[0].clips.length===2,'Context Edit duplicate failed.');
  await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('Control+z');
  check((await read()).tracks[0].clips.length===1,'Arrangement Undo shortcut failed.');
  await click('#addTrack');await page.locator('#trackName').fill('UX Audio');await page.locator('#trackSetup button[type=submit]').click();
  check(await page.locator('#openPiano').isHidden()&&await page.locator('#linkedDuplicate').isHidden(),'Audio context exposes pattern actions.');
  await page.getByRole('button',{name:'Select UX Lead track',exact:true}).focus();await page.keyboard.press('Enter');
  check((await page.locator('.bottom-panel .pane-head').textContent()).includes('UX Lead'),'Keyboard track selection did not update devices.');
  check(await page.locator('#clipEditor').textContent().then(text=>text.startsWith('Select a clip')),'Track selection retained an unrelated clip editor.');
  await page.getByRole('button',{name:'Select UX Lead track',exact:true}).focus();await page.keyboard.press('Shift+F10');
  check(await page.locator('.arrangement-edit-menu').getAttribute('open')!==null,'Keyboard context menu failed.');
  await page.keyboard.press('Escape');
  const tipTarget=page.locator('#toggleDevices');await tipTarget.focus();
  const description=await tipTarget.getAttribute('aria-describedby');
  check(description&&await page.locator(`#${description}`).isVisible(),'Focus tooltip is not accessible.');
  await tipTarget.press('Escape');check(await page.locator(`#${description}`).isHidden(),'Escape did not dismiss tooltip.');
  await page.locator('#toggleDevices').click();check(await page.locator('.bottom-panel').isHidden(),'Devices did not collapse.');
  await page.locator('[data-fx="0"]:visible').click();check(await page.locator('.bottom-panel').isVisible(),'FX shortcut failed to reopen devices.');
  const navigation=[];
  for(const view of ['sample','recording','master','export','arrange']){
    await page.locator(`[data-view="${view}"]`).click();
    check(await page.locator(`[data-view="${view}"]`).getAttribute('aria-current')==='page','Active workspace is not announced.');
    check(await page.locator('#main').textContent().then(text=>text.length>100),'Workspace is empty.');
    navigation.push(view);
  }
  const layouts=[],cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  try{
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1100});await page.reload();await page.waitForSelector('.track-select');
      await page.getByRole('button',{name:'Select UX Lead track',exact:true}).click();
      if(await page.locator('#toggleDevices').getAttribute('aria-expanded')==='false')await page.locator('#toggleDevices').click();
      await page.locator('[data-effect-param][data-param=gain]').scrollIntoViewIfNeeded();
      const knob=page.locator('[data-effect-param][data-param=gain]'),rect=await knob.boundingBox();
      const before=(await read()).tracks[0].fx.effects[0].params.gain;
      const point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-10}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      check((await read()).tracks[0].fx.effects[0].params.gain>before,`Touch parameter drag failed at ${width}px.`);
      for(let tap=0;tap<2;tap++){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }
      check((await read()).tracks[0].fx.effects[0].params.gain===0,`Touch double-tap reset failed at ${width}px.`);
      const layout=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,headerHeight:document.querySelector('.global-header').getBoundingClientRect().height,toolbarHeight:document.querySelector('.editor-tools').getBoundingClientRect().height,toolbarScroll:document.querySelector('.editor-tools').scrollHeight}));
      check(layout.documentWidth<=width&&layout.toolbarScroll<=layout.toolbarHeight+1,`Overflow or hidden toolbar at ${width}px.`);
      layouts.push(layout);
    }
  }finally{await cdp.detach()}
  await page.setViewportSize({width:1280,height:1000});
  await page.getByRole('spinbutton',{name:'Gain (dB), numeric entry (dB)',exact:true}).fill('-6');
  await page.getByRole('spinbutton',{name:'Gain (dB), numeric entry (dB)',exact:true}).press('Tab');
  await page.locator('#projectName').fill('UX persistence');await page.locator('#projectName').press('Tab');
  const snapshot=await read();await page.reload();await page.waitForSelector('.track-select');
  check(JSON.stringify((await read()).tracks)===JSON.stringify(snapshot.tracks),'Reload changed project tracks.');
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.querySelector('#elapsedTime').textContent!=='00:00.000');
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-meter-left],[data-meter-right]')].some(element=>parseFloat(element.style.width)>0));
  await page.locator('#stop').click();
  const clock=await page.locator('#elapsedTime').textContent();
  check(errors.length===0,`Unexpected page errors: ${errors.join('; ')}`);
  return{navigation,layouts,tracks:snapshot.tracks.length,utilityGain:snapshot.tracks[0].fx.effects[0].params.gain,rotaryPointerValue:dragged,clockAfterAudiblePlayback:clock,persistence:true,tooltipFocus:true,keyboard:true,syntheticTouch:true};
}

export async function runWorkspaceLayoutAudit(page){
  const rows=[];
  for(const width of [360,390,430,768,1280]){
    await page.setViewportSize({width,height:1100});
    for(const view of ['arrange','sample','recording','master','export','sampler','drumRack']){
      await page.locator('[data-view="arrange"]').click();
      if(view==='sampler'||view==='drumRack'){
        const index=await page.evaluate(type=>JSON.parse(localStorage.getItem('pulse-project')).tracks.findIndex(track=>Boolean(track[type])),view);
        if(index<0)throw new Error(`Layout fixture requires ${view}.`);
        await page.locator(`.track-label[data-track="${index}"] .track-select`).click();
        await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#openPiano').click();
      }else if(view!=='arrange')await page.locator(`[data-view="${view}"]`).click();
      const row=await page.evaluate(({width,view})=>({width,view,documentWidth:document.documentElement.scrollWidth,unlabelled:[...document.querySelectorAll('#main input:not([type=hidden]),#main select')].filter(input=>!input.labels?.length&&!input.getAttribute('aria-label')).map(input=>input.id),controls:document.querySelectorAll('#main button').length}),{width,view});
      if(row.documentWidth>width||row.unlabelled.length)throw new Error(`${view} overflows or has unnamed inputs at ${width}px: ${row.unlabelled.join(', ')}`);
      rows.push(row);
    }
  }
  await page.locator('[data-view="arrange"]').click();
  return rows;
}
