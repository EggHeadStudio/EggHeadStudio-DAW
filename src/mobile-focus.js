const PREFERENCE_KEY='ehs-mobile-focus-choice-v1';
const askedWorkspaces=new Set();
let activeFocus=null;
let disposeMount=()=>{};
let mountedRoot=null,mountedWorkspace=null;

export function mobileFocusStage(){
 return activeFocus?.taskNavigation?.querySelector('button[aria-pressed=true]')?.dataset.focusStage||null;
}

export function readFocusPreference(storage,workspace){
 try{
  const preferences=JSON.parse(storage.getItem(PREFERENCE_KEY)||'{}');
  return preferences?.[workspace]==='focus'||preferences?.[workspace]==='continue'?preferences[workspace]:null;
 }catch{return null}
}

export function writeFocusPreference(storage,workspace,choice){
 if(choice!=='focus'&&choice!=='continue')throw new RangeError('Focus preference must be focus or continue.');
 let preferences={};
 try{preferences=JSON.parse(storage.getItem(PREFERENCE_KEY)||'{}')}catch{}
 if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))preferences={};
 preferences[workspace]=choice;
 storage.setItem(PREFERENCE_KEY,JSON.stringify(preferences));
}

function restoreAttribute(element,name,value){
 if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);
}

export function closeMobileFocus({restoreFocus=true}={}){
 if(!activeFocus)return false;
 const current=activeFocus;activeFocus=null;
 current.target.removeEventListener('keydown',current.onKeydown);
 for(const {element,hidden}of current.focusSections)element.hidden=hidden;
 if(current.advancedDetails)current.advancedDetails.element.open=current.advancedDetails.open;
 current.taskNavigation?.remove();
 for(const {element,marker}of current.pinnedControls){
  if(marker.isConnected)marker.after(element);
  marker.remove();
 }
 current.toolbar.remove();
 current.target.classList.remove('mobile-focus-surface');
 delete current.target.dataset.mobileFocusWorkspace;
 restoreAttribute(current.target,'role',current.role);
 restoreAttribute(current.target,'aria-modal',current.modal);
 document.body.classList.remove('mobile-focus-active');
 current.onClose?.();
 window.scrollTo({top:current.scrollTop});
 if(restoreFocus&&current.returnFocus?.isConnected)current.returnFocus.focus({preventScroll:true});
 return true;
}

function addFocusNavigation(toolbar,entries,onSelect){
 const navigation=document.createElement('nav');navigation.className='mobile-focus-workflow';navigation.setAttribute('aria-label','Focus workflow');
 for(const [key,label]of entries){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.focusStage=key;
  button.onclick=()=>{onSelect(key);for(const candidate of navigation.querySelectorAll('button'))candidate.setAttribute('aria-pressed',String(candidate===button))};
  navigation.append(button);
 }
 toolbar.append(navigation);
 return navigation;
}

