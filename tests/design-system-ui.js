// Run on a disposable origin. The existing UX acceptance creates its fixture.
export async function runControlInitializationAcceptance(page){
  const errors=[],onError=error=>errors.push(error.message);
  page.on('pageerror',onError);
  await page.evaluate(()=>sessionStorage.setItem('ehs-control-init-probe','1'));
  await page.addInitScript(()=>{
    if(location.protocol!=='http:'&&location.protocol!=='https:')return;
    if(sessionStorage.getItem('ehs-control-init-probe')!=='1')return;
    sessionStorage.removeItem('ehs-control-init-probe');
    const original=AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule=async function(url,...args){
      await original.call(this,url,...args);
      if(String(url).includes('sidechain-processor.js')){
        globalThis.ehsControlInitPending=true;
        await new Promise(resolve=>setTimeout(resolve,3000));
        globalThis.ehsControlInitPending=false;
      }
    };
  });
  try{
    await page.reload();await page.waitForFunction(()=>globalThis.ehsControlInitPending);
    await page.waitForSelector('[data-device-type=utility] .parameter-number');
    const field=page.locator('[data-device-type=utility] [data-param=gain]').locator('..').locator('.parameter-number');
    await field.fill('-9');await field.press('Tab');
    if((await page.locator('#toast').textContent()).startsWith('Ready.'))throw new Error('Initialization fixture missed the delayed loading window.');
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    const gain=await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')).tracks[0].fx.effects.find(effect=>effect.type==='utility').params.gain);
    if(errors.length||gain!==-9)throw new Error(`Initialization edit failed: ${errors.join('; ')} gain=${gain}`);
    await field.fill('-8');await field.press('Tab');
    return{editedDuringDelayedInitialization:true,persistedGain:gain,pageErrors:errors};
  }finally{page.off('pageerror',onError)}
}

