import {describeControl} from './ui-controls.js';

export const COMPACT_TRACK_HEIGHT=84;
export const EXPANDED_TRACK_HEIGHT=240;

export function trackHeight(state,id){
  return state.trackHeights?.[id]??COMPACT_TRACK_HEIGHT;
}

export function boundedTrackHeight(value){
  if(!Number.isFinite(value))throw new RangeError('Track height must be finite.');
  return Math.round(Math.max(220,Math.min(400,value)));
}

export function boundedPanelHeight(value){
  if(!Number.isFinite(value))throw new RangeError('Device Panel height must be finite.');
  return Math.round(Math.max(160,Math.min(600,value)));
}

export function mountTrackLayout(root,project,state,moveTrack){
  state.trackHeights??={};
  for(const label of root.querySelectorAll('.track-label[data-track]')){
    const track=project.tracks[Number(label.dataset.track)],row=label.closest('.track-row');
    const expanded=trackHeight(state,track.id)>COMPACT_TRACK_HEIGHT;
    row.dataset.trackId=track.id;row.classList.toggle('track-expanded',expanded);
    row.style.setProperty('--track-height',`${trackHeight(state,track.id)}px`);
    label.style.setProperty('--track-color',track.color);
    const meta=document.createElement('div');meta.className='track-layout-controls';
    const type=document.createElement('small');type.textContent=track.drumRack?'Drums':track.sampler?'Sampler':'Audio';
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent=expanded?'Compact':'Expand';
    toggle.setAttribute('aria-label',`Expand ${track.name} track`);toggle.setAttribute('aria-expanded',String(expanded));
    const height=document.createElement('input');height.type='number';height.min='220';height.max='400';height.step='1';
    height.value=String(expanded?trackHeight(state,track.id):EXPANDED_TRACK_HEIGHT);
    height.setAttribute('aria-label',`${track.name} track height`);height.hidden=!expanded;
    const paint=value=>{
      state.trackHeights[track.id]=value;
      const open=value>COMPACT_TRACK_HEIGHT;row.classList.toggle('track-expanded',open);
      row.style.setProperty('--track-height',`${value}px`);
      toggle.textContent=open?'Compact':'Expand';toggle.setAttribute('aria-expanded',String(open));height.hidden=!open;height.value=String(value);
      // Reorient the same native range: no duplicated Mixer parameter bindings.
      const volume=row.querySelector('[data-vol]');
      if(volume){volume.parameterControl.wrapper.classList.toggle('parameter-vertical',open);volume.setAttribute('aria-orientation',open?'vertical':'horizontal')}
      root.querySelector('.arrangement').dispatchEvent(new Event('scroll'));
    };
    toggle.onclick=event=>{event.stopPropagation();paint(row.classList.contains('track-expanded')?COMPACT_TRACK_HEIGHT:EXPANDED_TRACK_HEIGHT)};
    height.onclick=event=>event.stopPropagation();
    height.onchange=()=>{
      if(height.value===''||!Number.isFinite(height.valueAsNumber)){height.setCustomValidity('Enter a track height from 220 to 400 pixels.');height.reportValidity();return}
      height.setCustomValidity('');paint(boundedTrackHeight(height.valueAsNumber));
    };
    height.oninput=()=>height.setCustomValidity('');
    meta.append(type,toggle,height);label.querySelector('.track-select').after(meta);
    const title=document.createElement('div');title.className='track-title-line';
    const select=label.querySelector('.track-select'),pattern=label.querySelector('[data-new-pattern]');
    select.before(title);title.append(select);
    if(pattern){pattern.textContent='+';pattern.setAttribute('aria-label',`New pattern on ${track.name}`);pattern.title='Create independent pattern';title.append(pattern)}
    const order=document.createElement('div');order.className='track-order-controls';
    const index=project.tracks.indexOf(track);
    for(const direction of [-1,1]){
      const button=document.createElement('button');button.type='button';button.textContent=direction<0?'Earlier':'Later';
      button.setAttribute('aria-label',`Move ${track.name} track ${direction<0?'earlier':'later'}`);
      button.disabled=index+direction<0||index+direction>=project.tracks.length;
      button.onclick=event=>{event.stopPropagation();moveTrack(track.id,direction)};order.append(button);
    }
    label.append(order);
    describeControl(toggle,'Switch between a compact Arrangement lane and detailed Mixer controls. This does not change audio.');
  }
}

export function mountDevicePanelLayout(root,state){
  const panel=root.querySelector('.bottom-panel'),head=panel.querySelector('.pane-head');
  panel.style.setProperty('--device-panel-height',`${state.devicePanelHeight??320}px`);
  const controls=document.createElement('div');controls.className='device-panel-controls';
  const density=document.createElement('button');density.type='button';density.textContent='Compact devices';
  density.setAttribute('aria-pressed',String(Boolean(state.compactDevices)));
  const paint=()=>panel.classList.toggle('devices-compact',Boolean(state.compactDevices));paint();
  density.onclick=()=>{state.compactDevices=!state.compactDevices;density.setAttribute('aria-pressed',String(state.compactDevices));paint()};
  const close=document.createElement('button');close.type='button';close.textContent='Hide devices';
  close.onclick=()=>{const toggle=root.querySelector('#toggleDevices');toggle.click();toggle.focus()};
  controls.append(density,close);head.append(controls);
  const handle=document.createElement('div');handle.className='device-panel-resize';handle.tabIndex=0;
  handle.setAttribute('role','separator');handle.setAttribute('aria-label','Device Panel height');handle.setAttribute('aria-orientation','horizontal');
  handle.setAttribute('aria-valuemin','160');handle.setAttribute('aria-valuemax','600');
  const set=value=>{state.devicePanelHeight=boundedPanelHeight(value);panel.style.setProperty('--device-panel-height',`${state.devicePanelHeight}px`);handle.setAttribute('aria-valuenow',String(state.devicePanelHeight))};
  set(state.devicePanelHeight??320);
  handle.onkeydown=event=>{
    if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    set(event.key==='Home'?160:event.key==='End'?600:state.devicePanelHeight+(event.key==='ArrowUp'?20:-20));
  };
  let drag=null;
  handle.onpointerdown=event=>{
    if(event.button!==0)return;event.preventDefault();handle.focus();handle.setPointerCapture(event.pointerId);
    drag={id:event.pointerId,y:event.clientY,height:state.devicePanelHeight};
  };
  handle.onpointermove=event=>{if(drag?.id===event.pointerId)set(drag.height+drag.y-event.clientY)};
  const finish=(event,cancel)=>{
    if(drag?.id!==event.pointerId)return;if(cancel)set(drag.height);drag=null;
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
  };
  handle.onpointerup=event=>finish(event,false);handle.onpointercancel=event=>finish(event,true);handle.onlostpointercapture=event=>finish(event,true);
  panel.prepend(handle);describeControl(handle,'Drag up/down or use Arrow keys to resize Devices. Home/End set minimum/maximum.');
}
