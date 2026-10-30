// Host-side Playwright fixture; use a disposable, genuinely foregrounded origin.
export async function runMobileArrangementAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const number=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab')};
  const navigate=async key=>{
    await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${key}"]`).click();
  };
  let cdp;
  const touch=async(x,y,dx=0,dy=0,cancel=false)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/5,y:y+dy*i/5}]});
      await page.waitForTimeout(20);
    }

    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const add=async(type,name)=>{
    await navigate('arrange');await page.locator('#addTrack').click();await page.locator('#trackType').selectOption(type);
    await page.locator('#trackName').fill(name);await page.locator('#trackSetup button[type=submit]').click();
  };
  const prepareClip=async(id)=>{
    const element=page.locator(`[data-clip="${id}"]`);
    await element.evaluate(e=>{const scroller=e.closest('.arrangement');e.scrollIntoView({block:'nearest',inline:'nearest'});scroller.scrollLeft=Math.max(0,e.offsetLeft-30)});
    await element.hover({position:{x:35,y:40}});
    return await element.boundingBox();
  };
  try{
    await page.setViewportSize({width:390,height:844});await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(await page.evaluate(()=>document.visibilityState==='visible'),'The browser must actually be visible; do not override visibility.');
    check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use an empty origin.');
    await page.locator('.project-menu>summary').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#newProject').click();
    await add('audio','Touch Audio');
    if(await page.locator('#addFiles').isHidden())await page.locator('#toggleBrowser').click();
    const bytes=await page.evaluate(async()=>{
      const {toWav}=await import(new URL('./audio.js',document.querySelector('script[type=module]').src)),context=new OfflineAudioContext(1,1,48000),buffer=context.createBuffer(1,240000,48000);
      for(let i=0;i<buffer.length;i++)buffer.getChannelData(0)[i]=.08*Math.sin(2*Math.PI*1000*i/48000);
      return [...new Uint8Array(await toWav(buffer).arrayBuffer())];
    });
    const chooser=page.waitForEvent('filechooser');await page.locator('#addFiles').click();
    await(await chooser).setFiles({name:'mobile5b-tone.wav',mimeType:'audio/wav',buffer:Buffer.from(bytes)});
    await page.waitForFunction(()=>document.querySelector('[data-add]'));
    await page.locator('[data-add]').click();
    if(await page.locator('#toggleBrowser').getAttribute('aria-expanded')==='true')await page.locator('#toggleBrowser').click();
    await add('sampler','Touch Melody');await page.locator('#chooseSamplerSample').click();await page.locator('.sample-picker-list button').last().click();
    await page.locator('#emptyPattern').click();await page.locator('.track-setup button[type=submit]').click();
    await page.getByRole('button',{name:'Expand Piano Roll',exact:true}).click();
    cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await page.locator('#pianoTouchMode').selectOption('draw');const lane=page.locator('.piano-lane[data-midi="60"]');
    await page.locator('#pianoScroll').evaluate(e=>e.scrollLeft=0);await lane.hover({position:{x:43,y:11}});
    let box=await lane.boundingBox();await touch(box.x+43,box.y+box.height/2);
    await page.waitForFunction(()=>document.querySelectorAll('.piano-note').length===1);
    await page.locator('.mobile-editor-exit').click();
    await add('drumRack','Touch Kit');await page.locator('[data-choose-pad="0"]').first().click();await page.locator('.sample-picker-list button').last().click();
    await page.locator('#emptyPattern').click();await page.locator('.track-setup button[type=submit]').click();
    await page.locator('[data-step-pad="0"][data-step="0"]').click();
    await navigate('arrange');
    let project=await read();const melody=project.tracks[1],id=melody.clips[0].id,audioId=project.tracks[0].clips[0].id;
    await page.locator('#editClips').click();
    const moves=[];
    for(const action of ['#zoomOut','#zoomIn','#zoomIn']){
      await page.locator(action).click();
      project=await read();const before=project.tracks[1].clips.find(c=>c.id===id),start=before.bar*4;
      box=await prepareClip(id);const pixelsPerBeat=box.width/before.durationBeats;
      await touch(box.x+35,box.y+box.height/2,pixelsPerBeat,0);
      await page.waitForFunction(({id,start})=>JSON.parse(localStorage.getItem('pulse-project')).tracks[1].clips.find(c=>c.id===id).bar*4===start+1,{id,start});
      moves.push({pixelsPerBeat,startBeat:start,endBeat:start+1});
    }
    const beforeCancel=JSON.stringify((await read()).tracks);
    box=await prepareClip(id);await touch(box.x+35,box.y+box.height/2,40,0,true);
    check(JSON.stringify((await read()).tracks)===beforeCancel,'Cancelled move changed persisted clips.');
    const beforeTrim=(await read()).tracks[1].clips.find(c=>c.id===id),pixelsPerBeat=(await prepareClip(id)).width/beforeTrim.durationBeats;
    for(const edge of ['start','end']){
      await prepareClip(id);const handle=page.locator(`[data-clip="${id}"] [data-resize="${edge}"]`);await handle.hover();box=await handle.boundingBox();
      const prior=(await read()).tracks[1].clips.find(c=>c.id===id);
      await touch(box.x+box.width/2,box.y+box.height/2,edge==='start'?pixelsPerBeat:-pixelsPerBeat,0);
      await page.waitForFunction(({id,duration})=>JSON.parse(localStorage.getItem('pulse-project')).tracks[1].clips.find(c=>c.id===id).durationBeats===duration-1,{id,duration:prior.durationBeats});
    }
    const trimmed=(await read()).tracks[1].clips.find(c=>c.id===id);
    check(trimmed.offsetBeats===1&&trimmed.bar===1,'Left trim lost pattern phase or snap.');
    await page.locator('#undoArrangement').click();await page.locator('#redoArrangement').click();
    check(JSON.stringify((await read()).tracks[1].clips.find(c=>c.id===id))===JSON.stringify(trimmed),'Trim Undo/Redo changed clip data.');
    await page.locator('#scrollArrangement').click();
    const beforeScroll=JSON.stringify((await read()).tracks);box=await prepareClip(audioId);
    await touch(box.x+Math.min(60,box.width/2),box.y+box.height/2,-80,0);
    check(JSON.stringify((await read()).tracks)===beforeScroll,'Scroll mode edited a clip.');
    await page.locator('.arrangement').evaluate(e=>{e.scrollLeft=80;e.scrollTop=0});
    const seekRuler=page.locator('#ruler');await seekRuler.hover({position:{x:150,y:55}});box=await seekRuler.boundingBox();
    const pointerX=box.x+150,expectedBeat=Math.round(150/pixelsPerBeat/.25)*.25;
    await touch(pointerX,box.y+55);
    check(Math.abs(Number(await page.locator('#playhead').getAttribute('aria-valuenow'))-expectedBeat*.5)<1e-8,'Scrolled ruler seek used the wrong timeline origin.');
    // Visible loop selection and numeric bounds avoid requiring a phone-wide drag.
    await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#selectLoopRange').click();
    await number('#rangeStart',1);await number('#rangeEnd',5);
    await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#setLoopRange').click();
    await page.locator('.arrangement').evaluate(e=>{e.scrollLeft=0;e.scrollTop=0});
    for(const edge of ['start','end']){
      const handle=page.locator(`[data-loop-edge="${edge}"]`);await handle.hover();box=await handle.boundingBox();
      await touch(box.x+box.width/2,box.y+box.height/2,edge==='start'?pixelsPerBeat:-pixelsPerBeat,0);
    }
    let loop=(await read());check(loop.loopStart===.5&&loop.loopEnd===1,'Touch loop edges were not snapped to beats 2 and 4.');
    const loopBefore={start:loop.loopStart,end:loop.loopEnd},loopStyle=await page.locator('.arrangement-loop').getAttribute('style');
    const loopBody=page.locator('.arrangement-loop');await loopBody.hover();box=await loopBody.boundingBox();
    await touch(box.x+box.width/2,box.y+box.height/2,pixelsPerBeat,0,true);
    loop=await read();check(loop.loopStart===loopBefore.start&&loop.loopEnd===loopBefore.end&&await page.locator('.arrangement-loop').getAttribute('style')===loopStyle,'Cancelled loop drag changed the loop.');
    await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#selectLoopRange').click();
    await number('#rangeStart',1);await number('#rangeEnd',9);await page.locator('#rangeFirstTrack').selectOption('0');await page.locator('#rangeLastTrack').selectOption('2');
    check((await page.locator('#rangeSummary').textContent()).includes('Tracks 1 - 3'),'Multi-track bounds were not applied.');
    const original=(await read()).tracks,clipboard=await page.evaluate(async()=>{const {copyTimeRange}=await import(new URL('./arrangement.js',document.querySelector('script[type=module]').src));const p=JSON.parse(localStorage.getItem('pulse-project'));return copyTimeRange(p.tracks,{startBeat:1,endBeat:9,firstTrack:0,lastTrack:2},p.bpm)});
    await page.locator('#copySection').click();await page.locator('#duplicateSection').click();
    const duplicated=(await read()).tracks,added=[];
    for(let index=0;index<3;index++)for(const clip of duplicated[index].clips.filter(c=>!original[index].clips.some(old=>old.id===c.id)))added.push({track:index,clip});
    check(added.length===clipboard.entries.length,'Section duplication dropped intersections.');
    for(const entry of clipboard.entries){
      const copy=added.find(item=>item.track===entry.trackOffset&&Math.abs(item.clip.bar*4-(9+entry.relativeBeat))<1e-8)?.clip;
      check(copy,'Section copy changed relative timing.');
      for(const key of ['asset','start','end','rate','gain','loopOffset','envelopeOffset','envelopeDuration','offsetBeats','durationBeats'])check(copy[key]===entry.clip[key],`Section copy changed ${key}.`);
      if(copy.kind==='instrument')check(copy.patternId!==entry.clip.patternId,'Duplicate unexpectedly shared the original pattern.');
    }
    await page.locator('#undoArrangement').click();check(JSON.stringify((await read()).tracks)===JSON.stringify(original),'Undo did not restore the entire section.');
    await page.locator('#redoArrangement').click();
    await page.locator('#copySection').click();await number('#sectionPasteBeat',24);await page.locator('#pasteSection').click();
    check((await page.locator('#rangeSummary').textContent()).includes('24.000 - 32.000'),'Explicit section paste did not use the requested destination.');
    // Cancel a range gesture and a ruler seek; neither may replace prior state.
    await page.locator('#selectRange').click();const summary=await page.locator('#rangeSummary').textContent();
    await page.locator('.arrangement').evaluate(e=>{e.scrollLeft=0;e.scrollTop=0});
    const firstLane=page.locator('.lane').first();await firstLane.hover({position:{x:50,y:35}});box=await firstLane.boundingBox();
    await touch(Math.max(130,box.x+50),box.y+35,50,0,true);
    check(await page.locator('#rangeSummary').textContent()===summary,'Cancelled range gesture lost the previous selection.');
    const insertion=await page.locator('.insertion-marker').evaluate(e=>e.style.left);
    const ruler=page.locator('#ruler');await ruler.hover({position:{x:50,y:55}});box=await ruler.boundingBox();
    await touch(Math.max(140,box.x+60),box.y+55,35,0,true);
    check(await page.locator('.insertion-marker').evaluate(e=>e.style.left)===insertion,'Cancelled seek moved the insertion marker.');
    await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#clearRange').click();
    await page.getByRole('button',{name:'Select Touch Audio track',exact:true}).click();
    await page.getByRole('button',{name:'Selected track Mixer',exact:true}).click();
    check(await page.locator('.right-mixer.mobile-expanded-editor').count()===1,'Selected Mixer did not expand.');
    const numeric=async(selector,value)=>{const field=page.locator(selector).locator('..').locator('.parameter-number');await field.fill(String(value));await field.press('Tab')};
    await numeric('.mobile-expanded-editor [data-vol="0"]',.6);await numeric('.mobile-expanded-editor [data-pan="0"]',-.25);
    await page.locator('.mobile-expanded-editor [data-mute="0"]').click();
    check(await page.locator('.right-mixer.mobile-expanded-editor').count()===1,'Mute rerender lost the expanded Mixer.');
    await page.locator('.mobile-expanded-editor [data-mute="0"]').click();await page.locator('.mobile-expanded-editor [data-solo="0"]').click();
    const mixed=(await read()).tracks[0];check(mixed.volume===.6&&mixed.pan===-.25&&mixed.solo&&!mixed.mute,'Expanded Mixer edited the wrong track/units.');
    await page.locator('.mobile-expanded-editor [data-solo="0"]').click();await page.locator('.mobile-expanded-editor [data-fx="0"]').click();
    check(await page.locator('.right-mixer.mobile-expanded-editor').count()===0,'Mixer blocked access to devices.');
    await page.locator('#addTrackEffect').selectOption('utility');await page.locator('#addTrackEffect').selectOption('delay');
    await page.locator('[data-effect-enabled="0"]').uncheck();await page.locator('[data-effect-down="0"]').click();
    check((await read()).tracks[0].fx.effects[1].type==='utility'&&!(await read()).tracks[0].fx.effects[1].enabled,'Device bypass/reorder did not persist.');
    await page.locator('[data-effect-remove="0"]').click();
    await page.locator('#play').click();await page.getByRole('button',{name:'Selected track Mixer',exact:true}).click();
    await page.waitForFunction(()=>{const e=document.querySelector('.mobile-expanded-editor [data-meter-left]');return e&&parseFloat(e.style.width)>0});
    await page.locator('.mobile-editor-exit').click();await page.locator('#stop').click();
    const sizes=[];
    for(const size of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1280,height:900},{width:844,height:390}]){
      await page.setViewportSize(size);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${size.width}`);
      sizes.push(size);
    }
    check(!errors.length,errors.join('\n'));
    return{visibleBrowser:true,mixedTracks:3,moves,trimStartEnd:true,moveCancel:true,rangeCancel:true,seekCancel:true,scrolledSeekBeat:expectedBeat,loopEdges:true,loopCancel:true,scrollNoEdit:true,sectionEntries:added.length,sectionMetadata:true,sectionUndoRedo:true,pasteAtBeat:24,mixerParameters:true,mixerRerender:true,actualMeter:true,devicesBypassReorderRemove:true,sizes,pageErrors:errors};
  }finally{if(cdp)await cdp.detach();page.off('pageerror',onError)}
}