export async function runDesignSystemAcceptance(page){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  await page.getByRole('button',{name:'Select UX Lead track',exact:true}).click();
  for(const id of ['toggleMixer','toggleDevices'])if(await page.locator(`#${id}`).getAttribute('aria-expanded')==='false')await page.locator(`#${id}`).click();
  while(await page.locator('[data-device-type]:not([data-device-type=utility])').count())await page.locator('[data-device-type]:not([data-device-type=utility]) [data-effect-remove]').first().click();
  const numeric=async(selector,value)=>{
    const field=page.locator(selector).locator('..').locator('.parameter-number');
    await field.fill(String(value));await field.press('Tab');
  };
  for(const type of ['compressor','delay','reverb','saturation','limiter'])await page.locator('#addTrackEffect').selectOption(type);
  check(await page.locator('[data-device-type]').count()===6,'Expected six existing devices.');
  const control=(type,key)=>`[data-device-type="${type}"] [data-effect-param][data-param="${key}"]`;
  for(const [type,key,value,expected]of [['compressor','threshold',-24,-24],['compressor','ratio',6,6],['compressor','attack',.02,.02],['delay','time',370,.37],['delay','feedback',.4,.4],['reverb','decay',2.2,2.2],['reverb','predelay',30,.03],['saturation','drive',4,4],['saturation','mix',.5,.5],['limiter','threshold',-2,-2]]){
    await numeric(control(type,key),value);
    check((await read()).tracks[0].fx.effects.find(effect=>effect.type===type).params[key]===expected,`${type}.${key} changed units/state incorrectly.`);
  }
  const arc=await page.locator('[data-device-type=delay] .dial-value').first().getAttribute('stroke-dasharray');
  check(parseFloat(arc)>0&&parseFloat(arc)<100,'Rotary arc is not driven by mapped parameter position.');
  await page.locator('[data-device-type=delay] [data-param=sync]').check();
  check(await page.locator(control('delay','time')).isDisabled(),'Tempo-synced time is not disabled.');
  check(await page.locator(control('delay','time')).locator('..').locator('.parameter-number').isDisabled(),'Disabled numeric entry still edits tempo-synced time.');
  await page.locator('[data-device-type=delay] [data-param=sync]').uncheck();
  const time=page.locator(control('delay','time'));await time.focus();await time.press('Home');await time.press('ArrowUp');
  check((await read()).tracks[0].fx.effects.find(effect=>effect.type==='delay').params.time>.01,'Log keyboard adjustment failed.');
  await numeric(control('delay','time'),370);
  await page.locator('[data-device-type=reverb] .device-fold').click();
  await page.locator('[data-device-type=delay] [data-effect-up]').click();
  check(await page.locator('[data-device-type=reverb] .device-body').isHidden(),'Rerender lost folded state.');
  check(await page.locator('[data-device-type=delay] [data-effect-up]').evaluate(element=>element===document.activeElement),'Reorder lost stable device focus.');
  await page.locator('[data-device-type=delay] [data-effect-enabled]').uncheck();
  check((await page.locator('[data-device-type=delay] .device-status').textContent())==='Bypassed','Bypass status unclear.');
  await page.locator('[data-device-type=delay] [data-effect-enabled]').check();
  await page.locator('[data-device-type=delay] .device-preset').click();
  check(await page.locator('.device-presets').getAttribute('open')!==null,'Device preset shortcut failed.');
  const beforePreset=JSON.stringify((await read()).tracks[0].fx.effects);
  await page.locator('#effectPresetSelect').selectOption('');await page.locator('#loadEffectPreset').click();
  check(JSON.stringify((await read()).tracks[0].fx.effects)===beforePreset&&await page.locator('#toast').textContent()==='Choose an effect preset to load.','Empty preset choice silently changed the chain.');
  await page.locator('.device-presets>summary').click();
  const expandTrack=page.getByRole('button',{name:'Expand UX Lead track',exact:true});
  if(await expandTrack.getAttribute('aria-expanded')==='false')await expandTrack.click();
  const volume=page.locator('[data-vol="0"]');await numeric('[data-vol="0"]',.65);
  await volume.press('ArrowUp');check((await read()).tracks[0].volume===.66,'Mixer range/numeric are not synchronized.');
  await numeric('[data-pan="0"]',-.3);check((await read()).tracks[0].pan===-.3,'Pan field is not authoritative.');
  const rectangles=await page.evaluate(()=>[...document.querySelectorAll('.track-row:has(.lane)')].map(row=>{const lane=row.querySelector('.lane').getBoundingClientRect(),mixer=row.querySelector('.right-mixer').getBoundingClientRect();return{top:Math.abs(lane.top-mixer.top),height:Math.abs(lane.height-mixer.height)}}));
  check(rectangles.every(rect=>rect.top<1&&rect.height<1),'Mixer faders no longer align with lanes.');
  await page.locator('[data-track-settings="0"]:visible').click();
  await page.locator('#trackName').fill('Do not delete with shortcut');await page.locator('#trackName').press('Control+d');await page.keyboard.press('Escape');
  check(await page.locator('[data-track-settings="0"]:visible').evaluate(element=>element===document.activeElement),'Modal did not restore opener focus.');
  const beforeClips=(await read()).tracks[0].clips.length;
  await page.locator('[data-device-type=utility] .parameter-number').first().fill('-8');
  await page.locator('[data-device-type=utility] .parameter-number').first().press('Control+d');
  await page.locator('[data-device-type=utility] .parameter-number').first().press('Tab');
  check((await read()).tracks[0].clips.length===beforeClips,'Typing in device controls triggered Arrangement shortcuts.');
  const layouts=[],cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const touch=async(selector,dx,dy,cancel=false)=>{
    const input=page.locator(selector);await input.scrollIntoViewIfNeeded();
    const rect=await input.boundingBox(),point={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+dx,y:point.y+dy}]});
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  };
  try{
    for(const width of [360,390,430,768,1280]){
      await page.setViewportSize({width,height:1100});await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
      await page.getByRole('button',{name:'Select UX Lead track',exact:true}).click();
      for(const id of ['toggleMixer','toggleDevices'])if(await page.locator(`#${id}`).getAttribute('aria-expanded')==='false')await page.locator(`#${id}`).click();
      const expand=page.getByRole('button',{name:'Expand UX Lead track',exact:true});
      if(await expand.getAttribute('aria-expanded')==='false')await expand.click();
      const clips=JSON.stringify((await read()).tracks.map(track=>track.clips));
      await numeric(control('compressor','attack'),.02);
      const attackBefore=(await read()).tracks[0].fx.effects.find(effect=>effect.type==='compressor').params.attack;
      await touch(control('compressor','attack'),0,-14);
      check((await read()).tracks[0].fx.effects.find(effect=>effect.type==='compressor').params.attack>attackBefore,`Log knob touch failed at ${width}.`);
      await numeric(control('compressor','threshold'),-30);
      await touch(control('compressor','threshold'),20,0);
      check((await read()).tracks[0].fx.effects.find(effect=>effect.type==='compressor').params.threshold!==-30,`Threshold slider touch failed at ${width}.`);
      await numeric('[data-pan="0"]',-.3);
      const panBefore=(await read()).tracks[0].pan;await touch('[data-pan="0"]',12,0);
      check((await read()).tracks[0].pan!==panBefore,`Bipolar slider touch failed at ${width}.`);
      await numeric('[data-vol="0"]',.4);
      await touch('[data-vol="0"]',0,-15);
      check((await read()).tracks[0].volume>.4,`Vertical fader touch failed at ${width}.`);
      const beforeCancel=(await read()).tracks[0].fx.effects.find(effect=>effect.type==='compressor').params.attack;
      await touch(control('compressor','attack'),0,-14,true);
      check((await read()).tracks[0].fx.effects.find(effect=>effect.type==='compressor').params.attack===beforeCancel,'Cancelled pointer did not restore original value.');
      check(JSON.stringify((await read()).tracks.map(track=>track.clips))===clips,'Controls accidentally edited Arrangement clips.');
      const row=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,knobSize:document.querySelector('.parameter-rotary input').getBoundingClientRect().width,chainScrollWidth:document.querySelector('.device-chain-scroll').scrollWidth,chainWidth:document.querySelector('.device-chain-scroll').clientWidth,domNodes:document.querySelectorAll('*').length}));
      check(row.documentWidth<=width&&row.knobSize>=44&&row.chainScrollWidth>row.chainWidth,`Layout/targets/chain scrolling failed at ${width}.`);
      layouts.push(row);
    }
  }finally{await cdp.detach()}
  await page.setViewportSize({width:1280,height:1100});
  await page.locator('.arrangement-edit-menu>summary').click();await page.locator('#openPiano').click();
  const filter=page.locator('#filterCutoff');await filter.scrollIntoViewIfNeeded();
  await numeric('#filterCutoff',2000);
  check((await read()).tracks[0].fx.cutoff===2000,'Sampler filter mapping is detached from state.');
  await filter.press('ArrowUp');check((await read()).tracks[0].fx.cutoff>2000,'Log filter keyboard adjustment failed.');
  await page.locator('#openTrackDevices').click();
  await page.locator('#projectName').fill('Design System Acceptance');await page.locator('#projectName').press('Tab');
  const expected=await read();await page.reload();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(JSON.stringify((await read()).tracks)===JSON.stringify(expected.tracks),'Reload altered parameters or routing.');
  const contrast=await page.evaluate(()=>{
    const style=getComputedStyle(document.documentElement),value=name=>style.getPropertyValue(name).trim();
    const luminance=hex=>{
      const channels=hex.replace('#','').match(/../g).map(channel=>parseInt(channel,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
    };
    const pairs=[['--text','--surface'],['--text-secondary','--surface-device'],['--text-muted','--surface-raised'],['--focus','--surface-raised'],['--accent','--selected'],['--error','--surface'],['--warning','--surface']];
    for(const family of ['eq','compressor','delay','reverb','saturation','filter','limiter','utility'])pairs.push([`--device-${family}`,'--surface-device']);
    return pairs.map(([foreground,background])=>{const a=luminance(value(foreground)),b=luminance(value(background));return{foreground,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}});
  });
  check(contrast.every(pair=>pair.ratio>=4.5),'Token text/state contrast below chosen 4.5:1 target.');
  check(errors.length===0,errors.join('; '));
  return{effects:expected.tracks[0].fx.effects.map(effect=>({type:effect.type,enabled:effect.enabled})),layouts,contrast,focusRestoration:true,disabledTime:true,persistence:true,samplerCutoff:expected.tracks[0].fx.cutoff};
}
