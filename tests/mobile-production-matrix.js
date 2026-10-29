// Continue on the UI-authored production song; never reset or inject project state.
export async function runMobileProductionMatrix(page,{onStage=()=>{}}={}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)},results=[];
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const field=async(selector,value)=>{const input=page.locator(selector).first();await input.fill(String(value));await input.press('Tab')};
  const numeric=async(selector,value)=>{const input=page.locator(selector).first().locator('..').locator('.parameter-number');await input.fill(String(value));await input.press('Tab')};
  const navigate=async key=>{
    if(await page.locator('.mobile-navigation').isVisible()){
      await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${key}"]`).click();
    }else if(['keys','rack'].includes(key)){
      await page.locator('nav [data-view=arrange]').click();
      const project=await read(),track=project.tracks.find(track=>track[key==='keys'?'sampler':'drumRack']);
      await page.getByRole('button',{name:`Select ${track.name} track`,exact:true}).click();
      await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#openPiano').click();
    }else await page.locator(`nav [data-view="${key}"]`).click();
  };
  const cdp=await page.context().newCDPSession(page);
  const drag=async(x,y,dx=0,dy=0)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=5;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/5,y:y+dy*i/5}]});
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const touch=async(locator,dx=0,dy=0)=>{
    const dimensions=await locator.boundingBox();check(dimensions,'Missing touch target.');
    const position={x:dimensions.width/2,y:Math.min(40,dimensions.height/2)};
    await locator.hover({position});const box=await locator.boundingBox();
    await drag(box.x+position.x,box.y+position.y,dx,dy);
  };
  const errors=[],onError=error=>errors.push(error.message);page.on('pageerror',onError);
  try{
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    for(const size of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1280,height:900},{width:844,height:390}]){
      await page.setViewportSize(size);const result={...size};
      const record=(key)=>{result[key]=true;onStage({...size,interaction:key})};
      await navigate('arrange');record('navigation');
      let project=await read();const rack=project.tracks.find(track=>track.drumRack),clip=rack.clips[0],index=project.tracks.indexOf(rack);
      await page.locator('#editClips').click();
      const element=page.locator(`[data-clip="${clip.id}"]`);
      await element.evaluate(e=>{const scroller=e.closest('.arrangement');scroller.scrollTop=Math.max(0,e.closest('.track-row').offsetTop-72);scroller.scrollLeft=Math.max(0,e.offsetLeft-30)});
      await element.hover({position:{x:35,y:40}});let box=await element.boundingBox(),pixelsPerBeat=box.width/clip.durationBeats;
      await drag(box.x+35,box.y+40,pixelsPerBeat,0);
      check((await read()).tracks[index].clips[0].bar===clip.bar+.25,'Matrix clip movement failed.');
      await page.locator('#undoArrangement').click();record('clipMove');
      await element.evaluate(e=>{const scroller=e.closest('.arrangement');scroller.scrollTop=Math.max(0,e.closest('.track-row').offsetTop-72);scroller.scrollLeft=Math.max(0,e.offsetLeft-30)});
      const handle=element.locator('[data-resize=start]');await touch(handle,pixelsPerBeat,0);
      check((await read()).tracks[index].clips[0].durationBeats===clip.durationBeats-1,'Matrix clip resize failed.');
      await page.locator('#undoArrangement').click();record('clipResize');
      await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#selectLoopRange').click();
      await field('#rangeStart',0);await field('#rangeEnd',4);await page.locator('#rangeFirstTrack').selectOption('0');await page.locator('#rangeLastTrack').selectOption('1');record('timeRange');
      const count=(await read()).tracks.slice(0,2).map(track=>track.clips.length);
      await page.locator('#duplicateSection').click();check((await read()).tracks.slice(0,2).every((track,i)=>track.clips.length===count[i]+1),'Matrix section duplication failed.');
      await page.locator('#undoArrangement').click();record('multiTrackDuplicate');
      await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#selectLoopRange').click();
      await field('#rangeStart',1);await field('#rangeEnd',5);
      await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#setLoopRange').click();
      check((await read()).loopStart===.25&&(await read()).loopEnd===1.25,'Matrix Loop from Range failed.');
      await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#clearRange').click();
      await page.locator('#scrollArrangement').click();
      await page.locator('.arrangement').evaluate(e=>{e.scrollLeft=0;e.scrollTop=0});
      const ruler=page.locator('#ruler');await ruler.hover({position:{x:150,y:55}});box=await ruler.boundingBox();
      await drag(box.x+150,box.y+55);
      const expectedSeek=Math.round(150/pixelsPerBeat/.25)*.25*60/(await read()).bpm;
      check(Math.abs(Number(await page.locator('#playhead').getAttribute('aria-valuenow'))-expectedSeek)<1e-8,'Matrix ruler seek failed.');record('loopPlayhead');
      await page.getByRole('button',{name:`Select ${rack.name} track`,exact:true}).click();
      const mobile=size.width<=850;
      if(mobile)await page.getByRole('button',{name:'Selected track Mixer',exact:true}).click();
      else{
        if(await page.locator(`[data-vol="${index}"]`).isHidden())await page.locator('#toggleMixer').click();
        const expand=page.getByRole('button',{name:`Expand ${rack.name} track`,exact:true});
        if(await expand.getAttribute('aria-expanded')!=='true')await expand.click();
      }
      await numeric(`[data-vol="${index}"]`,.65);await numeric(`[data-pan="${index}"]`,.1);
      check((await read()).tracks[index].volume===.65&&(await read()).tracks[index].pan===.1,'Matrix Mixer binding failed.');
      if(mobile)await page.locator('.mobile-editor-exit').click();record('mixer');
      await page.locator(`[data-fx="${index}"]:visible`).first().click();await page.locator('#addTrackEffect').selectOption('utility');
      const effect=(await read()).tracks[index].fx.effects.length-1;
      await numeric(`[data-effect-param="${effect}"][data-param=gain]`,-1);
      check((await read()).tracks[index].fx.effects[effect].params.gain===-1,'Matrix device parameter failed.');record('devices');
      await navigate('keys');
      if(mobile)await page.getByRole('button',{name:'Expand Piano Roll',exact:true}).click();
      await page.locator('#pianoTouchMode').selectOption('draw');
      const note=page.locator('.piano-note').first(),noteId=await note.getAttribute('data-note-id');
      const noteState=async()=>((await read()).tracks.find(track=>track.sampler).patterns.flatMap(pattern=>pattern.notes).find(note=>note.id===noteId));
      const prior=await noteState();await note.hover({position:{x:2,y:5}});box=await note.boundingBox();
      await drag(box.x+2,box.y+5,prior.beat>2?-10:10,-22);
      const moved=await noteState();check(moved.beat!==prior.beat&&moved.midi!==prior.midi,'Matrix note time/pitch move failed.');
      await touch(page.locator(`[data-note-id="${noteId}"] .note-resize`),moved.beat+moved.durationBeats>=4?-10:10,0);
      check((await noteState()).durationBeats!==moved.durationBeats,'Matrix note resizing failed.');record('pianoNotes');
      if(await page.locator('#velocityPanel').getAttribute('open')===null)await page.locator('#velocityPanel>summary').click();
      const bar=page.locator(`[data-velocity-id="${noteId}"]`),before=(await noteState()).velocity;
      await bar.hover({position:{x:3,y:2}});box=await bar.boundingBox();
      await drag(box.x+3,box.y+2,0,before>.5?10:-10);
      check((await noteState()).velocity!==before,'Matrix velocity touch failed.');
      if(mobile)await page.locator('.mobile-editor-exit').click();record('pianoVelocity');
      await navigate('rack');const step=page.locator('[data-step-pad="1"][data-step="1"]');
      const old=await step.getAttribute('class');await touch(step);check(await step.getAttribute('class')!==old,'Matrix drum step failed.');record('drumSteps');
      await navigate('keys');
      if(await page.locator('#editSamplerSample').isHidden())await page.locator('.source-configuration>summary').click();
      if(results.length){
        page.once('dialog',dialog=>dialog.dismiss());await page.locator('#editSamplerSample').click();
        check(await page.locator('#editSamplerSample').isVisible()&&await page.locator('#startMarker').count()===0,'Cancelled sample replacement discarded the editor.');
      }
      const discard=dialog=>dialog.message()==='Discard the current unsaved sample and open this library sample?'?dialog.accept():dialog.dismiss();
      page.on('dialog',discard);
      try{await page.locator('#editSamplerSample').click()}finally{page.off('dialog',discard)}
      await touch(page.locator('#startMarker'),10,0);check(Number(await page.locator('#sampleWave').getAttribute('data-start'))>0,'Matrix waveform handle failed.');
      await field('#trimStart',0);await page.locator('#waveZoomIn').click();await page.locator('#waveFit').click();record('sampleWaveform');
      await navigate('recording');
      const recordingTrack=(await read()).tracks.find(track=>track.clips.some(clip=>clip.recording));
      await page.locator('#recordingTrack').selectOption(recordingTrack.id);await page.locator('#recordingArm').check();
      await page.locator('#recordingCountIn').selectOption('1');
      const takeId=(await read()).tracks.find(track=>track.id===recordingTrack.id).clips.find(clip=>clip.recording).id;
      await field(`[data-take-value="${takeId}"][data-key=gain]`,.75);
      check((await read()).tracks.find(track=>track.id===recordingTrack.id).clips.find(clip=>clip.id===takeId).gain===.75,'Matrix take gain failed.');record('recordingReview');
      await navigate('master');await page.locator('#masterMode').selectOption('advanced');
      await page.locator('.eq-selection select').selectOption('band-2');
      const gain=Number(await page.locator('[data-eq-value=gain]').inputValue());
      await touch(page.locator('[data-eq-node=band-2]'),0,-5);
      check(Number(await page.locator('[data-eq-value=gain]').inputValue())!==gain,'Matrix master EQ touch failed.');record('masterEq');
      await navigate('export');await page.locator('#exportFormat').selectOption('mp3');await page.locator('#exportFormat').selectOption('wav');record('exportControls');
      if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
      check(await page.locator('#saveEhs').isVisible(),'Matrix Project actions inaccessible.');await page.locator('.project-menu>summary').click();record('projectMenu');
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Matrix page overflow.');results.push(result);
    }
    check(!errors.length,errors.join('\n'));return{results,pageErrors:errors};
  }finally{await cdp.detach();page.off('pageerror',onError)}
}
