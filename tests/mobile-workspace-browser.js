// Real UI fixture; use a disposable origin, not a personal project.
export async function runMobileWorkspaceAcceptance(page){
  const check=(value,message)=>{if(!value)throw new Error(message)},errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const navigate=async key=>{
    if(await page.locator('.mobile-navigation').isVisible()){
      await page.locator('[data-mobile-switch]').click();await page.locator(`[data-mobile-workspace="${key}"]`).click();
    }else{
      const desktop=page.locator(`nav [data-view="${key}"]`);
      if(await desktop.count())await desktop.click();
      else{
        await page.locator('nav [data-view=arrange]').click();
        await page.getByRole('button',{name:`Select Mobile ${key==='keys'?'Melody':'Kit'} track`,exact:true}).click();
        await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#openPiano').click();
      }
    }
  };
  const touch=async(cdp,x,y,type='tap',dx=0,dy=0)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    if(type==='drag')for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/5,y:y+dy*i/5}]});
    await cdp.send('Input.dispatchTouchEvent',{type:type==='cancel'?'touchCancel':'touchEnd',touchPoints:[]});
  };
  let cdp;
  try{
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use empty disposable origin.');
    const add=async(type,name)=>{
      await navigate('arrange');await page.locator('#addTrack').click();await page.locator('#trackType').selectOption(type);
      await page.locator('#trackName').fill(name);await page.locator('#trackSetup button[type=submit]').click();
      await page.locator('#emptyPattern').click();await page.locator('.track-setup button[type=submit]').click();
    };
    await add('sampler','Mobile Melody');await add('drumRack','Mobile Kit');
    const layouts=[];
    for(const size of [{width:320,height:740},{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1280,height:900},{width:844,height:390}]){
      await page.setViewportSize(size);
      for(const key of ['arrange','keys','rack','sample','recording','master','export']){
        await navigate(key);
        const layout=await page.evaluate(({size,key})=>{
          const nav=document.querySelector('.mobile-navigation'),header=document.querySelector('.global-header').getBoundingClientRect();
          return{...size,key,overflow:document.documentElement.scrollWidth>innerWidth,headerHeight:header.height,mobileNav:getComputedStyle(nav).display!=='none',
            primaryTargets:[...document.querySelectorAll('.mobile-navigation button,#play,#stop')].filter(e=>e.getClientRects().length).every(e=>{const b=e.getBoundingClientRect();return b.width>=44&&b.height>=44})};
        },{size,key});
        check(!layout.overflow,`Overflow ${size.width}/${key}`);if(size.width<=850)check(layout.primaryTargets,`Small mobile primary target ${size.width}/${key}`);
        check(layout.mobileNav===(size.width<=850),`Wrong nav breakpoint ${size.width}`);layouts.push(layout);
        if(key==='keys'){
          const aligned=await page.evaluate(()=>{
            const key=document.querySelector('[data-key-midi="60"]').getBoundingClientRect(),lane=document.querySelector('.piano-lane[data-midi="60"]').getBoundingClientRect();
            return Math.abs(key.top-lane.top)<1&&Math.abs(key.height-lane.height)<1;
          });
          check(aligned,`Piano keyboard/pitch rows diverged at ${size.width}`);
        }
      }
    }
    await page.setViewportSize({width:390,height:844});await navigate('keys');
    await page.getByRole('button',{name:'Expand Piano Roll',exact:true}).click();
    check(await page.locator('.piano-editor.mobile-expanded-editor').count()===1,'Piano editor did not expand.');
    cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    await page.locator('#pianoTouchMode').selectOption('draw');
    await page.locator('#noteLength').selectOption('1');
    const tapLane=async(midi,beat)=>{
      const lane=page.locator(`.piano-lane[data-midi="${midi}"]`);await lane.scrollIntoViewIfNeeded();
      await page.locator('#pianoScroll').evaluate(element=>{element.scrollLeft=0});
      const box=await lane.boundingBox();await touch(cdp,box.x+beat*40+3,box.y+box.height/2);
      await page.waitForTimeout(100);
    };
    await tapLane(60,1);await tapLane(62,2);
    check(await page.locator('.piano-note').count()===2,'Touch drawing created missing/extra notes.');
    check(await page.locator('.piano-editor.mobile-expanded-editor').count()===1,'Draw rerender lost expanded editor.');
    await page.locator('#pianoTouchMode').selectOption('select');
    for(const note of await page.locator('.piano-note').all()){
      await note.scrollIntoViewIfNeeded();const box=await note.boundingBox();await touch(cdp,box.x+box.width/2,box.y+box.height/2);
    }
    // The last created note is selected already; toggle it back into the group.
    if(await page.locator('.piano-note.note-selected').count()!==2){
      const note=page.locator('.piano-note:not(.note-selected)').first();const box=await note.boundingBox();await touch(cdp,box.x+box.width/2,box.y+box.height/2);
    }
    check(await page.locator('.piano-note.note-selected').count()===2,'Additive touch selection failed.');
    const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')).tracks.find(t=>t.name==='Mobile Melody').patterns[0].notes);
    const original=await read();
    const visualNotes=()=>page.locator('.piano-note').evaluateAll(elements=>elements.map(e=>({id:e.dataset.noteId,left:e.style.left,width:e.style.width,midi:e.parentElement.dataset.midi})).sort((a,b)=>a.id.localeCompare(b.id)));
    const originalVisual=await visualNotes();
    await page.locator('#pianoTouchMode').selectOption('draw');
    const note=page.locator('.piano-note').first();await note.scrollIntoViewIfNeeded();const box=await note.boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+3,y:box.y+box.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+43,y:box.y+box.height/2-18}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    check(JSON.stringify(await read())===JSON.stringify(original),'Cancelled touch changed persisted notes.');
    check(JSON.stringify(await visualNotes())===JSON.stringify(originalVisual),'Cancelled touch did not restore actual note positions.');
    check(await page.locator('.piano-note').count()===2,'Cancel created extra notes.');
    const velocity=page.locator('.velocity-bar').first();await velocity.scrollIntoViewIfNeeded();
    const velocityBefore=await velocity.evaluate(e=>e.style.height),velocityBox=await velocity.boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:velocityBox.x+velocityBox.width/2,y:velocityBox.y+velocityBox.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:velocityBox.x+velocityBox.width/2,y:velocityBox.y-15}]});
    check(await velocity.evaluate(e=>e.style.height)!==velocityBefore,'Velocity cancellation fixture did not actually edit a bar.');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    check(await velocity.evaluate(e=>e.style.height)===velocityBefore,'Cancelled velocity did not restore bar.');
    check(JSON.stringify(await read())===JSON.stringify(original),'Cancelled velocity changed persisted data.');
    const active=page.locator('.piano-note').first();await active.scrollIntoViewIfNeeded();
    const activeBox=await active.boundingBox(),metrics=await page.locator('#pianoWorld').evaluate(e=>({beat:parseFloat(e.style.getPropertyValue('--beat-width')),row:parseFloat(e.style.getPropertyValue('--row-height'))}));
    await touch(cdp,activeBox.x+3,activeBox.y+activeBox.height/2,'drag',metrics.beat,-metrics.row);
    check((await read()).every(note=>{const before=original.find(n=>n.id===note.id);return note.beat===before.beat+1&&note.midi===before.midi+1}),'Selected-note move/pitch did not commit correctly.');
    await page.locator('#undoNotes').click();check(JSON.stringify(await read())===JSON.stringify(original),'Move Undo failed.');
    await page.locator('#redoNotes').click();check((await read())[0].beat===original[0].beat+1,'Move Redo failed.');
    await page.locator('#undoNotes').click();
    const edge=page.locator(`[data-note-id="${original[0].id}"]`).locator('.note-resize');await edge.scrollIntoViewIfNeeded();const edgeBox=await edge.boundingBox();
    await touch(cdp,edgeBox.x+edgeBox.width/2,edgeBox.y+edgeBox.height/2,'drag',metrics.beat/2,0);
    check((await read())[0].durationBeats===1.5,'Touch resize failed.');
    await page.locator('#undoNotes').click();check(JSON.stringify(await read())===JSON.stringify(original),'Resize Undo failed.');
    await page.locator('#pianoTouchMode').selectOption('scroll');
    const scroller=page.locator('#pianoScroll');await scroller.hover();const scrollBox=await scroller.boundingBox();
    const before=await scroller.evaluate(e=>({left:e.scrollLeft,top:e.scrollTop}));
    await touch(cdp,scrollBox.x+scrollBox.width*.7,scrollBox.y+scrollBox.height*.65,'drag',-80,-50);
    const after=await scroller.evaluate(e=>({left:e.scrollLeft,top:e.scrollTop}));
    check(after.left>before.left||after.top>before.top,'Scroll mode did not pan.');
    check(await page.locator('.piano-note').count()===2,'Scrolling created a note.');
    await page.locator('.mobile-editor-exit').click();
    check(await page.locator('.mobile-expanded-editor').count()===0,'Done failed to close editor.');
    await navigate('arrange');await page.locator('#selectRange').click();
    check(await page.locator('#selectRange').getAttribute('aria-pressed')==='true','Range mode missing');
    await page.locator('#editClips').click();
    check(await page.locator('#selectRange').getAttribute('aria-pressed')==='false','Conflicting Arrangement modes remain');
    await navigate('sample');await page.locator('[data-mobile-back]').click();
    check(await page.locator('.workspace').count()===1,'Back did not restore Arrangement.');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    check(JSON.stringify(await read())===JSON.stringify(original),'Reload lost note/pattern data.');
    check(!errors.length,errors.join('; '));
    return{layouts,expandedPiano:true,drawNotes:2,multiSelection:true,touchCancel:true,velocityCancel:true,movePitchResize:true,undoRedo:true,scrollNoExtraNotes:true,exclusiveArrangementModes:true,back:true,persistence:true,pageErrors:errors};
  }finally{
    if(cdp){await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach()}
    page.off('pageerror',onError);
  }

}

