const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyMap = ['1','2','3','4','5','6','7','8','9','0','q','w','e','r','t','y'];
const histories=new Map();
const selectedPads=new Map();

export function renderDrumRackHTML(track, assets) {
  const rack=track.drumRack;
  const selected=selectedPads.get(track.id)||0,pad=rack.pads[selected];
  const pads=rack.pads.map((pad,index)=>`<article class="drum-pad ${pad.mute?'pad-muted':''}" data-pad="${index}">
    <button class="drum-trigger ${index===selected?'pad-selected':''}" data-trigger="${index}" aria-pressed="${index===selected}" aria-label="Select and preview ${escapeHTML(pad.name)}">${escapeHTML(pad.name)}<small>${pad.asset?escapeHTML(assets.get(pad.asset)?.name||'Missing sample'):'Empty'} · ${keyMap[index]}</small></button>
    <button data-choose-pad="${index}">${pad.asset?'Replace Sample':'+ Add Sample'}</button>
  </article>`).join('');
  const details=`<section class="selected-pad-editor"><h3>Selected Pad ${selected+1}</h3><strong>${escapeHTML(assets.get(pad.asset)?.name||'No sample assigned')}</strong><button data-choose-pad="${selected}">${pad.asset?'Replace Sample':'+ Add Sample'}</button><button id="removePadSample" ${pad.asset?'':'disabled'}>Remove Sample</button><button id="previewPad" ${pad.asset?'':'disabled'}>Preview</button><button id="resetPad">Reset Pad Settings</button><label>Name <input data-pad-name="${selected}" value="${escapeHTML(pad.name)}" maxlength="40"></label><label>Volume <input data-pad-volume="${selected}" type="range" min="0" max="1.5" step=".01" value="${pad.volume}"></label><label>Pitch <input data-pad-pitch="${selected}" type="range" min="-24" max="24" step="1" value="${pad.pitch}"></label><label>Pan <input data-pad-pan="${selected}" type="range" min="-1" max="1" step=".01" value="${pad.pan}"></label><label>Mute <input data-pad-mute="${selected}" type="checkbox" ${pad.mute?'checked':''}></label><p class="hint">Pad settings are independent. Track effects below process the combined rack once; there is no separate pad effect chain.</p></section>`;
  const steps=track.pattern?.steps||rack.steps,length=track.pattern?.lengthBeats||4;
  return `<section class="studio drum-rack-studio">
    <div class="section-title"><button id="rackBack">← Arrangement</button><h2>${escapeHTML(track.name)} · Drum Rack</h2><p>Assign samples to 16 pads, trigger them directly, or edit the same note pattern in the Piano Roll.</p></div>
    <div class="drum-tools"><label>Steps <select id="rackSteps"><option value="16">16 steps</option><option value="32">32 steps</option><option value="64">64 steps</option></select></label><label>Step velocity <input id="rackVelocity" type="number" min=".01" max="1" step=".01" value=".85"></label><button id="rackApplyVelocity">Apply velocity to active steps</button><button id="rackUndo">Undo</button><button id="rackRedo">Redo</button><button id="rackDuplicate">Duplicate pattern</button><button id="rackClear">Clear pattern</button><button id="rackPiano">Open Piano Roll</button><span>Keyboard: 1–0, Q–Y</span></div>
    <div class="drum-pad-grid">${pads}</div>${details}
    <h3>Step Sequencer <span class="hint">${length} beats; synced to project tempo</span></h3>
    <div class="step-scroll"><div class="step-grid" style="--step-count:${steps}">
      <div class="step-heading">PAD${Array.from({length:steps},(_,i)=>`<span>${i+1}</span>`).join('')}</div>
      ${rack.pads.map((pad,index)=>`<div class="step-row"><span class="step-pad-label">${escapeHTML(pad.name)}</span>${Array.from({length:steps},(_,step)=>{const beat=step*length/steps,active=(track.pattern?.notes||[]).some(note=>note.midi===pad.note&&Math.abs(note.beat-beat)<.001);return `<button class="drum-step ${active?'step-active':''}" data-step-pad="${index}" data-step="${step}" aria-label="${escapeHTML(pad.name)}, step ${step+1}"></button>`}).join('')}</div>`).join('')}
    </div></div>
  </section>`;
}

