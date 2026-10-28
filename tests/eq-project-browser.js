import {AudioEngine} from '../src/audio.js';
import {getProjectAssetIds} from '../src/portable-project.js';

export async function inspectEqProjectAudio(){
  const project=JSON.parse(localStorage.getItem('pulse-project')),context=new OfflineAudioContext(2,1,48000),buffers=new Map();
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pulse-studio-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  try{
    for(const id of getProjectAssetIds(project)){
      const file=await new Promise((resolve,reject)=>{const request=db.transaction('assets').objectStore('assets').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      if(!file)throw new Error(`Missing EQ fixture asset ${id}`);
      buffers.set(id,await context.decodeAudioData(await file.arrayBuffer()));
    }
  }finally{db.close()}
  const engine=new AudioEngine(),rendered=await engine.render(project,buffers),hashes=[];
  let square=0,peak=0;
  for(let channel=0;channel<rendered.numberOfChannels;channel++){
    const data=rendered.getChannelData(channel),hash=await crypto.subtle.digest('SHA-256',data);
    hashes.push(Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join(''));
    for(const value of data){square+=value*value;peak=Math.max(peak,Math.abs(value))}
  }
  return{hashes,frames:rendered.length,sampleRate:rendered.sampleRate,rms:Math.sqrt(square/(rendered.length*rendered.numberOfChannels)),peak,assets:buffers.size};
}

export async function inspectDownloadedEqAudio(bytes){
  const context=new OfflineAudioContext(2,1,48000),buffer=await context.decodeAudioData(new Uint8Array(bytes).buffer);
  let square=0,peak=0;
  for(let channel=0;channel<buffer.numberOfChannels;channel++)for(const value of buffer.getChannelData(channel)){square+=value*value;peak=Math.max(peak,Math.abs(value))}
  const rms=Math.sqrt(square/(buffer.length*buffer.numberOfChannels));
  if(!(rms>.0001&&peak<1))throw new Error(`Invalid downloaded audio: RMS ${rms}, peak ${peak}`);
  return{frames:buffer.length,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,rms,peak};
}

// Host-side fixture: an empty origin is used because integrated browser views
// cannot create independent Playwright contexts.
export async function runEqPortableUiAcceptance(page,{cleanOrigin}){
  const check=(condition,message)=>{if(!condition)throw new Error(message)};
  const captureDownload=async(target,action)=>{
    await target.evaluate(()=>{
      globalThis.ehsEqDownload=null;globalThis.ehsEqDownloadError=null;globalThis.ehsEqAnchorClick=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){
        if(this.download){const name=this.download;fetch(this.href).then(response=>response.arrayBuffer()).then(buffer=>globalThis.ehsEqDownload={name,bytes:Array.from(new Uint8Array(buffer))}).catch(error=>globalThis.ehsEqDownloadError=error.message);return}
        globalThis.ehsEqAnchorClick.call(this);
      };
    });
    try{
      await action();await target.waitForFunction(()=>globalThis.ehsEqDownload||globalThis.ehsEqDownloadError,null,{timeout:60000});
      return await target.evaluate(()=>{if(globalThis.ehsEqDownloadError)throw new Error(globalThis.ehsEqDownloadError);return globalThis.ehsEqDownload});
    }finally{await target.evaluate(()=>{HTMLAnchorElement.prototype.click=globalThis.ehsEqAnchorClick;delete globalThis.ehsEqAnchorClick;delete globalThis.ehsEqDownload;delete globalThis.ehsEqDownloadError})}
  };
  const before=await page.evaluate(async()=>await(await import('./tests/eq-project-browser.js')).inspectEqProjectAudio());
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
  if(await page.locator('.project-menu').getAttribute('open')===null)await page.locator('.project-menu>summary').click();
  const archive=await captureDownload(page,()=>page.locator('#saveEhs').click());
  const originalOrigin=page.url();
  const outputs=[];
  try{
    const restoredPage=page;await restoredPage.goto(cleanOrigin);await restoredPage.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
    const initial=await restoredPage.evaluate(async()=>{
      const autosave=localStorage.getItem('pulse-project'),db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      try{return{autosave,assets:await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').count();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}}finally{db.close()}
    });
    check(initial.autosave===null&&initial.assets===0,'Restoration context was not clean.');
    await restoredPage.evaluate(({name,bytes})=>{
      const input=document.querySelector('#importEhs'),transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)],name,{type:'application/zip'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    },archive);
    await restoredPage.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Portable project opened'),null,{timeout:30000});
    const restored=await restoredPage.evaluate(()=>JSON.parse(localStorage.getItem('pulse-project')));
    check(JSON.stringify(restored.tracks)===JSON.stringify(snapshot.tracks)&&JSON.stringify(restored.mastering)===JSON.stringify(snapshot.mastering),'Clean context changed EQ settings.');
    const after=await restoredPage.evaluate(async()=>await(await import('./tests/eq-project-browser.js')).inspectEqProjectAudio());
    check(JSON.stringify(before.hashes)===JSON.stringify(after.hashes),'Restored EQ audio differs.');
    await restoredPage.locator('#play').click();await restoredPage.locator('.eq-plot').scrollIntoViewIfNeeded();
    await restoredPage.waitForFunction(()=>Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)>950&&Number(document.querySelector('.graphical-eq')?.dataset.spectrumPeakHz)<1050);
    const restoredPlaybackHz=await restoredPage.evaluate(()=>{globalThis.ehsReplacedEq=document.querySelector('.graphical-eq').eqVisualizer;return Number(document.querySelector('.graphical-eq').dataset.spectrumPeakHz)});
    await restoredPage.evaluate(({name,bytes})=>{
      const input=document.querySelector('#importEhs'),transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)],name,{type:'application/zip'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    },archive);
    await restoredPage.waitForFunction(()=>globalThis.ehsReplacedEq.disposed&&!globalThis.ehsReplacedEq.analyzer);
    await restoredPage.evaluate(()=>{delete globalThis.ehsReplacedEq});
    await restoredPage.locator('[data-view=export]').click();
    for(const format of ['wav','mp3']){
      await restoredPage.locator('#exportFormat').selectOption(format);
      const file=await captureDownload(restoredPage,()=>restoredPage.locator('#exportStart').click());
      const signal=await restoredPage.evaluate(async bytes=>await(await import('./tests/eq-project-browser.js')).inspectDownloadedEqAudio(bytes),file.bytes);
      outputs.push({format,...signal});
    }
    return{initial,isolatedOrigin:true,isolatedContext:false,archiveBytes:archive.bytes.length,settingsEqual:true,audioHashesEqual:true,restoredPlaybackHz,projectReplacementDisposed:true,before,after,outputs};
  }finally{await page.goto(originalOrigin);await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'))}
}
