export async function runInstrumentWorkflowAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const click=selector=>page.locator(selector).first().click({force:true});
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use a fresh disposable origin.');
  page.once('dialog',dialog=>dialog.accept());await click('#newProject');
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
  await pick('[data-choose-pad="0"]','tone');await pick('[data-choose-pad="1"]','hit');
  track=(await read()).tracks[0];
  check(track.drumRack.pads[0].asset!==track.drumRack.pads[1].asset&&track.drumRack.pads.slice(2).every(pad=>!pad.asset),'Pad assignments leaked.');
  await click('#rackBack');await click('[data-new-pattern="0"]');await click('dialog button[type=submit]');
  check((await read()).tracks[0].clips[0].durationBeats===16,'Default pattern is not four bars.');
  await click('[data-open-instrument="0"]');await click('[data-step-pad="0"][data-step="0"]');
  await page.locator('#addTrackEffect').selectOption('utility');await page.locator('[data-effect-param][data-param=gain]').fill('-6');
  await click('#rackBack');await add('sampler','Empty Lead');
  track=(await read()).tracks[1];check(!track.sampler.asset&&track.clips.length===0,'Sampler was not empty.');
  check((await page.locator('.sample-source').textContent()).includes('No sample selected'),'Empty source hint missing.');
  await pick('#chooseSamplerSample','tone');await click('#previewSamplerSample');
  await click('#backArrange');await click('[data-new-pattern="1"]');await click('dialog button[type=submit]');
  await click('[data-open-instrument="1"]');
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
