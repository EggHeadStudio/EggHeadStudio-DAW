import {enhanceParameter} from './ui-controls.js';
import {DEFAULT_MASTERING_SETTINGS} from './mastering.js';

function stage(parent,key,title){
  const section=document.createElement('section');section.className='workflow-stage';section.dataset.workflowStage=key;
  section.id=`workflow-${key}`;section.setAttribute('aria-label',title);
  const heading=document.createElement('h3');heading.textContent=title;heading.tabIndex=-1;section.append(heading);parent.append(section);
  return section;
}

function workflowNav(studio,entries){
  const nav=document.createElement('nav');nav.className='workflow-nav';nav.setAttribute('aria-label','Production workflow');
  for(const [key,title]of entries){
    const button=document.createElement('button');button.textContent=title;button.type='button';
    button.onclick=()=>{
      const target=studio.querySelector(`#workflow-${key}`);
      if(target?.tagName==='DETAILS')target.open=true;
      const heading=target?.querySelector('h3,summary');heading?.focus({preventScroll:true});target?.scrollIntoView({block:'start'});
    };
    nav.append(button);
  }
  studio.querySelector('.section-title').after(nav);
}

export function organizeSampleStudio(root){
  const studio=root.querySelector('.sample-studio'),wave=studio.querySelector('.wave-panel');
  const entries=[['capture','1 Record / Import'],['edit','2 Edit'],['process','3 Process'],['preview','4 Preview'],['save','5 Save']];
  const stages=new Map(entries.map(([key,title])=>[key,stage(studio,key,title)]));
  stages.get('capture').append(studio.querySelector('.record-controls'));
  const edit=stages.get('edit');
  for(const selector of ['.sample-wave-toolbar','#waveViewport','.wave-ruler','.sample-edit-grid','.sample-tools'])edit.append(wave.querySelector(selector));
  const process=stages.get('process'),gain=root.querySelector('#editGain').closest('label'),target=root.querySelector('#normalizeTarget').closest('label'),normalize=root.querySelector('#normalize');
  process.append(gain,target,normalize,wave.querySelector('.sample-processing'),wave.querySelector('.sample-fx'));
  process.hidden=root.querySelector('#sampleWave').dataset.length==='0';
  stages.get('preview').append(wave.querySelector('.sample-playback'));
  const save=stages.get('save');save.append(wave.querySelector('.record-controls'));
  const format=document.createElement('p');format.className='hint';format.textContent='Output: lossless 32-bit float WAV. Save creates a new library asset; the original is unchanged. Use Export Studio for song WAV/MP3.';
  save.append(format);
  for(const node of [...wave.children])edit.append(node);
  wave.remove();workflowNav(studio,entries);
}

export function organizeRecordingStudio(root,{advancedOpen=false}={}){
  const studio=root.querySelector('.recording-studio'),options=studio.querySelector('.recording-options');
  const backing=studio.querySelector('.recording-backing');backing.id='workflow-backing';
  const advanced=document.createElement('details');advanced.className='recording-advanced';
  advanced.open=advancedOpen;
  advanced.innerHTML='<summary>Advanced recording settings</summary><div class="recording-options"></div>';
  const body=advanced.querySelector('.recording-options');
  for(const id of ['recordingOffset','recordingMonitor','recordingClickVolume'])body.append(root.querySelector(`#${id}`).closest('label'));
  body.append(root.querySelector('#monitorStatus'),root.querySelector('#compensationHint'));
  advanced.append(root.querySelector('.recording-punch'),root.querySelector('.recording-calibration'));
  options.after(advanced);
  const controls=root.querySelector('.recording-controls');controls.id='workflow-record';
  options.before(backing);backing.after(options);options.after(controls);
  controls.after(root.querySelector('.recording-wave-panel'));
  const heading=document.createElement('h3');heading.textContent='Select backing, arm an Audio track, then Record';heading.className='workflow-instruction';backing.before(heading);
  const recovery=document.createElement('div');recovery.className='recording-recovery';recovery.setAttribute('aria-label','Unsaved take recovery');
  recovery.append(root.querySelector('#retryRecordingSave'),root.querySelector('#downloadBufferedTake'));controls.after(recovery);
  const instruction=document.createElement('p');instruction.className='hint';instruction.textContent='Review takes below, then use Open in Arrangement or Sample Studio to continue editing.';
  root.querySelector('.recording-takes').before(instruction);
}

export function organizeInstrumentStudio(root){
  const toolbar=root.querySelector('.piano-toolbar');
  if(toolbar){
    const groups=[['Note setup',['pianoGrid','noteLength','noteVelocity']],['View',['timeZoom','keyZoom']],['Note editing',['undoNotes','redoNotes','copyNotes','pasteNotes','duplicateNotes','quantizeNotes','deleteNote']]];
    for(const [name,ids]of groups){
      const group=document.createElement('div');group.className='piano-tool-group';group.setAttribute('role','group');group.setAttribute('aria-label',name);
      for(const id of ids){const input=root.querySelector(`#${id}`);group.append(input.closest('label')||input)}
      toolbar.append(group);
    }
    const hint=document.createElement('p');hint.className='hint';hint.textContent='Tap a row to create a note. Drag a note to move/pitch; drag its right edge to resize. Scroll the grid to navigate; edit velocity below.';
    toolbar.before(hint);
    const settings=root.querySelector('.sampler-settings');
    if(settings){const details=document.createElement('details');details.className='source-configuration';details.innerHTML='<summary>Sample configuration: root, region & envelope</summary>';settings.before(details);details.append(settings)}
  }
  const rack=root.querySelector('.drum-rack-studio');
  if(rack){
    const tools=rack.querySelector('.drum-tools');tools.setAttribute('role','group');tools.setAttribute('aria-label','Pattern and step editing');
    const heading=document.createElement('p');heading.className='workflow-instruction';heading.textContent='Select Pad > Choose Sample > Edit Steps > Preview';
    rack.querySelector('.drum-pad-grid').before(heading);
    const inspector=rack.querySelector('.selected-pad-editor');inspector.setAttribute('aria-label','Selected pad inspector');
    // The existing grid and step rows still reference the same stable pad notes.
    for(const row of rack.querySelectorAll('.step-row')){
      const id=row.dataset.stepRow,pad=rack.querySelector(`[data-pad-id="${CSS.escape(id)}"] .pad-selected`);
      row.classList.toggle('selected-pad-row',Boolean(pad));
    }
  }
}

