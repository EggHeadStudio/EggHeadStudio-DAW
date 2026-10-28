// This acceptance replaces local storage only on a fresh disposable origin.
export async function runStorageFaultAcceptance(page){
 const check=(value,message)=>{if(!value)throw new Error(message)};
 check(await page.evaluate(()=>!localStorage.getItem('pulse-project')),'Use a fresh disposable origin.');
 await page.evaluate(()=>localStorage.setItem('pulse-project','{broken-snapshot'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('could not be restored'));
 await page.locator('#projectName').fill('Recovered edit');await page.locator('#projectName').dispatchEvent('change');
 const backup=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pulse-project-recovery-')).map(k=>localStorage.getItem(k)));
 check(backup.includes('{broken-snapshot'),'Editing overwrote corrupt recovery data without a backup.');
 const previous=await page.evaluate(()=>localStorage.getItem('pulse-project'));
 await page.evaluate(()=>{
  const set=Storage.prototype.setItem;window.__quota=true;
  Storage.prototype.setItem=function(key,value){if(window.__quota&&key==='pulse-project')throw new DOMException('Injected metadata quota failure','QuotaExceededError');return set.call(this,key,value)};
  window.__blobs=[];const create=URL.createObjectURL;URL.createObjectURL=blob=>{window.__blobs.push(blob);return create.call(URL,blob)};
  const post=Worker.prototype.postMessage,terminate=Worker.prototype.terminate;
  Worker.prototype.terminate=function(){this.__testTerminated=true;return terminate.call(this)};
  Worker.prototype.postMessage=function(data,...args){
   if(window.__holdZip&&data.type==='zip')setTimeout(()=>{if(!this.__testTerminated)post.call(this,data,...args)},500);
   else post.call(this,data,...args);
  };
 });
 await page.locator('#projectName').fill('Unsaved edit');await page.locator('#projectName').dispatchEvent('change');
 check((await page.locator('#projectSaveState').textContent())==='Local save failed','Quota failure was not visible.');
 check((await page.evaluate(()=>localStorage.getItem('pulse-project')))===previous,'Quota failure lost the previous autosave.');
 await page.locator('#saveProject').click();
 await page.evaluate(()=>window.__holdZip=true);await page.locator('#saveEhs').click();
 await page.getByRole('button',{name:'Cancel project export',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('export cancelled'));
 check(await page.evaluate(()=>!window.__blobs.some(b=>b.type.includes('project'))),'Cancelled export downloaded an archive.');
 await page.evaluate(()=>window.__holdZip=false);await page.locator('#saveEhs').click();
 await page.waitForFunction(()=>window.__blobs.some(b=>b.type.includes('project')),null,{timeout:10000});
 const exported=await page.evaluate(async()=>JSON.parse(await window.__blobs.find(b=>b.type==='application/json').text()).name);
 check(exported==='Unsaved edit','JSON recovery lost the in-memory changes.');
 await page.evaluate(async()=>{
  const {createPortableProjectArchive}=await import('./src/portable-project.js');
  const incoming=JSON.parse(localStorage.getItem('pulse-project'));incoming.name='Incoming';
  window.__incoming=await createPortableProjectArchive(incoming);
  const input=document.querySelector('#importEhs'),dt=new DataTransfer();dt.items.add(new File([window.__incoming],'incoming.ehs'));
  input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Could not open portable project'));
 check((await page.locator('#projectName').inputValue())==='Unsaved edit','Failed import replaced the active project.');
 check((await page.evaluate(()=>localStorage.getItem('pulse-project')))===previous,'Failed import replaced the saved snapshot.');
 const importQuotaMessage=await page.locator('#toast').textContent();
 await page.evaluate(()=>{
  window.__quota=false;
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(data,...args){if(data.type==='open')setTimeout(()=>{if(!this.__testTerminated)post.call(this,data,...args)},500);else post.call(this,data,...args)};
  const dt=new DataTransfer();dt.items.add(new File([window.__incoming],'cancel.ehs'));
  const input=document.querySelector('#importEhs');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.getByRole('button',{name:'Cancel project import',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('import cancelled'));
 const cancellation=await page.locator('#toast').textContent();
 check((await page.locator('#projectName').inputValue())==='Unsaved edit','Cancelled import replaced the active project.');
 await page.evaluate(()=>{
  const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([0,1,2,3])],'corrupt.ehs'));
  const input=document.querySelector('#importEhs');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Could not open portable project'));
 check((await page.locator('#projectName').inputValue())==='Unsaved edit','Corrupt import replaced the active project.');
 const corrupt=await page.locator('#toast').textContent();
 await page.locator('#projectName').dispatchEvent('change');await page.reload();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Ready.'));
 check((await page.locator('#projectName').inputValue())==='Unsaved edit','Successful retry did not survive reload.');
 return{backup,quotaVisible:true,jsonExported:exported,ehsExported:true,exportCancellation:true,importQuotaMessage,cancellation,corrupt,reloadRestored:true};
}
