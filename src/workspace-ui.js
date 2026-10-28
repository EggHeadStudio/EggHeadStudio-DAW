import {describeControl,enhanceParameter} from './ui-controls.js';
import {isInstrumentClip,patternForClip} from './instrument-clips.js';
import {mountDeviceShell,enhanceEffectParameters} from './device-ui.js';
import {COMPACT_TRACK_HEIGHT,mountDevicePanelLayout,mountTrackLayout,trackHeight} from './workspace-layout.js';

export function createCommandDisclosure(label,className){
  const details=document.createElement('details');details.className=className;
  const summary=document.createElement('summary');summary.textContent=label;details.append(summary);
  details.addEventListener('keydown',event=>{if(event.key==='Escape'){details.open=false;summary.focus();event.stopPropagation()}});
  return details;
}

export function mountProjectControls(root){
  const actions=root.querySelector('header .actions'),menu=createCommandDisclosure('Project','project-menu');
  const body=document.createElement('div');body.className='disclosure-body';
  for(const button of actions.querySelectorAll('button')){
    if(button.id==='exportMix'){button.remove();continue}
    if(button.id==='saveProject'){button.textContent='Download JSON';button.title='Download metadata only. Audio remains in this browser; use Save .EHS for a portable project.'}
    body.append(button);
    button.addEventListener('click',()=>{menu.open=false;menu.querySelector('summary').focus()});
  }
  menu.append(body);actions.prepend(menu);
  root.querySelector('nav').setAttribute('aria-label','Workspaces');
  const header=root.querySelector('header');header.classList.add('global-header');
  for(const id of ['toStart','play','stop','loop'])describeControl(root.querySelector(`#${id}`),root.querySelector(`#${id}`).getAttribute('aria-label'));
}

export function arrangementActionState(track,clip,range){
  const selected=Boolean(clip),instrument=Boolean(track?.sampler||track?.drumRack),pattern=selected&&isInstrumentClip(clip);
  return{selected,instrument,pattern,range:Boolean(range&&range.endBeat>range.startBeat),shared:pattern&&track.clips.filter(item=>item.patternId===clip.patternId).length>1};
}

export function syncArrangementActions(root,track,clip,range){
  const state=arrangementActionState(track,clip,range),set=(id,hidden,disabled=false)=>{
    const element=root.querySelector(`#${id}`);if(element){element.hidden=hidden;element.disabled=disabled}
  };
  set('openPiano',!state.instrument);set('linkedDuplicate',!state.pattern);
  set('unlinkPattern',!state.pattern,!state.shared);set('splitClip',!state.selected);
  for(const id of ['copyClip','duplicateClip','cutRange','deleteRange'])set(id,false,!state.selected&&!state.range);
  for(const id of ['clearRange','setLoopRange'])set(id,false,!state.range);
  const row=root.querySelector('.range-toolbar');if(row)row.hidden=!state.range;
}

