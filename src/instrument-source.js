import {detectPitch} from './music.js';

export function assignSamplerSource(sampler,assetId,buffer){
  if(assetId&&!buffer)throw new Error('That sample is not loaded. Import it before assignment.');
  Object.assign(sampler,{asset:assetId||null,start:0,end:buffer?.duration||0,detected:null,confidence:null});
  const pitch=buffer&&detectPitch(buffer);
  if(pitch)Object.assign(sampler,{rootNote:pitch.midi,detected:pitch.name,confidence:pitch.confidence});
}

export function assignPadSource(pad,asset){
  pad.asset=asset?.id||null;
  if(asset)pad.name=asset.name.replace(/\.[^.]+$/,'').slice(0,40)||'Sample';
}

export function resetPad(pad){
  Object.assign(pad,{volume:1,pitch:0,pan:0,mute:false});
}

export function showSamplePicker({assets,buffers,preview,onSelect,notify}){
  document.querySelector('#instrumentSamplePicker')?.close();
  const dialog=document.createElement('dialog');
  dialog.id='instrumentSamplePicker';dialog.className='sample-picker';
  dialog.innerHTML='<h2>Choose Sample</h2><label>Search samples <input type="search" autofocus></label><div class="sample-picker-list"></div><button data-close>Cancel</button>';
  const list=dialog.querySelector('.sample-picker-list');
  const render=()=>{
    list.replaceChildren();
    const filter=dialog.querySelector('input').value.toLowerCase();
    for(const asset of assets.values()){
      if(!asset.name.toLowerCase().includes(filter))continue;
      const row=document.createElement('div'),name=document.createElement('span'),play=document.createElement('button'),choose=document.createElement('button');
      name.textContent=asset.name;play.textContent='Preview';choose.textContent='Select';
      play.disabled=choose.disabled=!buffers.has(asset.id);
      play.onclick=()=>Promise.resolve(preview(asset.id)).catch(error=>notify(error.message));
      choose.onclick=()=>{try{onSelect(asset.id);dialog.close()}catch(error){notify(error.message)}};
      row.append(name,play,choose);list.append(row);
    }
    if(!list.children.length)list.textContent='No matching samples. Import files from the Sample Browser first.';
  };
  dialog.querySelector('input').oninput=render;render();
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();
}

export function bindSampleDrop(element,assign,notify){
  element.ondragover=event=>{event.preventDefault();event.dataTransfer.dropEffect='copy'};
  element.ondrop=event=>{
    event.preventDefault();event.stopPropagation();
    const id=event.dataTransfer.getData('text/sample');
    if(!id)return notify('Drag a sample from the Sample Browser.');
    try{assign(id)}catch(error){notify(error.message)}
  };
}