export async function runMobileRecordingSafety(page){
    const check=(value,message)=>{if(!value)throw new Error(message)};
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    await page.evaluate(async()=>{
      const {RecordingStudio}=await import('./src/recording-studio.js'),mount=RecordingStudio.prototype.mount,mic=navigator.mediaDevices.getUserMedia;
      globalThis.mobileRestore=()=>{RecordingStudio.prototype.mount=mount;navigator.mediaDevices.getUserMedia=mic};
      RecordingStudio.prototype.mount=function(...args){globalThis.mobileStudio=this;return mount.apply(this,args)};
      navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{globalThis.mobileResolveMic=()=>{
        const context=globalThis.mobileStudio.engine.ctx,destination=context.createMediaStreamDestination(),oscillator=context.createOscillator(),gain=context.createGain();
        oscillator.frequency.value=523.25;gain.gain.value=.15;oscillator.connect(gain).connect(destination);oscillator.start();
        globalThis.mobileMic={oscillator,gain,destination};resolve(destination.stream);
      }});
    });
    try{
      await page.locator('[data-mobile-switch]').click();await page.locator('[data-mobile-workspace=recording]').click();
      await page.locator('#recordingArm').check();await page.locator('#recordingCountIn').selectOption('0');
      await page.locator('#studioRecord').click();await page.waitForFunction(()=>Boolean(globalThis.mobileResolveMic));
      check(await page.locator('[data-mobile-switch]').isDisabled(),'Navigation escaped permission request.');
      check(await page.locator('[data-mobile-back]').isDisabled(),'Back escaped permission request.');
      check(await page.locator('#stop').isEnabled(),'Emergency Stop was disabled.');
      await page.evaluate(()=>globalThis.mobileResolveMic());await page.waitForFunction(()=>globalThis.mobileStudio.state==='recording');
      check(await page.locator('[data-mobile-arrange]').isDisabled(),'Navigation escaped active capture.');
      await page.waitForTimeout(500);
      await page.evaluate(()=>globalThis.mobileStudio.engine.ctx.suspend());
      await page.waitForFunction(()=>globalThis.mobileStudio.state==='idle',null,{timeout:15000});
      const result=await page.evaluate(()=>{
        const studio=globalThis.mobileStudio,clip=studio.target.clips.findLast(c=>c.recording),buffer=studio.buffers.get(clip.asset),data=buffer.getChannelData(0);
        let energy=0,peak=0;for(const value of data){energy+=value*value;peak=Math.max(peak,Math.abs(value))}
        return{frames:data.length,rms:Math.sqrt(energy/data.length),peak,ended:globalThis.mobileMic.destination.stream.getTracks().every(track=>track.readyState==='ended')};
      });
      check(result.rms>.09&&result.peak<.151&&result.ended,'Interrupted dry audio was lost/changed or input leaked.');
      check(await page.locator('[data-mobile-switch]').isEnabled(),'Navigation did not recover after saving interrupted take.');
      await page.evaluate(()=>globalThis.mobileStudio.engine.ctx.resume());
      return{permissionGuard:true,captureGuard:true,emergencyStop:true,suspensionSaved:true,dry:result};
    }finally{
      await page.evaluate(()=>{
        const studio=globalThis.mobileStudio;if(studio?.busy)studio.cancel();studio?.engine.stop();
        const mic=globalThis.mobileMic;if(mic){mic.oscillator.stop();mic.oscillator.disconnect();mic.gain.disconnect();mic.destination.disconnect()}
        globalThis.mobileRestore?.();delete globalThis.mobileRestore;delete globalThis.mobileMic;delete globalThis.mobileStudio;delete globalThis.mobileResolveMic;
      });
    }
}