export function mountArrangementChrome({root,project,selectedTrack,selectedClip,state,addTrack,addEffect,selectContext,moveTrack}){
  const track=project.tracks[selectedTrack],clip=track?.clips.find(item=>item.id===selectedClip),tools=root.querySelector('.editor-tools');
  const edit=createCommandDisclosure('Edit','arrangement-edit-menu'),body=document.createElement('div');body.className='disclosure-body';
  for(const id of ['openPiano','splitClip','duplicateClip','copyClip','pasteClip','linkedDuplicate','unlinkPattern','clearRange','cutRange','deleteRange','setLoopRange','selectLoopRange','playInsertion']){
    const button=root.querySelector(`#${id}`);body.append(button);
    button.addEventListener('click',()=>{edit.open=false;edit.querySelector('summary').focus()});
  }
  edit.append(body);tools.prepend(edit);
  const openContext=target=>{
    const clipElement=target.closest('[data-clip]'),label=target.closest('.track-label[data-track]');
    if(!clipElement&&!label)return false;
    const id=clipElement?.dataset.clip||null,index=clipElement?project.tracks.findIndex(track=>track.clips.some(item=>item.id===id)):Number(label.dataset.track);
    selectContext(id,index);
    const menu=root.querySelector('.arrangement-edit-menu');menu.open=true;menu.scrollIntoView({block:'nearest'});
    menu.querySelector('button:not([hidden]):not(:disabled)')?.focus();return true;
  };
  root.querySelector('.arrangement').addEventListener('contextmenu',event=>{if(openContext(event.target))event.preventDefault()});
  root.querySelector('.arrangement').addEventListener('keydown',event=>{
    if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
      if(openContext(event.target)){event.preventDefault();event.stopPropagation()}
    }
  });
  tools.querySelectorAll('span').forEach(element=>{if(element.classList.contains('grow')||element.textContent.includes('Click timeline to seek'))element.remove()});
  tools.setAttribute('aria-label','Arrangement editing');
  syncArrangementActions(root,track,clip,state.selection);
  for(const label of root.querySelectorAll('.track-label[data-track]')){
    const index=Number(label.dataset.track),selected=index===selectedTrack;
    const title=label.querySelector('strong'),button=document.createElement('button');
    button.className='track-select';button.textContent=title.textContent;button.style.color=title.style.color;
    button.setAttribute('aria-label',`Select ${project.tracks[index].name} track`);button.setAttribute('aria-pressed',String(selected));
    button.onclick=event=>{event.stopPropagation();label.click()};title.replaceWith(button);
    for(const action of label.querySelectorAll('[data-mute],[data-solo],[data-fx],[data-track-settings]'))action.hidden=state.mixerOpen;
  }
  for(const button of root.querySelectorAll('[data-mute],[data-solo]')){
    const index=Number(button.dataset.mute??button.dataset.solo),mute=button.hasAttribute('data-mute');
    button.setAttribute('aria-label',`${mute?'Mute':'Solo'} ${project.tracks[index].name}`);
    button.setAttribute('aria-pressed',String(Boolean(project.tracks[index][mute?'mute':'solo'])));
  }
  const instrument=root.querySelector('.selected-instrument'),chain=root.querySelector('.device-chain-scroll');
  const master=root.querySelector('.master-strip');
  master.classList.add('right-mixer');master.hidden=!state.mixerOpen;root.querySelector('.ruler-row').append(master);
  root.querySelector('.bottom-panel>.mixer').remove();
  for(const strip of root.querySelectorAll('.right-mixer')){
    const index=Number(strip.dataset.mixerTrack),name=strip===master?'Master':project.tracks[index].name;
    if(strip!==master)strip.style.setProperty('--track-color',project.tracks[index].color);
    const volume=strip.querySelector('[data-vol],#masterVolume');
    const vertical=strip!==master&&trackHeight(state,project.tracks[index].id)>COMPACT_TRACK_HEIGHT;
    enhanceParameter(volume,{name:`${name} volume`,reset:1,vertical,format:'percent'});
    const pan=strip.querySelector('[data-pan]');
    if(pan)enhanceParameter(pan,{name:`${name} pan`,reset:0,format:'pan'});
    const meter=strip.querySelector('[data-meter]');
    if(meter){
      const peak=document.createElement('output');peak.className='meter-peak';peak.value='-inf dBFS';peak.setAttribute('aria-label',`${name} sample peak`);meter.append(peak);
    }
  }
  mountTrackLayout(root,project,state,moveTrack);
  mountDevicePanelLayout(root,state);
  if(instrument&&chain){
    const card=document.createElement('article');card.className='instrument-device';
    const heading=document.createElement('h3');heading.textContent=track.drumRack?'Drum Rack':'Sampler';
    const context=document.createElement('p');context.textContent=clip?patternForClip(track,clip)?.name||'Selected pattern':'Select or create a pattern';
    card.append(heading,context,instrument);chain.prepend(card);
  }
  const search=root.querySelector('#search');search.setAttribute('aria-label','Search samples');
  const browser=root.querySelector('.browser'),samplePane=document.createElement('div');samplePane.className='browser-category';
  while(browser.firstChild)samplePane.append(browser.firstChild);
  const tabs=document.createElement('div');tabs.className='browser-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Browser category');
  browser.append(tabs,samplePane);
  const panes=[samplePane];
  for(const [category,entries]of [['Instruments',[['Sampler','sampler'],['Drum Rack','drumRack']]],['Effects',[['Parametric EQ','eq'],['Compressor','compressor'],['Delay','delay'],['Reverb','reverb'],['Saturation','saturation'],['Utility','utility'],['Limiter','limiter']]]]){
    const pane=document.createElement('div');pane.className='browser-category';pane.hidden=true;
    const hint=document.createElement('p');hint.className='hint';hint.textContent=category==='Effects'?`Add to ${track?.name||'selected track'}. Edit in Devices below.`:'Create a named instrument track, then assign a sample.';
    pane.append(hint);
    for(const [name,type]of entries){
      const button=document.createElement('button');button.textContent=name;button.disabled=category==='Effects'&&!track;
      button.onclick=()=>category==='Effects'?addEffect(type):addTrack(type);pane.append(button);
    }
    browser.append(pane);panes.push(pane);
  }
  ['Samples','Instruments','Effects'].forEach((name,index)=>{
    const button=document.createElement('button');button.textContent=name;button.setAttribute('aria-pressed',String((state.browserCategory||0)===index));
    button.onclick=()=>{state.browserCategory=index;panes.forEach((pane,i)=>pane.hidden=i!==index);[...tabs.children].forEach((tab,i)=>tab.setAttribute('aria-pressed',String(i===index)))};
    tabs.append(button);panes[index].hidden=(state.browserCategory||0)!==index;
  });
  const hints={splitClip:'Split selected clip at the playhead (S).',copyClip:'Copy selected clip or time range (Ctrl/Cmd+C).',duplicateClip:'Duplicate selection (Ctrl/Cmd+D).',pasteClip:'Paste at insertion marker (Ctrl/Cmd+V).',selectRange:'Select time across tracks. Drag in the timeline; Shift+drag also selects a range.',editClips:'Touch editing mode: drag clips or their edge handles. Turn off to scroll.',toggleBrowser:'Show or hide the sample, instrument and effect browser.',toggleMixer:'Show or hide the track Mixer. Volume and pan are edited here.',toggleDevices:'Show or hide selected-track Devices and Clip Editor.',zoomIn:'Zoom timeline in.',zoomOut:'Zoom timeline out.'};
  for(const [id,text]of Object.entries(hints)){
    const element=root.querySelector(`#${id}`);if(element){if(!element.getAttribute('aria-label'))element.setAttribute('aria-label',element.textContent.trim().length<2?text:element.textContent.trim());describeControl(element,text)}
  }
}

export function enhanceDeviceChain(root,track){
  const chain=root.querySelector('.effect-chain');if(!chain)return;
  const presets=chain.querySelector('.effect-presets'),presetMenu=createCommandDisclosure('Presets','device-presets');
  presets.before(presetMenu);presetMenu.append(presets);
  const scroll=document.createElement('div');scroll.className='device-chain-scroll';scroll.setAttribute('aria-label','Ordered track devices');scroll.tabIndex=0;
  chain.append(scroll);
  for(const [index,article]of [...chain.querySelectorAll('.effect-device')].entries()){
    const effect=track.fx.effects[index],title=article.querySelector('header label').textContent.trim();
    mountDeviceShell(article,{id:effect.id,type:effect.type,title,onPreset:()=>{presetMenu.open=true;chain.querySelector('#effectPresetSelect').focus();presetMenu.scrollIntoView({block:'nearest'})}});
    scroll.append(article);enhanceEffectParameters(article,effect);
  }
}
