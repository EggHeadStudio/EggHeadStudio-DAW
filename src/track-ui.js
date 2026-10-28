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
    <label>Playback type <select id="trackType"><option value="audio">Audio Track</option><option value="sampler">Sampler Instrument</option><option value="drumRack">Drum Rack</option></select></label>
    <p id="trackTypeHint" class="hint"></p>
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
    $('#trackTypeHint').textContent=track?'Playback type is fixed after creation to preserve clips, notes and instrument settings.':value==='sampler'?'An empty sample instrument. Choose its source inside the instrument editor, then add a pattern.':value==='drumRack'?'One empty pad; add up to 32 pads. Assign samples inside the Drum Rack, then add a pattern.':'Audio clips placed on the Arrangement timeline.';
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
      onSubmit({name,color:$('#trackColor').value,type:$('#trackType').value,assetId:null});
      dialog.close();
    }catch(error){$('#trackSetupError').textContent=error.message}
  };
  document.body.append(dialog);dialog.showModal();$('#trackName').focus();$('#trackName').select();
}