export function organizeMasteringStudio(root,settings,focusKey){
  const studio=root.querySelector('.mastering-studio'),chain=root.querySelector('.master-advanced');
  const input=stage(chain,'master-input','Input');
  input.append(root.querySelector('[data-master-param=inputGainDb]').closest('label'));
  const output=[...root.querySelectorAll('.master-module')].find(module=>module.querySelector('header')?.textContent.trim()==='Output');
  // Keep the output-stage binding, not its duplicate toolbar editor.
  root.querySelector('.mastering-toolbar [data-master-param=outputGainDb]').closest('label').remove();
  output.querySelector('.hint').textContent='Output gain precedes the fixed final limiter. Audio format and release settings are in Export Studio.';
  const map=new Map([['eq','masterEqEnabled'],['saturation','masterSatEnabled'],['imager','masterImagerEnabled'],['multiband','masterMultibandEnabled'],['limiter','masterLimiterEnabled']].map(([key,id])=>[key,root.querySelector(`#${id}`).closest('.master-module')]));
  const modules=document.createElement('div');modules.className='workflow-master-chain';chain.append(input,modules);
  for(const key of [...settings.chainOrder,'output','limiter']){
    const module=key==='output'?output:map.get(key);module.dataset.masterStage=key;modules.append(module);
    const header=module.querySelector('header'),status=document.createElement('span');status.className='module-status';
    const enabled=header.querySelector('input[type=checkbox]');
    const paint=()=>{status.textContent=enabled?(enabled.checked?'Active':'Bypassed'):'Output stage';module.classList.toggle('device-bypassed',Boolean(enabled&&!enabled.checked))};
    header.append(status);enabled?.addEventListener('change',paint);paint();
    const index=settings.chainOrder.indexOf(key);
    if(index>=0){
      const actions=[...root.querySelectorAll('.master-chain-order li')][index].querySelectorAll('button');
      for(const [direction,original]of [...actions].entries()){
        const button=document.createElement('button');button.type='button';button.textContent=direction?'Later':'Earlier';
        button.disabled=original.disabled;button.setAttribute('aria-label',original.getAttribute('aria-label'));button.dataset.workflowMasterMove=`${key}-${direction}`;
        button.onclick=()=>original.click();header.append(button);
      }
    }
  }
  root.querySelector('.master-module-grid').remove();
  root.querySelector('.master-chain-order ol').hidden=true;
  const analysis=stage(studio,'master-analysis','Analysis & audition');
  analysis.append(root.querySelector('.master-monitor-panel'),root.querySelector('.master-meters'));
  for(const input of root.querySelectorAll('[data-master-param]')){
    if(input.dataset.masterParam.startsWith('eq.'))continue;
    const path=input.dataset.masterParam,defaults=path.split('.').reduce((value,key)=>value?.[key],DEFAULT_MASTERING_SETTINGS);
    const milliseconds=/^multiband\.bands\.\d+\.(attack|release)$/.test(path),reset=Number(defaults)*(milliseconds?1000:1);
    const name=input.closest('label').firstChild.textContent.trim();
    enhanceParameter(input,{name:`Master ${path}: ${name}`,reset,rotary:true,unit:milliseconds||path.endsWith('lookaheadMs')?'ms':path.endsWith('.release')?'s':path.startsWith('multiband.crossovers.')?'Hz':/Gain|threshold|ceiling|knee|makeup/.test(path)?'dB':'',scale:/(attack|release|crossovers)/.test(path)&&Number(input.min)>0?'log':'linear',format:path.endsWith('mix')||path.endsWith('width')?'percent':path.endsWith('ratio')?'ratio':'number'});
  }
  if(focusKey)[...root.querySelectorAll('[data-workflow-master-move]')].find(button=>button.dataset.workflowMasterMove===focusKey)?.focus();
}

export function organizeExportStudio(root){
  const studio=root.querySelector('.export-studio'),audio=studio.querySelector('.export-layout');audio.id='workflow-audio';
  audio.querySelector('h3').textContent='Audio Export';
  const release=studio.querySelector('details');release.id='workflow-release';release.querySelector('summary').textContent='Release Information & Artwork';
  const pack=studio.querySelector('.release-package-card');pack.id='workflow-package';
  const hint=document.createElement('p');hint.className='hint';hint.textContent='For an editable project with embedded samples, use Project > Save .EHS. A release ZIP contains deliverables, not an editable project.';
  pack.append(hint);
  workflowNav(studio,[['audio','Audio Export'],['release','Release Information'],['package','Release Package']]);
}
