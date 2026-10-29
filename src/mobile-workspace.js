export const MOBILE_WORKSPACES=[
  ['arrange','Arrangement'],['keys','Sampler / Piano Roll'],['rack','Drum Rack'],
  ['sample','Sample Studio'],['recording','Recording Studio'],['master','Mastering'],['export','Export Studio']
];

export class WorkspaceNavigation {
  constructor(current='arrange'){this.current=current;this.history=[]}
  visit(next,busy=false){
    if(busy||!MOBILE_WORKSPACES.some(([key])=>key===next)||next===this.current)return false;
    this.history.push(this.current);if(this.history.length>32)this.history.shift();this.current=next;return true;
  }
  back(busy=false){
    if(busy||!this.history.length)return null;
    this.current=this.history.pop();return this.current;
  }
  sync(next){
    if(next!==this.current)this.visit(next);
  }
}

let disposeShell=()=>{},expanded=null;
export function closeExpandedEditor({focus=true}={}){
  if(!expanded)return false;
  const {element,button,scroll,role,modal,hidden,onAction,onChange}=expanded;
  button.setAttribute('aria-expanded','false');
  if(role===null)element.removeAttribute('role');else element.setAttribute('role',role);
  if(modal===null)element.removeAttribute('aria-modal');else element.setAttribute('aria-modal',modal);
  element.classList.remove('mobile-expanded-editor');element.querySelector('.mobile-editor-exit')?.remove();
  element.hidden=hidden;element.removeEventListener('click',onAction,true);
  document.body.classList.remove('mobile-editor-open');expanded=null;
  if(focus&&button.isConnected)button.focus({preventScroll:true});
  window.scrollTo({top:scroll});onChange();return true;
}

