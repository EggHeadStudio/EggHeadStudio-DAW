import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPwaUpdates} from '../src/pwa-updates.js';

class Element {
  constructor(){this.hidden=false;this.disabled=false;this.textContent='';this.listeners=new Map();this.children=new Map()}
  querySelector(selector){return this.children.get(selector)||null}
  addEventListener(type,handler){const handlers=this.listeners.get(type)||[];handlers.push(handler);this.listeners.set(type,handlers)}
  fire(type){for(const handler of this.listeners.get(type)||[])handler({})}
}

async function updateFixture({confirmTimeoutMs=1000,activeVersion='build-a'}={}){
  const notice=new Element(),message=new Element(),update=new Element(),later=new Element(),documentListeners=new Map(),workerListeners=new Map();
  notice.children.set('[data-pwa-update-message]',message);
  notice.children.set('[data-pwa-update-now]',update);
  notice.children.set('[data-pwa-update-later]',later);
  const documentMock={
    hidden:false,
    baseURI:'https://example.test/',
    querySelector:selector=>selector==='meta[name="ehs-build"]'?{content:'build-a'}:null,
    getElementById:id=>id==='pwaUpdateNotice'?notice:null,
    addEventListener:(type,handler)=>documentListeners.set(type,handler)
  };
  const active={
    postMessage:(request,ports)=>{if(request.type==='EHS_GET_BUILD_VERSION')queueMicrotask(()=>ports[0].postMessage({version:activeVersion}))}
  };
  const waiting={postMessage:(request,ports)=>{if(request.type==='EHS_ACTIVATE_IF_SAFE')setTimeout(()=>ports[0].postMessage({ok:true,version:'build-b'}),0)}};
  const registration={active,waiting,installing:null,addEventListener:(type,handler)=>workerListeners.set(`registration:${type}`,handler),update:async()=>{}};
  const serviceWorker={
    controller:null,
    addEventListener:(type,handler)=>workerListeners.set(type,handler),
    register:async()=>registration
  };
  const descriptors=new Map();
  for(const [key,value]of Object.entries({document:documentMock,navigator:{serviceWorker},location:{reload(){reloads++}}})){
    descriptors.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  let reloads=0;
  const app=mountPwaUpdates({getSafety:()=>[],queryTimeoutMs:30,confirmTimeoutMs});
  await new Promise(resolve=>setImmediate(resolve));
  return{
    app,notice,message,update,later,workerListeners,documentListeners,registration,
    setActiveVersion(value){activeVersion=value},
    get reloads(){return reloads},
    restore(){app.dispose();for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
  };
}

test('approved update notice closes only after the active worker confirms the approved build',async()=>{
  const fixture=await updateFixture();
  try{
    fixture.workerListeners.get('message')({data:{type:'EHS_UPDATE_APPROVED',version:'build-b'}});
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.match(fixture.message.textContent,/Confirming the new version/);
    assert.equal(fixture.notice.hidden,false);
    fixture.setActiveVersion('build-b');
    fixture.workerListeners.get('controllerchange')();
    await new Promise(resolve=>setTimeout(resolve,350));
    assert.equal(fixture.reloads,1);
    assert.equal(fixture.notice.hidden,true);
  }finally{fixture.restore()}
});

test('failed update confirmation restores a retry or dismiss action instead of leaving a switching notice',async()=>{
  const fixture=await updateFixture({confirmTimeoutMs:30});
  try{
    fixture.workerListeners.get('message')({data:{type:'EHS_UPDATE_APPROVED',version:'build-b'}});
    await new Promise(resolve=>setTimeout(resolve,60));
    assert.match(fixture.message.textContent,/could not be confirmed/i);
    assert.equal(fixture.notice.hidden,false);
    assert.equal(fixture.update.disabled,false);
    assert.equal(fixture.update.textContent,'Retry update');
    assert.equal(fixture.later.disabled,false);
    assert.equal(fixture.later.textContent,'Dismiss');
    assert.equal(fixture.reloads,0);
  }finally{fixture.restore()}
});
