import {createTrackEffect} from './audio.js';
import {describeControl,enhanceParameter} from './ui-controls.js';

const units={threshold:'dB',makeup:'dB',gain:'dB',knee:'dB',attack:'s',release:'s',decay:'s',time:'ms',predelay:'ms',frequency:'Hz',lowCut:'Hz',highCut:'Hz'};
export function effectParameterOptions(effect,input){
  const key=input.dataset.param,scale=Number(input.dataset.scale||1),defaults=createTrackEffect(effect.type).params;
  const reset=Number(defaults[key]??input.value)*scale;
  return{
    name:input.closest('label').firstChild.textContent.trim(),
    unit:units[key]||'',reset,
    rotary:!['mix','width','threshold','knee'].includes(key),
    scale:['frequency','lowCut','highCut','attack','release','decay','time'].includes(key)&&Number(input.min)>0?'log':'linear',
    format:['mix','feedback'].includes(key)?'percent':key==='ratio'?'ratio':key==='pan'?'pan':'number'
  };
}

export function mountDeviceShell(article,{id,type,title,onPreset}){
  article.dataset.deviceId=id;article.dataset.deviceType=type;
  article.setAttribute('aria-label',`${title} device`);
  const header=article.querySelector('header'),body=document.createElement('div');body.className='device-body';
  body.id=`device-body-${id}`;
  for(const child of [...article.children])if(child!==header)body.append(child);
  const subtitle=document.createElement('small');subtitle.className='device-type';subtitle.textContent=type==='eq'?'Equalizer':type;
  header.querySelector('label').append(subtitle);
  const fold=document.createElement('button');fold.className='device-fold';fold.textContent='Collapse';fold.setAttribute('aria-expanded','true');fold.setAttribute('aria-controls',body.id);
  fold.onclick=()=>{body.hidden=!body.hidden;fold.textContent=body.hidden?'Expand':'Collapse';fold.setAttribute('aria-expanded',String(!body.hidden));article.classList.toggle('device-collapsed',body.hidden)};
  const preset=document.createElement('button');preset.className='device-preset';preset.textContent='Presets';preset.setAttribute('aria-label',`${title} chain presets`);preset.onclick=onPreset;
  header.append(preset,fold);article.append(body);
  describeControl(fold,`Fold ${title} without changing its audio processing.`);
  const enabled=header.querySelector('[data-effect-enabled]');enabled.setAttribute('aria-label',`Enable ${title}`);
  const status=document.createElement('span');status.className='device-status';header.querySelector('label').append(status);
  const paint=()=>{article.classList.toggle('device-bypassed',!enabled.checked);status.textContent=enabled.checked?'Active':'Bypassed'};
  enabled.addEventListener('change',paint);paint();
  for(const [selector,action]of [['[data-effect-up]','Move earlier'],['[data-effect-down]','Move later'],['[data-effect-remove]','Remove']]){
    const button=header.querySelector(selector);button.setAttribute('aria-label',`${action}: ${title}`);button.title=`${action}: ${title}`;
  }
  return body;
}

export function enhanceEffectParameters(article,effect){
  if(effect.type==='eq')return;
  for(const input of article.querySelectorAll('[data-effect-param]'))enhanceParameter(input,effectParameterOptions(effect,input));
  if(effect.type==='delay'){
    const time=article.querySelector('[data-param=time]'),sync=article.querySelector('[data-param=sync]');
    const update=()=>{time.disabled=sync.checked;time.parameterControl.sync();time.closest('label').title=sync.checked?'Time follows tempo and Beat division. Disable Tempo sync to edit milliseconds.':'Delay time in milliseconds.'};
    sync.addEventListener('change',update);update();
  }
}

export function captureDeviceUi(root){
  const scroll=root.querySelector('.device-chain-scroll'),active=document.activeElement,article=active?.closest('[data-device-id]');
  return{
    left:scroll?.scrollLeft||0,
    devices:[...root.querySelectorAll('[data-device-id]')].map(device=>({id:device.dataset.deviceId,collapsed:device.classList.contains('device-collapsed'),top:device.querySelector('.device-body').scrollTop})),
    focus:article?{id:article.dataset.deviceId,name:active.getAttribute('aria-label'),fold:active.classList.contains('device-fold')}:null
  };
}

export function restoreDeviceUi(root,state){
  if(!state)return;
  const devices=[...root.querySelectorAll('[data-device-id]')];
  for(const saved of state.devices){
    const device=devices.find(item=>item.dataset.deviceId===saved.id);if(!device)continue;
    if(saved.collapsed)device.querySelector('.device-fold').click();
    device.querySelector('.device-body').scrollTop=saved.top;
  }
  if(state.focus){
    const device=devices.find(item=>item.dataset.deviceId===state.focus.id);
    const target=device&&[...device.querySelectorAll('button,input,select')].find(input=>state.focus.fold?input.classList.contains('device-fold'):input.getAttribute('aria-label')===state.focus.name);
    if(target&&!target.disabled)target.focus({preventScroll:true});
    else root.querySelector('#addTrackEffect')?.focus({preventScroll:true});
  }
  const scroll=root.querySelector('.device-chain-scroll');if(scroll)scroll.scrollLeft=state.left;
}