function configureFocusWorkflow(target,workspace,toolbar){
 const focusSections=[],details=[];
 if(workspace==='sample'){
  const stages=[...target.querySelectorAll('[data-workflow-stage]')].filter(element=>['capture','edit','process','preview','save'].includes(element.dataset.workflowStage));
  const populated=target.querySelector('#sampleWave')?.dataset.length!=='0';
  const select=key=>{
   for(const stage of stages){
    const alwaysVisible=stage.dataset.workflowStage==='edit'||stage.dataset.workflowStage==='process'&&key==='edit';
    stage.hidden=!(alwaysVisible||stage.dataset.workflowStage===key);
   }
  };
  for(const stage of stages)focusSections.push({element:stage,hidden:stage.hidden});
  select(populated?'edit':'capture');
  const navigation=addFocusNavigation(toolbar,[['capture','Record / Import'],['edit','Waveform / Edit'],['process','Effects'],['save','Save Sample']],select);
  navigation.querySelector(`[data-focus-stage="${populated?'edit':'capture'}"]`).setAttribute('aria-pressed','true');
  if(!populated){navigation.querySelector('[data-focus-stage=process]').disabled=true;navigation.querySelector('[data-focus-stage=save]').disabled=true}
  return{navigation,focusSections};
 }
 if(workspace==='master'){
  const advanced=target.querySelector('.master-advanced');
  if(advanced){details.push({element:advanced,open:advanced.open});advanced.open=true}
  const modules=[...target.querySelectorAll('[data-master-stage]')],analysis=target.querySelector('[data-workflow-stage="master-analysis"]');
  for(const module of modules)focusSections.push({element:module,hidden:module.hidden});
  if(analysis)focusSections.push({element:analysis,hidden:analysis.hidden});
  const entries=[...modules.map(module=>[module.dataset.masterStage,module.dataset.masterStage==='eq'?'EQ':module.dataset.masterStage==='imager'?'Stereo':module.dataset.masterStage==='multiband'?'Multiband':module.dataset.masterStage==='saturation'?'Saturation':module.dataset.masterStage==='limiter'?'Limiter':module.dataset.masterStage==='output'?'Output':'Input']),['analysis','Analysis']];
  const select=key=>{
   for(const module of modules)module.hidden=module.dataset.masterStage!==key;
   if(analysis)analysis.hidden=key!=='analysis';
  };
  select('eq');
  const navigation=addFocusNavigation(toolbar,entries,select);navigation.querySelector('[data-focus-stage=eq]')?.setAttribute('aria-pressed','true');
  return{navigation,focusSections,advancedDetails:details[0]};
 }
 if(workspace==='export'){
  const audio=target.querySelector('#workflow-audio'),release=target.querySelector('#workflow-release'),packageStage=target.querySelector('#workflow-package');
  const audioCard=audio?.querySelector('.export-card'),analysisCard=audio?.querySelectorAll('.export-card')[1],controls=audioCard?.querySelector('.export-controls'),settingsHead=audioCard?.querySelector('.export-settings-head'),summary=audioCard?.querySelector('.export-summary'),actions=audioCard?.querySelector('.export-actions'),progress=audioCard?.querySelector('.export-progress'),memory=audioCard?.querySelector('.export-warning,.export-error'),license=audioCard?.querySelector('.export-license');
  const controlled=[audio,release,packageStage,analysisCard,controls,settingsHead,summary,actions,progress,memory,license].filter(Boolean);
  for(const element of controlled)focusSections.push({element,hidden:element.hidden});
  const allLabels=controls?[...controls.querySelectorAll('label')]:[];
  for(const label of allLabels)focusSections.push({element:label,hidden:label.hidden});
  const select=key=>{
   if(audio)audio.hidden=!['format','quality','render','download'].includes(key);
   if(release)release.hidden=key!=='metadata';
   if(packageStage)packageStage.hidden=true;
   if(analysisCard)analysisCard.hidden=key!=='download';
   if(controls)controls.hidden=!['format','quality'].includes(key);
   if(settingsHead)settingsHead.hidden=key!=='quality';
   for(const label of allLabels){
    const format=label.querySelector('#exportFormat'),mode=label.querySelector('#exportMode'),master=label.querySelector('#exportMastering');
    const quality=label.querySelector('#exportQuality,#exportRate,#exportChannels,#exportDither');
    label.hidden=key==='format'?!(format||master):key==='quality'?!(mode||quality):true;
   }
   if(summary)summary.hidden=key!=='quality';
   if(actions)actions.hidden=false;
   if(progress)progress.hidden=false;
   if(memory)memory.hidden=key!=='render';
   if(license)license.hidden=key!=='quality';
  };
  select('format');
  const navigation=addFocusNavigation(toolbar,[['format','1 · Format'],['quality','2 · Quality'],['metadata','3 · Metadata'],['render','4 · Render'],['download','5 · Download / Review']],select);navigation.querySelector('[data-focus-stage=format]')?.setAttribute('aria-pressed','true');
  return{navigation,focusSections};
 }
 return{focusSections};
}

