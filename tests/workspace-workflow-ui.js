// Pass a Playwright Page after runInstrumentWorkflowAcceptance on a disposable origin.
export async function runWorkspaceWorkflowAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const navigate=async view=>{
    if(await page.locator('.mobile-navigation').isVisible()){await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${view}"]`).click()}
    else await page.locator(`[data-view="${view}"]`).click();
  };
  const expand=page.getByRole('button',{name:'Expand Independent Kit track',exact:true});
  await page.setViewportSize({width:1280,height:1100});await navigate('arrange');
  check(await page.locator('.track-row:has(.lane)').evaluateAll(rows=>rows.every(row=>row.getBoundingClientRect().height===84)),'Compact is not the default.');
  await expand.click();await page.getByRole('spinbutton',{name:'Independent Kit track height',exact:true}).fill('300');
  await page.getByRole('spinbutton',{name:'Independent Kit track height',exact:true}).press('Tab');
  const volume=page.locator('[data-vol="0"]'),number=volume.locator('..').locator('.parameter-number');
  await number.fill('.42');await number.press('Tab');check((await read()).tracks[0].volume===.42,'Expanded Mixer is not bound.');
  await expand.click();await volume.press('ArrowUp');check((await read()).tracks[0].volume===.43,'Compact Mixer uses a competing state.');
  await expand.click();check(Number(await number.inputValue())===.43,'Expanded value did not follow compact.');
  await page.getByRole('spinbutton',{name:'Independent Kit track height',exact:true}).fill('300');
  await page.getByRole('spinbutton',{name:'Independent Kit track height',exact:true}).press('Tab');
  const alignment=async()=>page.evaluate(()=>[...document.querySelectorAll('.track-row:has(.lane)')].map(row=>{
    const r=row.getBoundingClientRect(),lane=row.querySelector('.lane').getBoundingClientRect(),header=row.querySelector('.track-label').getBoundingClientRect(),mixer=row.querySelector('.right-mixer').getBoundingClientRect();
    return{height:r.height,laneHeight:lane.height,mixerHeight:mixer.height,delta:Math.max(Math.abs(lane.top-mixer.top),Math.abs(header.top-lane.top))};
  }));
  const beforeOrder=(await read()).tracks.map(track=>track.id);
  await page.getByRole('button',{name:'Move Independent Kit track later',exact:true}).click();
  check((await read()).tracks[1].id===beforeOrder[0]&&(await alignment())[1].height===300,'Track height did not follow reordered identity.');
  await page.getByRole('button',{name:'Move Independent Kit track earlier',exact:true}).click();
  check(JSON.stringify((await read()).tracks.map(track=>track.id))===JSON.stringify(beforeOrder),'Track reorder did not restore order.');
  await page.locator('#addTrack').click();await page.locator('#trackName').fill('Layout Temp');
  await page.locator('#trackType').selectOption('audio');await page.locator('#trackSetup button[type=submit]').click();
  check((await alignment()).at(-1).height===84,'Added track does not use compact height.');
  await page.getByRole('button',{name:'Expand Layout Temp track',exact:true}).click();
  const addedIndex=(await read()).tracks.length-1;await page.locator(`.track-label[data-track="${addedIndex}"] [data-remove]`).click();
  check((await read()).tracks.length===beforeOrder.length&&(await alignment())[0].height===300,'Track removal changed surviving row heights.');
  await page.getByRole('button',{name:'Select Independent Kit track',exact:true}).click();
  const layouts=[];
  for(const width of [360,390,430,768,1280]){
    await page.setViewportSize({width,height:1100});
    for(const id of ['toggleMixer','toggleDevices'])if(await page.locator(`#${id}`).getAttribute('aria-expanded')==='false')await page.locator(`#${id}`).click();
    await page.locator('.arrangement').evaluate(element=>{element.scrollTop=70;element.scrollLeft=40});
    const rows=await alignment();check(rows.every(row=>row.delta<1&&row.height===row.laneHeight&&row.height===row.mixerHeight),`Alignment failed at ${width}`);
    check(rows[0].height===300&&rows[1].height===84,'One track height changed another track.');
    await page.locator('#toggleMixer').click();await page.locator('#toggleMixer').click();
    check((await alignment()).every(row=>row.delta<1),'Mixer toggle changed alignment.');
    const separator=page.getByRole('separator',{name:'Device Panel height',exact:true});
    await separator.focus();await separator.press('Home');await separator.press('ArrowUp');
    check(await separator.getAttribute('aria-valuenow')==='180','Keyboard panel resize failed.');
    const cdp=await page.context().newCDPSession(page);
    try{
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
      await separator.scrollIntoViewIfNeeded();const rect=await separator.boundingBox(),point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x,y:point.y-40}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      check(await separator.getAttribute('aria-valuenow')==='220','Touch panel resize failed.');
      const current=await separator.boundingBox(),cancelPoint={x:current.x+current.width/2,y:current.y+current.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[cancelPoint]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cancelPoint.x,y:cancelPoint.y-30}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      check(await separator.getAttribute('aria-valuenow')==='220','Cancelled panel resize did not restore its height.');
    }finally{await cdp.detach()}
    const density=page.getByRole('button',{name:'Compact devices',exact:true});await density.click();
    check(await page.locator('.bottom-panel').evaluate(panel=>panel.classList.contains('devices-compact')),'Compact devices did not apply.');
    await density.click();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);check(!overflow,`Overflow at ${width}`);
    layouts.push({width,rows,keyboardResize:true,touchResize:true,touchCancel:true,overflow});
  }

  await page.setViewportSize({width:1280,height:1100});await expand.click();
  await page.getByRole('button',{name:'Select Empty Lead track',exact:true}).click();
  check((await page.locator('.bottom-panel>.pane-head').textContent()).includes('Empty Lead'),'Device Panel track context is wrong.');
  check(await page.locator('.instrument-device h3').textContent()==='Sampler','Instrument is not first.');
  await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#openPiano').click();
  check(await page.locator('.piano-tool-group').count()===3,'Piano toolbar groups missing.');
  check(await page.locator('#patternLength').inputValue()==='16','Pattern length context incorrect.');
  const sourceName=await page.locator('.sample-source>strong').textContent();
  check(sourceName.includes('tone'),'Sampler source not visible.');
  await page.locator('.source-configuration>summary').click();
  await page.locator('#samplerAttack').fill('.015');await page.locator('#samplerAttack').dispatchEvent('change');
  check((await read()).tracks[1].sampler.attack===.015,'Source controls detached.');
  await page.locator('#editSamplerSample').click();
  const stages=await page.locator('.workflow-stage').evaluateAll(elements=>elements.map(element=>element.dataset.workflowStage));
  check(stages.join(',')==='capture,edit,process,preview,save','Sample workflow order is wrong.');
  await page.locator('#framePrecision').check();await page.locator('#snapZero').click();
  await page.locator('#startFine').fill('32');await page.locator('#startFine').dispatchEvent('input');
  check(await page.locator('#sampleWave').getAttribute('data-start')==='32','Sample-frame selection changed precision.');
  await page.locator('#editGain').fill('3');await page.locator('#editGain').dispatchEvent('input');
  check((await page.locator('#gainDbValue').textContent()).includes('3.0'),'Sample processing binding detached.');
  await page.locator('#sampleName').fill('Workflow edited.wav');await page.locator('#saveSample').click();
  await page.waitForFunction(()=>document.querySelector('#sampleSaveState')?.textContent.includes('Saved'),null,{timeout:20000});
  check(await page.locator('#makeSampler').isEnabled()&&await page.locator('#makeRack').isEnabled(),'Sample save did not preserve instrument workflows.');
  await navigate('recording');
  check(await page.locator('#recordingOffset').isHidden(),'Advanced offset is not folded.');
  check(await page.locator('#studioRecord').isVisible()&&await page.locator('#studioStop').isVisible(),'Emergency recording controls hidden.');
  await page.locator('#newRecordingTrack').click();await page.locator('#recordingArm').check();
  await page.locator('#recordingCountIn').selectOption('1');await page.locator('.recording-advanced>summary').click();
  await page.locator('#recordingOffset').fill('25');await page.locator('#recordingOffset').dispatchEvent('change');
  check((await read()).recordingSettings.offsetMs===25,'Advanced recording control detached.');
  await page.locator('.recording-advanced>summary').click();
  check(await page.locator('#studioStop').isVisible(),'Folding advanced hides emergency Stop.');
  await navigate('master');await page.locator('#masterMode').selectOption('advanced');
  const order=await page.locator('[data-master-stage]').evaluateAll(elements=>elements.map(element=>element.dataset.masterStage));
  check(order.join(',')===[...(await read()).mastering.chainOrder,'output','limiter'].join(','),'Visible mastering order differs from audio.');
  await page.locator('#masterSatEnabled').uncheck();
  check(!(await read()).mastering.saturation.enabled,'Master module bypass detached.');
  await page.locator('#masterSatEnabled').check();
  const drive=page.locator('[data-master-param="saturation.drive"]').locator('..').locator('.parameter-number');
  await drive.fill('3');await drive.press('Tab');check((await read()).mastering.saturation.drive===3,'Shared mastering control detached.');
  await page.locator('[data-master-param="saturation.drive"]').press('ArrowUp');
  check((await read()).mastering.saturation.drive===3.1,'Range keyboard commit did not persist.');
  const beforeMaster=(await read()).mastering.chainOrder,index=beforeMaster.indexOf('saturation'),direction=index===0?1:0,target=index+(direction?1:-1);
  await page.locator(`[data-workflow-master-move="saturation-${direction}"]`).click();
  check((await read()).mastering.chainOrder[target]==='saturation','Master module reorder detached.');
  check(await page.locator('[data-master-stage]').nth(target).getAttribute('data-master-stage')==='saturation','Master cards did not follow reorder.');
  await navigate('export');check(await page.locator('#workflow-audio h3').first().textContent()==='Audio Export','Export audio section missing.');
  await page.locator('#exportMode').selectOption('advanced');await page.locator('#exportFormat').selectOption('mp3');
  await page.locator('#exportQuality').selectOption('192');check((await read()).exportSettings.bitrate===192,'Export bitrate detached.');
  await page.locator('[data-release-field=title]').fill('Workflow Release');await page.locator('[data-release-field=title]').dispatchEvent('change');
  check((await read()).releaseMetadata.title==='Workflow Release','Release information detached.');
  await page.getByRole('button',{name:'Release Package',exact:true}).click();
  check((await page.locator('#workflow-package').textContent()).includes('Save .EHS'),'Project/package distinction missing.');
  const snapshot=await read();await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  const restored=await read();check(JSON.stringify(restored.tracks)===JSON.stringify(snapshot.tracks),'Persistence changed tracks.');
  check(JSON.stringify(restored.mastering)===JSON.stringify(snapshot.mastering)&&restored.releaseMetadata.title==='Workflow Release','Workspace settings not persisted.');
  check(errors.length===0,errors.join('; '));
  return{layouts,stages,sourceName,masterOrder:order,projectReload:true,sampleSave:true,recordingSetup:true,masterBindings:true,exportBindings:true,pageErrors:errors};
}

export async function runPianoTouchWorkflowAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const notes=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')).tracks.find(track=>track.name==='Empty Lead').patterns[0].notes);
  const results=[],cdp=await page.context().newCDPSession(page);
  const gesture=async(point,dx=0,dy=0)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    if(dx||dy)for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+dx*step/5,y:point.y+dy*step/5}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  try{
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1100});
      if(width<=850){await page.locator('[data-mobile-switch]').click();await page.locator('[data-mobile-workspace=arrange]').click()}
      else await page.locator('[data-view=arrange]').click();
      await page.getByRole('button',{name:'Select Empty Lead track',exact:true}).click();
      await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#openPiano').click();
      await page.locator('#pianoTouchMode').selectOption('draw');
      await page.locator('#pianoGrid').selectOption('.25');
      await page.locator('#timeZoom').fill('2');await page.locator('#timeZoom').dispatchEvent('input');
      await page.locator('#noteLength').selectOption('1');
      const lane=page.locator('.piano-lane[data-midi="64"]');await lane.scrollIntoViewIfNeeded();
      await page.locator('#pianoScroll').evaluate(element=>element.scrollLeft=0);
      const before=await notes(),rect=await lane.boundingBox(),world=await page.locator('#pianoWorld').evaluate(element=>({beat:parseFloat(element.style.getPropertyValue('--beat-width')),row:parseFloat(element.style.getPropertyValue('--row-height'))}));
      await gesture({x:rect.x+world.beat*2+2,y:rect.y+rect.height/2});
      const created=(await notes()).find(note=>!before.some(previous=>previous.id===note.id));
      check(created?.midi===64&&created.beat===2,`Touch creation coordinates failed at ${width}`);
      let note=page.locator(`[data-note-id="${created.id}"]`);await note.scrollIntoViewIfNeeded();let box=await note.boundingBox();
      await gesture({x:box.x+box.width/3,y:box.y+box.height/2},world.beat,-world.row);
      const moved=(await notes()).find(item=>item.id===created.id);
      check(moved.beat===3&&moved.midi===65,`Touch move/pitch failed at ${width}`);
      check((await notes()).length===before.length+1,`Moving created an extra note at ${width}`);
      note=page.locator(`[data-note-id="${created.id}"]`);await note.scrollIntoViewIfNeeded();box=await note.locator('.note-resize').boundingBox();
      await gesture({x:box.x+box.width/2,y:box.y+box.height/2},world.beat/2,0);
      const resized=(await notes()).find(item=>item.id===created.id);
      check(resized.durationBeats===1.5,`Touch resizing failed at ${width}`);
      check((await notes()).length===before.length+1,`Resizing created an extra note at ${width}`);
      await page.locator('#undoNotes').click();check((await notes()).find(item=>item.id===created.id).durationBeats===1,'Touch Undo failed.');
      await page.locator('#redoNotes').click();check((await notes()).find(item=>item.id===created.id).durationBeats===1.5,'Touch Redo failed.');
      const scroller=page.locator('#pianoScroll');await scroller.scrollIntoViewIfNeeded();await scroller.evaluate(element=>element.scrollLeft=0);
      const bounds=await scroller.boundingBox(),initial=await scroller.evaluate(element=>({left:element.scrollLeft,top:element.scrollTop}));
      await gesture({x:bounds.x+bounds.width-40,y:bounds.y+bounds.height-40},-80,0);
      await page.waitForFunction(left=>document.querySelector('#pianoScroll').scrollLeft>left,initial.left);
      await gesture({x:bounds.x+bounds.width-40,y:bounds.y+bounds.height-80},0,-80);
      await page.waitForFunction(top=>document.querySelector('#pianoScroll').scrollTop>top,initial.top);
      check((await notes()).length===before.length+1,`Scrolling created an extra note at ${width}`);
      results.push({width,createdBeat:created.beat,movedBeat:moved.beat,pitch:moved.midi,duration:resized.durationBeats,undoRedo:true,scrolling:true});
    }
  }finally{await cdp.detach()}
  return results;
}