export function wireDrumRackUI(root,{track,assets,buffers,engine,tracks,save,notify,preview,back,openPiano,refresh}) {
  const rack=track.drumRack;
  const key=track.pattern.id||track.id;
  let history=histories.get(key);if(!history){history={undo:[],redo:[]};histories.set(key,history)}
  const checkpoint=()=>{history.undo.push(structuredClone(track.pattern));if(history.undo.length>100)history.undo.shift();history.redo=[]};
  const restore=(from,to)=>{if(!from.length)return;to.push(structuredClone(track.pattern));const snapshot=from.pop();Object.assign(track.pattern,snapshot);save();refresh()};
  root.tabIndex=0;
  root.querySelector('#rackBack').onclick=back;
  root.querySelector('#rackPiano').onclick=openPiano;
  root.querySelector('#rackSteps').value=String(track.pattern.steps||rack.steps);
  root.querySelector('#rackSteps').onchange=event=>{checkpoint();track.pattern.steps=+event.target.value;save();refresh()};
  root.querySelector('#rackClear').onclick=()=>{checkpoint();track.pattern.notes=[];save();refresh()};
  root.querySelector('#rackUndo').onclick=()=>restore(history.undo,history.redo);
  root.querySelector('#rackRedo').onclick=()=>restore(history.redo,history.undo);
  root.querySelector('#rackApplyVelocity').onclick=()=>{const value=Number(root.querySelector('#rackVelocity').value);if(!Number.isFinite(value)||value<.01||value>1)return notify('Step velocity must be between 0.01 and 1.');checkpoint();for(const note of track.pattern.notes)note.velocity=value;save();refresh()};
  root.querySelector('#rackDuplicate').onclick=()=>{
    const length=track.pattern.lengthBeats||Math.max(4,Math.ceil(Math.max(0,...track.pattern.notes.map(note=>note.beat+(note.durationBeats||0)))/4)*4);
    if(length>=64)return notify('This Drum Rack pattern is already at the 16-bar limit.');
    const additions=track.pattern.notes.filter(note=>note.beat<length&&note.beat+length<64).map(note=>({...note,id:crypto.randomUUID(),beat:note.beat+length}));
    checkpoint();track.pattern.notes.push(...additions);if(track.pattern.lengthBeats)track.pattern.lengthBeats=Math.min(64,length*2);save();refresh();
  };
  const selected=selectedPads.get(track.id)||0;
  const assign=(index,id)=>{
    if(id&&(!assets.has(id)||!buffers.has(id)))throw new Error('Import and load that sample before assignment.');
    assignPadSource(rack.pads[index],assets.get(id));selectedPads.set(track.id,index);save();refresh();
  };
  root.querySelectorAll('[data-choose-pad]').forEach(button=>button.onclick=()=>showSamplePicker({assets,buffers,preview,notify,onSelect:id=>assign(Number(button.dataset.choosePad),id)}));
  root.querySelectorAll('[data-pad]').forEach(element=>bindSampleDrop(element,id=>assign(Number(element.dataset.pad),id),notify));
  root.querySelector('#removePadSample').onclick=()=>assign(selected,null);
  root.querySelector('#resetPad').onclick=()=>{resetPad(rack.pads[selected]);save();refresh()};
  root.querySelector('#previewPad').onclick=()=>trigger(selected);
  root.querySelectorAll('[data-pad-name]').forEach(input=>input.onchange=event=>{rack.pads[+event.target.dataset.padName].name=event.target.value.trim()||`Pad ${+event.target.dataset.padName+1}`;save();refresh()});
  for(const [attribute,key] of [['data-pad-volume','volume'],['data-pad-pitch','pitch'],['data-pad-pan','pan']])root.querySelectorAll(`[${attribute}]`).forEach(input=>input.oninput=event=>{rack.pads[+event.target.getAttribute(attribute)][key]=+event.target.value;save()});
  root.querySelectorAll('[data-pad-mute]').forEach(input=>input.onchange=event=>{const pad=rack.pads[+event.target.dataset.padMute];pad.mute=event.target.checked;save();refresh()});
  root.querySelectorAll('[data-trigger]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.trigger);trigger(index);selectedPads.set(track.id,index);refresh()});
  function trigger(index) {
    const button=root.querySelector(`[data-trigger="${index}"]`);
    button.classList.add('pad-hit');setTimeout(()=>button.classList.remove('pad-hit'),120);
    if(!rack.pads[index].asset)return notify('This pad is empty. Choose + Add Sample.');
    engine.previewNote(track,buffers,rack.pads[index].note,.5,tracks).catch(error=>notify(`Pad preview failed: ${error.message}`));
  }
  root.querySelectorAll('.drum-step').forEach(button=>button.onclick=()=>{
    const index=+button.dataset.stepPad,step=+button.dataset.step,pad=rack.pads[index],steps=track.pattern.steps||rack.steps,length=track.pattern.lengthBeats||4,beat=step*length/steps,notes=track.pattern.notes;
    const found=notes.findIndex(note=>note.midi===pad.note&&Math.abs(note.beat-beat)<.001);
    const velocity=Number(root.querySelector('#rackVelocity').value);if(!Number.isFinite(velocity)||velocity<.01||velocity>1)return notify('Step velocity must be between 0.01 and 1.');
    checkpoint();if(found>=0)notes.splice(found,1);else notes.push({id:crypto.randomUUID(),midi:pad.note,beat,durationBeats:length/steps,velocity,pad:index});
    notes.sort((a,b)=>a.beat-b.beat);save();button.classList.toggle('step-active',found<0);
  });
  root.addEventListener('keydown',event=>{
    if(event.target.matches('input,select')||event.ctrlKey||event.metaKey||event.altKey)return;
    const index=keyMap.indexOf(event.key.toLowerCase());if(index>=0)trigger(index);
  });
  root.focus({preventScroll:true});
}
import {assignPadSource,bindSampleDrop,resetPad,showSamplePicker} from './instrument-source.js';
