import {noteName} from './music.js';
import {visiblePads} from './drum-pads.js';
import {closeMobileFocus,openMobileFocus} from './mobile-focus.js';

export function drumPadBankCount(pads,bankSize=16){
 if(!Number.isInteger(bankSize)||bankSize<1)throw new RangeError('Pad bank size must be a positive integer.');
 return Math.max(1,Math.ceil(pads.length/bankSize));
}

export function drumPadBank(pads,bank,bankSize=16){
 const count=drumPadBankCount(pads,bankSize);
 if(!Number.isInteger(bank)||bank<0||bank>=count)throw new RangeError('Pad bank is outside the visible rack.');
 return pads.slice(bank*bankSize,(bank+1)*bankSize);
}

export class PerformanceInputController{
 constructor({start,onError=error=>console.error(error),onChange=()=>{}}){
  this.start=start;this.onError=onError;this.onChange=onChange;this.active=new Map();this.pending=new Set();this.sustained=[];this.sustain=false;
 }
 async down(pointerId,payload){
  this.up(pointerId,{cancelled:true});
  const state={payload,voice:null,ended:false,cancelled:false,sustained:false,visualActive:false};
  this.active.set(pointerId,state);
  this.pending.add(state);
  try{
   const voice=await this.start(payload);
   this.pending.delete(state);
   if(!voice)throw new Error('No playable sample is assigned to this performance control.');
   if(state.ended){
    if(state.sustained&&this.sustain){state.voice=voice;this.sustained.push(state);this.activate(state);return true}
    voice.release({cancelled:state.cancelled});return false;
   }
   state.voice=voice;this.activate(state);return true;
  }catch(error){
   this.pending.delete(state);
   if(this.active.get(pointerId)===state)this.active.delete(pointerId);
   this.deactivate(state);
   state.ended=true;this.onError(error);return false;
  }
 }
 up(pointerId,{cancelled=false}={}){
  const state=this.active.get(pointerId);if(!state)return false;
  this.active.delete(pointerId);state.ended=true;
  if(!state.voice){
   if(this.sustain&&!cancelled){state.sustained=true;return true}
   state.cancelled=cancelled;return true;
  }
  if(this.sustain&&!cancelled)this.sustained.push(state);
  else{state.voice.release({cancelled});this.deactivate(state)}
  return true;
 }
 activate(state){if(state.visualActive)return;state.visualActive=true;this.onChange(state.payload,1)}
 deactivate(state){if(!state.visualActive)return;state.visualActive=false;this.onChange(state.payload,-1)}
 setSustain(enabled){
  this.sustain=Boolean(enabled);
  if(this.sustain)return;
  for(const state of this.pending)if(state.sustained){
   state.sustained=false;
  }
  for(const state of this.sustained){state.voice.release({cancelled:false});this.deactivate(state)}
  this.sustained=[];
 }
 releaseAll(){
  for(const [pointerId]of this.active)this.up(pointerId,{cancelled:true});
  for(const state of this.pending)if(state.ended){
   state.sustained=false;state.cancelled=true;
   this.deactivate(state);
  }
  for(const state of this.sustained){state.voice.release({cancelled:true});this.deactivate(state)}
  this.sustained=[];this.sustain=false;
 }
}

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}

function makePianoKeys(baseMidi,octaves){
 const keys=[];let whiteIndex=0;
 for(let offset=0;offset<octaves*12;offset++){
  const midi=baseMidi+offset,pitchClass=midi%12,black=[1,3,6,8,10].includes(pitchClass);
  if(!black){
   keys.push({midi,black:false,left:whiteIndex*100/(octaves*7),width:100/(octaves*7),label:pitchClass===0?noteName(midi):''});
   whiteIndex++;
  }else{
   const precedingWhite=whiteIndex;
   keys.push({midi,black:true,left:(precedingWhite-.34)*100/(octaves*7),width:.68*100/(octaves*7),label:''});
  }
 }
 return keys;
}