export function mountMobileShell(root,{navigate,back,blocked,onBlocked}){
  disposeShell();closeExpandedEditor({focus:false});
  const media=matchMedia('(max-width:850px)'),transport=root.querySelector('.transport');
  const tempo=document.createElement('details');tempo.className='mobile-tempo';
  const summary=document.createElement('summary');summary.textContent='Tempo';tempo.append(summary);
  const options=document.createElement('div');options.className='mobile-tempo-options';
  const homes=[];
  for(const selector of ['#toStart','#clock','#bpm','#loop']){
    const input=root.querySelector(selector),element=input.closest('label')||input,marker=document.createComment('transport control');
    element.before(marker);homes.push({element,marker});options.append(element);
  }
  tempo.append(options);transport.append(tempo);
  const nav=document.createElement('nav');nav.className='mobile-navigation';nav.setAttribute('aria-label','Mobile production navigation');
  nav.innerHTML='<button type="button" data-mobile-back>Back</button><button type="button" data-mobile-arrange>Arrange</button><button type="button" data-mobile-switch aria-haspopup="dialog">Workspaces</button>';
  root.append(nav);
  const dialog=document.createElement('dialog');dialog.className='mobile-workspace-picker';dialog.setAttribute('aria-label','Choose workspace');
  const heading=document.createElement('h2');heading.textContent='Workspaces';dialog.append(heading);
  for(const [key,name]of MOBILE_WORKSPACES){
    const button=document.createElement('button');button.type='button';button.dataset.mobileWorkspace=key;button.textContent=name;
    button.onclick=()=>{if(blocked()){onBlocked();return}dialog.close();navigate(key)};dialog.append(button);
  }
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Close';cancel.onclick=()=>dialog.close();dialog.append(cancel);root.append(dialog);
  nav.querySelector('[data-mobile-switch]').onclick=()=>{if(blocked()){onBlocked();return}dialog.showModal()};
  nav.querySelector('[data-mobile-arrange]').onclick=()=>navigate('arrange');
  nav.querySelector('[data-mobile-back]').onclick=()=>{if(blocked()){onBlocked();return}if(!closeExpandedEditor())back()};
  const resize=()=>{
    for(const {element,marker}of homes)if(media.matches)options.append(element);else marker.after(element);
    tempo.open=!media.matches;
    if(!media.matches){dialog.close();closeExpandedEditor({focus:false})}
  };
  resize();media.addEventListener('change',resize);
  const escape=event=>{
    if(event.key==='Escape'&&expanded){event.preventDefault();closeExpandedEditor()}
    if(event.key==='Tab'&&expanded){
      const focusable=[...expanded.element.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(element=>!element.disabled&&element.getClientRects().length);
      const index=focusable.indexOf(document.activeElement);
      if(index<0||!event.shiftKey&&index===focusable.length-1||event.shiftKey&&index===0){
        event.preventDefault();focusable[event.shiftKey?focusable.length-1:0]?.focus();
      }
    }
  };
  document.addEventListener('keydown',escape);
  disposeShell=()=>{media.removeEventListener('change',resize);document.removeEventListener('keydown',escape);nav.remove();dialog.remove();tempo.remove()};
}

export function syncMobileShell(root,view,{canBack=false,busy=false}={}){
  const nav=root.querySelector('.mobile-navigation');if(!nav)return;
  nav.querySelector('[data-mobile-back]').disabled=busy||!canBack&&!expanded;
  nav.querySelector('[data-mobile-arrange]').disabled=busy||view==='arrange';
  const chooser=nav.querySelector('[data-mobile-switch]');
  chooser.disabled=busy;chooser.textContent=MOBILE_WORKSPACES.find(([key])=>key===view)?.[1]||'Workspaces';
  for(const button of root.querySelectorAll('[data-mobile-workspace]')){
    if(button.dataset.mobileWorkspace===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
}

export function mountExpandedEditors(root,{blocked,onBlocked,onChange=()=>{}}){
  const restore=expanded&&!expanded.element.isConnected?expanded.key:null;
  if(expanded&&!expanded.element.isConnected)closeExpandedEditor({focus:false});
  const entries=[
    ['.piano-editor','Piano Roll'],['.step-scroll','Step Sequencer'],
    ['.selected-pad-editor','Pad inspector'],['.workflow-stage','Sample stage'],
    ['.graphical-eq','EQ'],['.bottom-panel','Devices'],['.right-mixer.track-selected','Track Mixer']
  ];
  for(const [selector,name]of entries)for(const [index,element]of [...root.querySelectorAll(selector)].entries()){
    const mixer=selector==='.right-mixer.track-selected';
    const key=`${selector}:${element.closest('[data-device-id]')?.dataset.deviceId||element.dataset.mobileEditorId||index}`;
    if(element.closest('[hidden]')&&!mixer)continue;
    if(element.dataset.mobileExpandable)continue;
    element.dataset.mobileExpandable='true';
    const button=document.createElement('button');button.type='button';button.className='mobile-expand';button.textContent=`Expand ${element.querySelector('h3')?.textContent||name}`;
    button.setAttribute('aria-expanded','false');
    if(mixer){button.textContent='Selected track Mixer';root.querySelector('.editor-tools').append(button)}else element.before(button);
    button.onclick=()=>{
      if(blocked()){onBlocked();return}
      closeExpandedEditor({focus:false});
      const scroll=window.scrollY,hidden=element.hidden,exit=document.createElement('button');exit.type='button';exit.className='mobile-editor-exit';exit.textContent='Done - return to workspace';
      exit.onclick=()=>{button.setAttribute('aria-expanded','false');closeExpandedEditor();onChange()};
      element.prepend(exit);element.classList.add('mobile-expanded-editor');document.body.classList.add('mobile-editor-open');
      const onAction=event=>{if(event.target.closest('[data-fx],[data-track-settings]'))closeExpandedEditor({focus:false})};
      element.addEventListener('click',onAction,true);element.hidden=false;
      expanded={element,button,scroll,hidden,onAction,key,role:element.getAttribute('role'),modal:element.getAttribute('aria-modal'),onChange};
      element.setAttribute('role','dialog');element.setAttribute('aria-modal','true');
      button.setAttribute('aria-expanded','true');exit.focus({preventScroll:true});onChange();
    };
    if(restore===key)button.click();
  }
}