export function openMobileFocus(target,{label='Workspace focus',workspace=null,returnFocus=null,onClose=null}={}){
 if(!(target instanceof HTMLElement)||!target.isConnected)return false;
 if(activeFocus?.target===target)return true;
 closeMobileFocus({restoreFocus:false});
 const role=target.getAttribute('role'),modal=target.getAttribute('aria-modal'),scrollTop=window.scrollY;
 const toolbar=document.createElement('div');
 toolbar.className='mobile-focus-toolbar';
 const pinnedControls=[];
 const persistentSelectors={
  sample:['.sample-playback'],
  recording:['.recording-controls'],
  master:['.master-play-controls'],
  export:['.export-actions','.export-progress']
 }[workspace];
 for(const selector of persistentSelectors||[]){
  const persistent=target.querySelector(selector);
  if(!persistent)continue;
  const marker=document.createComment('mobile focus transport');
  persistent.before(marker);pinnedControls.push({element:persistent,marker});
 }
 const title=document.createElement('strong');title.textContent=label;
 const done=document.createElement('button');done.type='button';done.className='mobile-focus-done';done.textContent='Done — return to editor';
 toolbar.append(title);
 const workflow=configureFocusWorkflow(target,workspace,toolbar);
 for(const {element}of pinnedControls)toolbar.append(element);
 toolbar.append(done);target.prepend(toolbar);target.classList.add('mobile-focus-surface');
 if(workspace)target.dataset.mobileFocusWorkspace=workspace;
 target.setAttribute('role','dialog');target.setAttribute('aria-modal','true');
 document.body.classList.add('mobile-focus-active');
 const onKeydown=event=>{
  if(event.key==='Escape'){event.preventDefault();closeMobileFocus();return}
  if(event.key!=='Tab')return;
  const controls=[...target.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(item=>!item.hidden&&item.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(!first){event.preventDefault();done.focus();return}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 };
 activeFocus={target,toolbar,role,modal,scrollTop,returnFocus,onClose,onKeydown,pinnedControls,taskNavigation:workflow.navigation,focusSections:workflow.focusSections,advancedDetails:workflow.advancedDetails};
 target.addEventListener('keydown',onKeydown);
 done.addEventListener('click',()=>closeMobileFocus());
 done.focus({preventScroll:true});
 return true;
}

function landscapeMobile(){
 return window.matchMedia('(max-width: 850px)').matches&&window.innerWidth>window.innerHeight;
}

export function mountMobileFocus(root,{workspace='workspace',onPerformance=null}={}){
 const restoreFocus=mountedRoot===root&&mountedWorkspace===workspace&&document.body.classList.contains('mobile-focus-active'),restoreStage=mobileFocusStage();
 if(mountedRoot===root&&mountedWorkspace===workspace&&root?.querySelector('.mobile-focus-trigger')&&(!activeFocus||activeFocus.target.isConnected))return disposeMount;
 disposeMount();
 if(activeFocus)closeMobileFocus({restoreFocus:false});
 mountedRoot=root;mountedWorkspace=workspace;
 if(!root){mountedRoot=null;mountedWorkspace=null;return()=>{}}
 const surface=root.querySelector('.workspace')||root.querySelector('.recording-studio')||root.querySelector('.studio');
 const heading=root.querySelector('.section-title')||root.querySelector('.editor-tools');
 if(!surface||!heading){mountedRoot=null;mountedWorkspace=null;return()=>{}}

 const trigger=document.createElement('button');trigger.type='button';trigger.className='mobile-focus-trigger';trigger.textContent='Focus Mode';
 trigger.setAttribute('aria-label',`Open ${workspace} Focus Mode`);
 const open=()=>openMobileFocus(surface,{label:`${workspaceLabel(workspace)} Focus`,workspace,returnFocus:trigger});
 trigger.addEventListener('click',open);heading.append(trigger);

 const dialog=document.createElement('dialog');dialog.className='mobile-orientation-prompt';
 const title=document.createElement('h2');title.id='mobileOrientationTitle';
 const message=document.createElement('p');
 const rememberLabel=document.createElement('label'),remember=document.createElement('input');
 remember.type='checkbox';rememberLabel.append(remember,document.createTextNode(' Remember my choice'));
 const actions=document.createElement('div');actions.className='mobile-orientation-actions';
 const performance=document.createElement('button');performance.type='button';
 const continueButton=document.createElement('button');continueButton.type='button';continueButton.textContent='Continue Editing';
 title.textContent=onPerformance?'Landscape performance layout available':'Landscape focus layout available';
 message.textContent=onPerformance?'Use the existing instrument with larger touch controls, or keep editing its pattern.':'Use the existing workspace in a full-screen layout, or keep editing.';
 performance.textContent=onPerformance?.label||'Open Focus Mode';
 actions.append(performance,continueButton);dialog.append(title,message,rememberLabel,actions);root.append(dialog);
 const preference=()=>readFocusPreference(localStorage,workspace);
 const rememberChoice=choice=>{
  if(!remember.checked)return;
  try{writeFocusPreference(localStorage,workspace,choice)}
  catch(error){console.warn('EggHeadStudio could not save the mobile focus preference.',error)}
 };
 const answer=choice=>{
  dialog.close();
  rememberChoice(choice);
  if(choice==='focus'){
   if(onPerformance)onPerformance.open();
   else open();
  }
 };
 performance.onclick=()=>answer('focus');
 continueButton.onclick=()=>answer('continue');
 let wasLandscape=landscapeMobile();
 const onOrientation=()=>{
  const next=landscapeMobile();
  if(next&&!wasLandscape){
   const saved=preference();
   if(saved==='focus'){onPerformance?onPerformance.open():open();askedWorkspaces.add(workspace)}
   else if(saved!=='continue'&&!askedWorkspaces.has(workspace)){
    askedWorkspaces.add(workspace);dialog.showModal();
   }
  }
  wasLandscape=next;
 };
 window.addEventListener('resize',onOrientation,{passive:true});
 screen.orientation?.addEventListener?.('change',onOrientation);
 const cleanup=()=>{
  trigger.removeEventListener('click',open);
  window.removeEventListener('resize',onOrientation);
  screen.orientation?.removeEventListener?.('change',onOrientation);
  dialog.close();dialog.remove();trigger.remove();
  if(mountedRoot===root&&mountedWorkspace===workspace){mountedRoot=null;mountedWorkspace=null;disposeMount=()=>{}}
 };
 disposeMount=cleanup;
 if(restoreFocus){
  open();
  if(restoreStage)root.querySelector(`.mobile-focus-workflow [data-focus-stage="${restoreStage}"]`)?.click();
 }
 return cleanup;
}

function workspaceLabel(workspace){
 return({
  arrange:'Arrangement',keys:'Piano',rack:'Drum Rack',sample:'Sample Studio',
  recording:'Recording Studio',master:'Mastering Studio',export:'Export Studio'
 })[workspace]||'Workspace';
}
