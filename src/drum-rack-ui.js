const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keyMap = ['1','2','3','4','5','6','7','8','9','0','q','w','e','r','t','y'];

export function renderDrumRackHTML(track, assets) {
  const rack=track.drumRack;
  const options=[...assets.values()].map(asset=>`<option value="${asset.id}">${escapeHTML(asset.name)}</option>`).join('');
  const pads=rack.pads.map((pad,index)=>`<article class="drum-pad ${pad.mute?'pad-muted':''}" data-pad="${index}">
    <button class="drum-trigger" data-trigger="${index}" aria-label="Trigger ${escapeHTML(pad.name)}">${escapeHTML(pad.name)}<small>${pad.note} · ${keyMap[index]}</small></button>
    <label>Sample <select data-pad-asset="${index}"><option value="">No sample</option>${options.replace(`value="${pad.asset}"`,`value="${pad.asset}" selected`)}</select></label>
    <label>Name <input data-pad-name="${index}" value="${escapeHTML(pad.name)}" maxlength="20"></label>
    <label>Volume <input data-pad-volume="${index}" type="range" min="0" max="1.5" step=".01" value="${pad.volume}"></label>
    <label>Pitch <input data-pad-pitch="${index}" type="range" min="-24" max="24" step="1" value="${pad.pitch}"></label>
    <label>Pan <input data-pad-pan="${index}" type="range" min="-1" max="1" step=".01" value="${pad.pan}"></label>
    <label>Mute <input data-pad-mute="${index}" type="checkbox" ${pad.mute?'checked':''}></label>
  </article>`).join('');
  const steps=rack.steps;
  return `<section class="studio drum-rack-studio">
    <div class="section-title"><button id="rackBack">← Arrangement</button><h2>${escapeHTML(track.name)} · Drum Rack</h2><p>Assign samples to 16 pads, trigger them directly, or edit the same note pattern in the Piano Roll.</p></div>
    <div class="drum-tools"><label>Steps <select id="rackSteps"><option value="16">16 steps</option><option value="32">32 steps</option><option value="64">64 steps</option></select></label><button id="rackDuplicate">Duplicate pattern</button><button id="rackClear">Clear pattern</button><button id="rackPiano">Open Piano Roll</button><span>Keyboard: 1–0, Q–Y</span></div>
    <div class="drum-pad-grid">${pads}</div>
    <h3>Step Sequencer <span class="hint">One bar; synced to project tempo</span></h3>
    <div class="step-scroll"><div class="step-grid" style="--step-count:${steps}">
      <div class="step-heading">PAD${Array.from({length:steps},(_,i)=>`<span>${i+1}</span>`).join('')}</div>
      ${rack.pads.map((pad,index)=>`<div class="step-row"><span class="step-pad-label">${escapeHTML(pad.name)}</span>${Array.from({length:steps},(_,step)=>{const beat=step*4/steps,active=(track.pattern?.notes||[]).some(note=>note.midi===pad.note&&Math.abs(note.beat-beat)<.001);return `<button class="drum-step ${active?'step-active':''}" data-step-pad="${index}" data-step="${step}" aria-label="${escapeHTML(pad.name)}, step ${step+1}"></button>`}).join('')}</div>`).join('')}
    </div></div>
  </section>`;
}

export function wireDrumRackUI(root,{track,assets,buffers,engine,tracks,save,notify,back,openPiano,refresh}) {
  const rack=track.drumRack;
  root.tabIndex=0;
  root.querySelector('#rackBack').onclick=back;
  root.querySelector('#rackPiano').onclick=openPiano;
  root.querySelector('#rackSteps').value=String(rack.steps);
  root.querySelector('#rackSteps').onchange=event=>{rack.steps=+event.target.value;save();refresh()};
  root.querySelector('#rackClear').onclick=()=>{track.pattern.notes=[];save();refresh()};
  root.querySelector('#rackDuplicate').onclick=()=>{
    const length=Math.max(4,Math.ceil(Math.max(0,...track.pattern.notes.map(note=>note.beat+(note.durationBeats||0)))/4)*4);
    if(length>=64)return notify('This Drum Rack pattern is already at the 16-bar limit.');
    const additions=track.pattern.notes.filter(note=>note.beat<length&&note.beat+length<64).map(note=>({...note,id:crypto.randomUUID(),beat:note.beat+length}));
    track.pattern.notes.push(...additions);save();refresh();
  };
  root.querySelectorAll('[data-pad-asset]').forEach(input=>input.onchange=event=>{
    const pad=rack.pads[+event.target.dataset.padAsset];
    pad.asset=event.target.value||null;
    if(pad.asset&&!buffers.has(pad.asset))notify('Sample is not loaded yet; reimport it before playback.');
    save();refresh();
  });
  root.querySelectorAll('[data-pad-name]').forEach(input=>input.onchange=event=>{rack.pads[+event.target.dataset.padName].name=event.target.value.trim()||`Pad ${+event.target.dataset.padName+1}`;save();refresh()});
  for(const [attribute,key] of [['data-pad-volume','volume'],['data-pad-pitch','pitch'],['data-pad-pan','pan']])root.querySelectorAll(`[${attribute}]`).forEach(input=>input.oninput=event=>{rack.pads[+event.target.getAttribute(attribute)][key]=+event.target.value;save()});
  root.querySelectorAll('[data-pad-mute]').forEach(input=>input.onchange=event=>{const pad=rack.pads[+event.target.dataset.padMute];pad.mute=event.target.checked;event.target.closest('.drum-pad').classList.toggle('pad-muted',pad.mute);save()});
  root.querySelectorAll('[data-trigger]').forEach(button=>button.onclick=()=>trigger(+button.dataset.trigger));
  function trigger(index) {
    const button=root.querySelector(`[data-trigger="${index}"]`);
    button.classList.add('pad-hit');setTimeout(()=>button.classList.remove('pad-hit'),120);
    engine.previewNote(track,buffers,rack.pads[index].note,.5,tracks).catch(error=>notify(`Pad preview failed: ${error.message}`));
  }
  root.querySelectorAll('.drum-step').forEach(button=>button.onclick=()=>{
    const index=+button.dataset.stepPad,step=+button.dataset.step,pad=rack.pads[index],beat=step*4/rack.steps,notes=track.pattern.notes;
    const found=notes.findIndex(note=>note.midi===pad.note&&Math.abs(note.beat-beat)<.001);
    if(found>=0)notes.splice(found,1);else notes.push({id:crypto.randomUUID(),midi:pad.note,beat,durationBeats:4/rack.steps,velocity:.85,pad:index});
    notes.sort((a,b)=>a.beat-b.beat);save();button.classList.toggle('step-active',found<0);
  });
  root.addEventListener('keydown',event=>{
    if(event.target.matches('input,select')||event.ctrlKey||event.metaKey||event.altKey)return;
    const index=keyMap.indexOf(event.key.toLowerCase());if(index>=0)trigger(index);
  });
  root.focus({preventScroll:true});
}
