import {trackPlaybackType} from './project-state.js';

const types={audio:{name:'Audio',color:'#88a8db'},sampler:{name:'Sampler',color:'#a58bdb'},drumRack:{name:'Drum Rack',color:'#db8a70'}};

export function showTrackSetup({track=null,type='audio',number=1,assets,buffers,onSubmit}){
  document.querySelector('#trackSetup')?.remove();
  const dialog=document.createElement('dialog');
  dialog.id='trackSetup';dialog.className='track-setup';
  dialog.setAttribute('aria-labelledby','trackSetupTitle');
  dialog.innerHTML=`<form>
    <h2 id="trackSetupTitle">${track?'Edit track':'Add track'}</h2>
    <label>Name <input id="trackName" maxlength="80" required autocomplete="off"></label>
    <label>Color <input id="trackColor" type="color" required></label>
    <label>Playback type <select id="trackType"><option value="audio">Audio</option><option value="sampler">Sampler</option><option value="drumRack">Drum Rack</option></select></label>
    <p id="trackTypeHint" class="hint"></p>
    <label id="trackSampleLabel">Sample <select id="trackSample"></select></label>
    <p id="trackSetupError" role="alert"></p>
    <div class="track-setup-actions"><button type="button" id="cancelTrackSetup">Cancel</button><button type="submit" class="primary">${track?'Save changes':'Create track'}</button></div>
  </form>`;
  const $=selector=>dialog.querySelector(selector);
  const initial=types[track?trackPlaybackType(track):type];
  $('#trackType').value=track?trackPlaybackType(track):type;
  $('#trackType').disabled=Boolean(track);
  $('#trackName').value=track?.name||`${initial.name} ${number}`;
  $('#trackColor').value=/^#[0-9a-f]{6}$/i.test(track?.color)?track.color:initial.color;
  let previous=initial;
  const updateType=()=>{
    const selected=types[$('#trackType').value],value=$('#trackType').value;
    if(!track){
      if($('#trackName').value===`${previous.name} ${number}`)$('#trackName').value=`${selected.name} ${number}`;
      if($('#trackColor').value===previous.color)$('#trackColor').value=selected.color;
    }
    previous=selected;
    $('#trackSampleLabel').hidden=Boolean(track)||value==='audio';
    const sample=$('#trackSample'),last=sample.value;
    sample.replaceChildren(new Option(value==='sampler'?'Choose a loaded sample…':'Empty pads (assign samples later)',''));
    for(const asset of assets.values())if(buffers.has(asset.id))sample.add(new Option(asset.name,asset.id));
    if([...sample.options].some(option=>option.value===last))sample.value=last;
    sample.required=!track&&value==='sampler';sample.disabled=Boolean(track)||value==='audio';
    $('#trackTypeHint').textContent=track?'Playback type is fixed after creation to preserve clips, notes and instrument settings.':value==='sampler'?'Sample-based pitched instrument. Import a sample first; Bass and Synth can be used as names.':value==='drumRack'?'16 sample pads with a step sequencer. An optional sample initializes the pads.':'Audio clips placed on the Arrangement timeline.';
  };
  $('#trackType').onchange=updateType;updateType();
  $('#cancelTrackSetup').onclick=()=>dialog.close();
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close()}});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    const name=$('#trackName').value.trim();
    if(!name){$('#trackSetupError').textContent='Enter a track name.';$('#trackName').focus();return}
    try{
      onSubmit({name,color:$('#trackColor').value,type:$('#trackType').value,assetId:$('#trackSample').value||null});
      dialog.close();
    }catch(error){$('#trackSetupError').textContent=error.message}
  };
  document.body.append(dialog);dialog.showModal();$('#trackName').focus();$('#trackName').select();
}
