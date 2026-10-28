import {instrumentFixture,instrumentBuffers} from './instrument-fixture.js';
import {createPortableProjectArchive} from '../src/portable-project.js';

const waitFor=async(predicate)=>{
 const deadline=performance.now()+15000;
 while(!predicate()){if(performance.now()>deadline)throw new Error('Crash fixture did not reach its boundary.');await new Promise(resolve=>setTimeout(resolve,20))}
};
const inputArchive=blob=>{
 const transfer=new DataTransfer();transfer.items.add(new File([blob],'crash-acceptance.ehs'));
 const input=document.querySelector('#importEhs');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
};
async function assetDigests(){
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pulse-studio-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 try{
  const records=await new Promise((resolve,reject)=>{const request=db.transaction('assets').objectStore('assets').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  return await Promise.all(records.map(async record=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await record.arrayBuffer()))).map(byte=>byte.toString(16).padStart(2,'0')).join('')));
 }finally{db.close()}
}

export async function prepareCrashCase(kind){
 if(!['autosave','import','export'].includes(kind))throw new Error('Unknown crash case.');
 if(localStorage.getItem('pulse-project'))throw new Error('Use an empty, isolated crash-test origin.');
 const {project}=instrumentFixture(),context=new OfflineAudioContext(2,1,44100),buffers=instrumentBuffers(context);
 project.id='crash-baseline';project.name='Persisted before native crash';project.schemaVersion=2;
 inputArchive(await createPortableProjectArchive(project,{audioBuffers:buffers}));
 await waitFor(()=>document.querySelector('#toast').textContent.startsWith('Portable project opened'));
 const expected={snapshot:localStorage.getItem('pulse-project'),digests:(await assetDigests()).sort(),kind};
 globalThis.crashFixtureStage=null;
 if(kind==='autosave'){
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(key==='pulse-project'){globalThis.crashFixtureStage='before-localStorage-write';globalThis.heldAutosaveWrite=()=>set.call(this,key,value);return}
   return set.call(this,key,value);
  };
  const name=document.querySelector('#projectName');name.value='Interrupted edit';name.dispatchEvent(new Event('change',{bubbles:true}));
 }else if(kind==='import'){
  const incoming=structuredClone(project);incoming.id='interrupted-import';incoming.name='Should not replace the baseline';incoming.tracks[0].clips[0].asset='uncommitted-asset';
  const tone=context.createBuffer(1,44100,44100);tone.getChannelData(0).fill(.0123);
  buffers.set('uncommitted-asset',tone);
  const archive=await createPortableProjectArchive(incoming,{audioBuffers:buffers});
  const transaction=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(stores,mode,...args){
   const tx=transaction.call(this,stores,mode,...args);
   if(mode==='readwrite'&&tx.objectStoreNames.contains('assets')){
    const pump=()=>{const request=tx.objectStore('assets').count();request.onsuccess=pump};
    pump();
    const store=tx.objectStore('assets'),put=store.put.bind(store);
    store.put=(value,key)=>{const result=put(value,key);if(key==='uncommitted-asset')globalThis.crashFixtureStage='uncommitted-asset-transaction';return result};
    tx.objectStore=()=>store;
   }
   return tx;
  };
  inputArchive(archive);
 }else{
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(data,...args){
   if(data.type==='zip'){globalThis.crashFixtureStage='project-zip-worker-pending';globalThis.heldZipWrite=()=>post.call(this,data,...args);return}
   return post.call(this,data,...args);
  };
  document.querySelector('#saveEhs').click();
 }
 await waitFor(()=>globalThis.crashFixtureStage);
 return{...expected,stage:globalThis.crashFixtureStage};
}

export async function verifyCrashCase(expected){
 const snapshot=localStorage.getItem('pulse-project'),digests=(await assetDigests()).sort();
 if(snapshot!==expected.snapshot)throw new Error('Native crash replaced or corrupted the saved project.');
 if(JSON.stringify(digests)!==JSON.stringify(expected.digests))throw new Error('Native crash committed an incomplete asset transaction or lost saved audio.');
 const name=document.querySelector('#projectName').value;
 if(name!=='Persisted before native crash')throw new Error('Relaunch did not restore the saved project.');
 return{kind:expected.kind,interruptedStage:expected.stage,reopenedName:name,assets:digests.length,snapshotUnchanged:true,digestsUnchanged:true};
}

export async function inspectCrashCase(){
 return{snapshot:localStorage.getItem('pulse-project'),name:document.querySelector('#projectName').value,digests:await assetDigests()};
}
