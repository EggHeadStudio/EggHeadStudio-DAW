// Pass a Playwright Page on a disposable, freshly served origin.
export async function runInstrumentUiAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const tap=selector=>page.locator(selector).click({force:true});
  const change=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab')};
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(await page.evaluate(()=>localStorage.getItem('pulse-project')===null),'UI acceptance requires a fresh disposable origin.');
  page.once('dialog',dialog=>dialog.accept());await tap('#newProject');
  await page.evaluate(async()=>{
    const {instrumentBuffers}=await import('./tests/instrument-fixture.js'),{toWav}=await import('./src/audio.js');
    const context=new OfflineAudioContext(1,44100,44100),dt=new DataTransfer();
    for(const [name,buffer]of instrumentBuffers(context))dt.items.add(new File([toWav(buffer)],`${name}.wav`,{type:'audio/wav'}));
    const input=document.querySelector('#importFiles');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Imported 2'));
  const addTrack=async(type,name,sample)=>{
    await tap(type==='sampler'?'#addSampler':type==='drumRack'?'#addRack':'#addTrack');
    const dialog=page.locator('.track-setup');
    await dialog.getByRole('textbox',{name:'Name',exact:true}).fill(name);
    if(sample)await dialog.getByRole('combobox',{name:'Sample',exact:true}).selectOption({label:sample});
    await dialog.getByRole('button',{name:'Create track',exact:true}).click();
  };
  await addTrack('audio','Backing');
  await page.locator('[data-add]').first().click();
  for(const [name,midi]of [['Bass',48],['Melody',60]]){
    await addTrack('sampler',name,'tone.wav');await tap('#emptyPattern');
    await change('#patternName',`${name} Verse`);await change('#rootKey',60);
    await page.locator('#noteLength').selectOption('1');
    const lane=page.locator(`.piano-lane[data-midi="${midi}"]`);await lane.scrollIntoViewIfNeeded();await lane.click({position:{x:10,y:8}});
    await tap('#backArrange');await tap('#duplicateClip');await tap('#linkedDuplicate');await tap('#openPiano');
    await change('#patternName',`${name} Linked`);
    const second=page.locator(`.piano-lane[data-midi="${midi+2}"]`);await second.scrollIntoViewIfNeeded();await second.click({position:{x:60,y:8}});
    check((await page.locator('.pattern-controls').textContent()).includes('LINKED: 2'),'Linked editor indicator missing.');
    await tap('#editorUnlink');check(!(await page.locator('.pattern-controls').textContent()).includes('LINKED:'),'Unlink failed.');
    await tap('#backArrange');
    const project=await read(),track=project.tracks.find(track=>track.name===name);
    const patternFor=clip=>track.patterns.find(pattern=>pattern.id===clip.patternId);
    check(patternFor(track.clips[0]).notes.length===1,'Independent source pattern changed.');
    check(patternFor(track.clips[1]).notes.length===2&&patternFor(track.clips[2]).notes.length===2,'Linked edit did not propagate before unlink.');
  }
  await addTrack('drumRack','Drums','hit.wav');await tap('#addPatternClip');await tap('#openPiano');
  await change('#patternName','Drum Verse');await page.locator('.drum-step[data-step-pad="0"][data-step="0"]').click();
  await tap('#rackBack');await tap('#addPatternClip');await tap('#openPiano');await change('#patternName','Drum Fill');
  await change('#rackVelocity','0.65');await page.locator('.drum-step[data-step-pad="1"][data-step="8"]').click();
  await tap('#rackBack');await change('#clipBar','1');await tap('#moveClip');
  await tap('#linkedDuplicate');
  const drumId=(await read()).tracks[3].id;
  await page.locator('[data-track="1"]').click({position:{x:40,y:15}});
  await page.locator('#addTrackEffect').selectOption('compressor');
  await page.locator('[data-sidechain-source="0"]').selectOption(drumId);
  if(await page.locator('#toggleDevices').getAttribute('aria-expanded')==='false')await tap('#toggleDevices');
  await page.evaluate(()=>document.querySelector('[data-sidechain-toggle]').scrollIntoView({block:'center'}));
  await page.locator('[data-sidechain-toggle="0"]').check({force:true});
  await page.locator('[data-track="0"]').click({position:{x:40,y:15}});
  await page.locator('#addTrackEffect').selectOption('utility');
  if(await page.locator('#toggleDevices').getAttribute('aria-expanded')==='true')await tap('#toggleDevices');
  await tap('#selectRange');
  const first=await page.locator('.lane[data-lane="0"]').boundingBox(),last=await page.locator('.lane[data-lane="3"]').boundingBox();
  await page.mouse.move(first.x+25,first.y+40);await page.mouse.down();await page.mouse.move(first.x+600,last.y+40,{steps:10});await page.mouse.up();
  check((await page.locator('#rangeSummary').textContent()).includes('Tracks 1 - 4'),'Mixed range did not span all tracks.');
  await change('#rangeStart',0);await change('#rangeEnd',16);
  const before=await read();await tap('#duplicateClip');const duplicated=await read();
  check(duplicated.tracks.every((track,index)=>track.clips.length>before.tracks[index].clips.length),'Mixed duplication lost a track.');
  await tap('#undoArrangement');check((await read()).tracks.every((track,index)=>track.clips.length===before.tracks[index].clips.length),'Mixed undo failed.');
  await tap('#redoArrangement');
  await page.locator('[data-view="master"]').click();await page.locator('#masterMode').selectOption('advanced');
  await page.evaluate(()=>document.querySelector('#masterLimiterEnabled').scrollIntoView({block:'center'}));
  await page.locator('#masterLimiterEnabled').check({force:true});
  await page.locator('[data-master-param="outputGainDb"]').first().fill('-3');await page.locator('[data-master-param="outputGainDb"]').first().dispatchEvent('input');
  await page.locator('[data-view="arrange"]').click();
  const final=await read();
  check(final.schemaVersion===2,'Typed clips did not activate explicit schema 2.');
  return{tracks:final.tracks.map(track=>({name:track.name,clips:track.clips.length,patterns:track.patterns?.length||0})),schema:final.schemaVersion,sidechain:final.tracks[1].fx.effects[0].params.sidechain,limiter:final.mastering.limiter.enabled};
}

export async function runInstrumentTouchAcceptance(page){
  const cdp=await page.context().newCDPSession(page),results=[];
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touch=async(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});
  try{
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1100});await page.reload();
      await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Ready.'));
      const source=await page.evaluate(()=>{
        const project=JSON.parse(localStorage.getItem('pulse-project')),track=project.tracks.find(track=>track.sampler),clip=track.clips[0],pattern=track.patterns.find(pattern=>pattern.id===clip.patternId);
        return{id:clip.id,bar:clip.bar,duration:clip.durationBeats,noteCount:pattern.notes.length,midi:Array.from({length:60},(_,index)=>36+index).find(midi=>!pattern.notes.some(note=>note.midi===midi))};
      });
      for(let tap=0;tap<2;tap++){
        await page.evaluate(id=>document.querySelector(`[data-clip="${id}"]`).scrollIntoView({block:'center',inline:'nearest'}),source.id);
        const box=await page.locator(`[data-clip="${source.id}"]`).boundingBox();
        await touch('touchStart',box.x+40,box.y+55);await touch('touchEnd');
      }
      await page.locator('#patternName').waitFor();
      const midi=source.midi;
      await page.evaluate(midi=>document.querySelector(`.piano-lane[data-midi="${midi}"]`).scrollIntoView({block:'center'}),midi);
      const lane=await page.locator(`.piano-lane[data-midi="${midi}"]`).boundingBox();
      await touch('touchStart',lane.x+35,lane.y+9);await touch('touchEnd');
      await page.waitForFunction(({id,count})=>{
        const project=JSON.parse(localStorage.getItem('pulse-project')),track=project.tracks.find(track=>track.clips.some(clip=>clip.id===id)),clip=track.clips.find(clip=>clip.id===id);
        return track.patterns.find(pattern=>pattern.id===clip.patternId).notes.length===count+1;
      },{id:source.id,count:source.noteCount});
      await page.locator('#backArrange').click();await page.locator('#editClips').click();
      await page.evaluate(id=>document.querySelector(`[data-clip="${id}"]`).scrollIntoView({block:'center',inline:'nearest'}),source.id);
      let box=await page.locator(`[data-clip="${source.id}"]`).boundingBox();
      await touch('touchStart',box.x+40,box.y+55);
      for(let move=1;move<=5;move++)await touch('touchMove',box.x+40+39*move/5,box.y+55);
      await touch('touchEnd');
      box=await page.locator(`[data-clip="${source.id}"] [data-resize="end"]`).boundingBox();
      await touch('touchStart',box.x+box.width/2,box.y+40);
      for(let move=1;move<=5;move++)await touch('touchMove',box.x+box.width/2+39*move/5,box.y+40);
      await touch('touchEnd');
      const edited=await page.evaluate(id=>{
        const project=JSON.parse(localStorage.getItem('pulse-project'));return project.tracks.flatMap(track=>track.clips).find(clip=>clip.id===id);
      },source.id);
      if(edited.bar!==source.bar+.25||edited.durationBeats!==source.duration+1)throw new Error(`Touch move/resize failed at ${width}px.`);
      await page.locator('#undoArrangement').click();await page.locator('#undoArrangement').click();
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      if(overflow)throw new Error(`Page overflows horizontally at ${width}px.`);
      results.push({width,noteAdded:true,moveBeats:1,resizeBeats:1,undoRestored:true,pageOverflow:false});
    }
  }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach()}
  return results;
}