export function mountPianoPerformance(root,{track,buffers,engine,tracks,notify}){
 const heading=root.querySelector('.section-title');if(!heading||!track?.sampler)return()=>{};
 if(root.querySelector('.piano-performance-mode'))return()=>{};
 const launch=document.createElement('button');launch.type='button';launch.className='performance-mode-launch';launch.textContent='Piano Performance Mode';heading.append(launch);
 const panel=document.createElement('section');panel.className='mobile-performance-mode piano-performance-mode';panel.hidden=true;panel.setAttribute('aria-label','Piano Performance Mode');
 panel.innerHTML='<div class="performance-toolbar"><button type="button" data-octave-down aria-label="Octave down">Octave −</button><output data-octave-label></output><button type="button" data-octave-up aria-label="Octave up">Octave +</button><label>Visible octaves <select data-octaves aria-label="Visible piano octaves"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label><label>Touch velocity <input data-velocity type="range" min=".1" max="1" step=".01" value=".85"></label><output data-velocity-label>85%</output><button type="button" data-sustain aria-pressed="false">Sustain Off</button></div><p class="hint">Touch velocity is the selected level; pressure sensitivity is not assumed. Hold a key to sustain a gated/looping sample. One-shot samples play to their natural end.</p><div class="performance-keyboard" role="group" aria-label="Playable sampler keys"></div>';
 root.append(panel);
 let baseMidi=clamp(Math.floor((track.sampler.rootNote??60)/12)*12,0,116),octaves=1,velocity=.85;
 const keyboard=panel.querySelector('.performance-keyboard'),octaveLabel=panel.querySelector('[data-octave-label]');
 const activeCounts=new Map(),keyByPointer=new Map();
 const controller=new PerformanceInputController({
  start:midi=>engine.startPreviewNote(track,buffers,midi,velocity,tracks),
  onError:error=>notify(`Piano performance failed: ${error.message}`),
  onChange:(midi,delta)=>{activeCounts.set(midi,Math.max(0,(activeCounts.get(midi)||0)+delta));keyboard.querySelector(`[data-midi="${midi}"]`)?.classList.toggle('performance-key-active',(activeCounts.get(midi)||0)>0)}
 });
 const draw=()=>{
  keyboard.replaceChildren();
  for(const key of makePianoKeys(baseMidi,octaves)){
   const button=document.createElement('button');button.type='button';button.className=`performance-key ${key.black?'black':'white'}`;button.dataset.midi=String(key.midi);button.style.left=`${key.left}%`;button.style.width=`${key.width}%`;button.setAttribute('aria-label',`Play ${noteName(key.midi)}`);button.textContent=key.label;keyboard.append(button);
  }
  octaveLabel.textContent=`${noteName(baseMidi)}–${noteName(baseMidi+octaves*12-1)}`;
  panel.querySelector('[data-octave-down]').disabled=baseMidi<12;
  panel.querySelector('[data-octave-up]').disabled=baseMidi+octaves*12>128;
 };
 const sustain=panel.querySelector('[data-sustain]');
 sustain.onclick=()=>{const enabled=sustain.getAttribute('aria-pressed')!=='true';sustain.setAttribute('aria-pressed',String(enabled));sustain.textContent=`Sustain ${enabled?'On':'Off'}`;controller.setSustain(enabled)};
 const releaseHeld=()=>{
  controller.releaseAll();sustain.setAttribute('aria-pressed','false');sustain.textContent='Sustain Off';
 };
 panel.querySelector('[data-octaves]').onchange=event=>{releaseHeld();octaves=Number(event.target.value);baseMidi=clamp(baseMidi,0,128-octaves*12);draw()};
 panel.querySelector('[data-octave-down]').onclick=()=>{releaseHeld();baseMidi=clamp(baseMidi-12,0,128-octaves*12);draw()};
 panel.querySelector('[data-octave-up]').onclick=()=>{releaseHeld();baseMidi=clamp(baseMidi+12,0,128-octaves*12);draw()};
 panel.querySelector('[data-velocity]').oninput=event=>{velocity=Number(event.target.value);panel.querySelector('[data-velocity-label]').textContent=`${Math.round(velocity*100)}%`};
 panel.addEventListener('pointerdown',event=>{
  const key=event.target.closest('[data-midi]');if(!key||event.button!==0)return;
  event.preventDefault();key.setPointerCapture?.(event.pointerId);keyByPointer.set(event.pointerId,key);controller.down(event.pointerId,Number(key.dataset.midi));
 });
 const releasePointer=event=>{
  if(!keyByPointer.has(event.pointerId))return;
  keyByPointer.delete(event.pointerId);
  controller.up(event.pointerId,{cancelled:event.type!=='pointerup'});
 };
 for(const type of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(type,releasePointer);
 panel.addEventListener('click',event=>{if(event.target.closest('[data-midi]'))event.preventDefault()});
 draw();
 const open=()=>{
  if(!track.sampler.asset||!buffers.has(track.sampler.asset)){notify('Assign and load a sample before playing the Sampler.');return}
  panel.hidden=false;
  void engine.init().catch(error=>notify(`Audio could not start: ${error.message}`));
  openMobileFocus(panel,{label:'Piano Performance',returnFocus:launch,onClose:()=>{controller.releaseAll();panel.hidden=true}});
 };
 launch.onclick=open;
 return()=>{launch.remove();panel.remove();controller.releaseAll()};
}

export function mountDrumPerformance(root,{track,buffers,engine,tracks,notify,onSelectPad}){
 const heading=root.querySelector('.section-title');if(!heading||!track?.drumRack)return()=>{};
 if(root.querySelector('.drum-performance-mode'))return()=>{};
 const launch=document.createElement('button');launch.type='button';launch.className='performance-mode-launch';launch.textContent='Drum Pad Performance Mode';heading.append(launch);
 const panel=document.createElement('section');panel.className='mobile-performance-mode drum-performance-mode';panel.hidden=true;panel.setAttribute('aria-label','Drum Pad Performance Mode');
 panel.innerHTML='<div class="performance-toolbar"><button type="button" data-bank-previous>Previous Bank</button><output data-bank-label></output><button type="button" data-bank-next>Next Bank</button><button type="button" data-edit-pad disabled>Edit selected pad settings</button></div><div class="performance-pad-grid" role="group" aria-label="Drum Rack performance pads"></div>';
 root.append(panel);
 const pads=visiblePads(track),bankSize=16,bankCount=drumPadBankCount(pads,bankSize),grid=panel.querySelector('.performance-pad-grid'),bankLabel=panel.querySelector('[data-bank-label]');
 let bank=0,selectedPadId=null;
 const controller=new PerformanceInputController({
  start:padId=>engine.startPreviewPad(track,buffers,padId,tracks),
  onError:error=>notify(`Drum pad could not play: ${error.message}`),
  onChange:(padId,delta)=>{
   const pad=grid.querySelector(`[data-pad-id="${CSS.escape(padId)}"]`);
   if(delta>0&&pad){pad.classList.add('performance-pad-active');pad.dataset.activeCount=String(Number(pad.dataset.activeCount||0)+1)}
   if(delta<0&&pad){const count=Math.max(0,Number(pad.dataset.activeCount||0)-1);pad.dataset.activeCount=String(count);pad.classList.toggle('performance-pad-active',count>0)}
  }
 });
 const draw=()=>{
  grid.replaceChildren();
  const page=drumPadBank(pads,bank,bankSize);
  bankLabel.textContent=`Bank ${bank+1} of ${bankCount} · Pads ${bank*bankSize+1}–${bank*bankSize+page.length}`;
  panel.querySelector('[data-bank-previous]').disabled=bank===0;
  panel.querySelector('[data-bank-next]').disabled=bank>=bankCount-1;
  panel.querySelector('[data-edit-pad]').disabled=!selectedPadId||!pads.some(pad=>pad.id===selectedPadId);
  page.forEach(pad=>{
   const button=document.createElement('button');button.type='button';button.className='performance-pad';button.dataset.padId=pad.id;
   button.disabled=!pad.asset||pad.mute||!buffers.has(pad.asset);
   button.innerHTML=`<strong></strong><span></span>`;
   button.querySelector('strong').textContent=pad.name;
   button.querySelector('span').textContent=pad.mute?'Muted':pad.asset?`Note ${pad.note}`:'Empty · assign sample';
   button.setAttribute('aria-label',`${pad.name}, ${pad.mute?'muted':pad.asset?'ready':'empty'}`);
   grid.append(button);
  });
 };
 panel.querySelector('[data-bank-previous]').onclick=()=>{controller.releaseAll();bank=Math.max(0,bank-1);draw()};
 panel.querySelector('[data-bank-next]').onclick=()=>{controller.releaseAll();bank=Math.min(bankCount-1,bank+1);draw()};
 panel.querySelector('[data-edit-pad]').onclick=()=>{
  if(!selectedPadId)return;
  const id=selectedPadId;
  closeMobileFocus();
  onSelectPad(id);
 };
 panel.addEventListener('pointerdown',event=>{
  const button=event.target.closest('[data-pad-id]');if(!button||button.disabled||event.button!==0)return;
  event.preventDefault();button.setPointerCapture?.(event.pointerId);selectedPadId=button.dataset.padId;panel.querySelector('[data-edit-pad]').disabled=false;
  controller.down(event.pointerId,selectedPadId).then(started=>{
   if(!started||!button.isConnected)return;
   button.classList.add('performance-pad-triggered');
   setTimeout(()=>button.classList.remove('performance-pad-triggered'),130);
  });
 });
 const releasePointer=event=>controller.up(event.pointerId,{cancelled:event.type!=='pointerup'});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(type,releasePointer);
 panel.addEventListener('click',event=>{if(event.target.closest('[data-pad-id]'))event.preventDefault()});
 const open=()=>{
  panel.hidden=false;void engine.init().catch(error=>notify(`Audio could not start: ${error.message}`));
  openMobileFocus(panel,{label:'Drum Pad Performance',returnFocus:launch,onClose:()=>{controller.releaseAll();panel.hidden=true}});
 };
 launch.onclick=open;draw();
 return()=>{launch.remove();panel.remove();controller.releaseAll()};
}
