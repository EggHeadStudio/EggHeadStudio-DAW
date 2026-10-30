import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {MessageChannel} from 'node:worker_threads';

const template=await readFile(new URL('../scripts/service-worker-template.js',import.meta.url),'utf8');
const scope='https://example.test/eggheadstudio/';
const metaUrl=new URL('./__ehs_cache_meta__',scope).href;

function createCacheStorage(initial=new Map(),failAddAll=false){
  const records=initial;
  return{
    records,
    async open(name){
      if(!records.has(name))records.set(name,new Map());
      const entries=records.get(name);
      return{
        async addAll(urls){
          if(failAddAll)throw new Error('simulated shell-fetch failure');
          for(const url of urls)entries.set(String(url),new Response('shell'));
        },
        async match(request){
          const response=entries.get(typeof request==='string'?request:request.url||String(request));
          return response instanceof Response?response.clone():response;
        },
        async put(request,response){entries.set(String(request),response)},
        async keys(){return [...entries.keys()]}
      };
    },
    async keys(){return [...records.keys()]},
    async delete(name){return records.delete(name)}
  };
}

function createClient(id,{version,blockers=[]}){
  const messages=[];
  return{
    id,url:`${scope}index.html`,messages,
    postMessage(message,ports=[]){
      messages.push(message);
      if(message.type==='EHS_CLIENT_VERSION')ports[0].postMessage({version});
      if(message.type==='EHS_CHECK_UPDATE_SAFETY')ports[0].postMessage({version,blockers});
    }
  };
}

function createWorker(version,{cacheStorage=createCacheStorage(),clients=[],failInstall=false}={}){
  const handlers=new Map(),registration={scope},self={
    location:{origin:'https://example.test'},
    registration,
    clients:{matchAll:async()=>clients},
    skipWaiting:async()=>{self.skipWaitingCalls++},
    skipWaitingCalls:0,
    addEventListener(type,handler){handlers.set(type,handler)}
  };
  const source=template.replaceAll('__EHS_BUILD_VERSION__',version)
    .replace('__EHS_SHELL_URLS__',"['./','./assets/test.js']");
  runInNewContext(source,{
    self,caches:cacheStorage,MessageChannel,URL,Response,fetch:async()=>new Response('network'),
    setTimeout,clearTimeout,console:{error(){}}
  });
  return{self,handlers,cacheStorage,registration,failInstall};
}

async function dispatch(worker,type,event){
  let completion=Promise.resolve();
  event.waitUntil=promise=>{completion=Promise.resolve(promise)};
  await worker.handlers.get(type)(event);
  await completion;
}

test('failed shell installation removes its partial cache and leaves activation untouched',async()=>{
  const worker=createWorker('build-b',{cacheStorage:createCacheStorage(new Map(),true)});
  await assert.rejects(dispatch(worker,'install',{}),/simulated shell-fetch failure/);
  assert.deepEqual(await worker.cacheStorage.keys(),[]);
  assert.equal(worker.self.skipWaitingCalls,0);
});

test('update activation is blocked by any unsafe open client and approved only after all are safe',async()=>{
  const requester=createClient('requester',{version:'build-a'});
  const second=createClient('second',{version:'build-a',blockers:['Recording is active.']});
  const worker=createWorker('build-b',{clients:[requester,second]});
  let response=await postMessage(worker,requester,{type:'EHS_ACTIVATE_IF_SAFE'});
  assert.equal(response.ok,false);
  assert.match(response.blockers.join(' '),/Recording is active/);
  assert.equal(worker.self.skipWaitingCalls,0);

  second.messages.length=0;
  second.postMessage=(message,ports=[])=>{
    second.messages.push(message);
    if(message.type==='EHS_CLIENT_VERSION')ports[0].postMessage({version:'build-a'});
    if(message.type==='EHS_CHECK_UPDATE_SAFETY')ports[0].postMessage({version:'build-a',blockers:[]});
  };
  response=await postMessage(worker,requester,{type:'EHS_ACTIVATE_IF_SAFE'});
  assert.deepEqual(response,{ok:true,version:'build-b'});
  assert.equal(worker.self.skipWaitingCalls,1);
  assert.ok(requester.messages.some(message=>message.type==='EHS_UPDATE_APPROVED'));
  assert.ok(second.messages.some(message=>message.type==='EHS_UPDATE_APPROVED'));
});

test('old active workers retain newer waiting caches and the new active worker prunes older caches only when all tabs are current',async()=>{
  const records=new Map([
    ['ehs-shell-legacy',new Map()],
    ['ehs-shell-build-a',new Map([[metaUrl,new Response(JSON.stringify({version:'build-a',installedAt:10}))]])],
    ['ehs-shell-build-b',new Map([[metaUrl,new Response(JSON.stringify({version:'build-b',installedAt:20}))]])]
  ]);
  const storage=createCacheStorage(records);
  const clientA=createClient('tab-a',{version:'build-a'});
  const workerA=createWorker('build-a',{cacheStorage:storage,clients:[clientA]});
  await dispatch(workerA,'message',{data:{type:'EHS_CLIENT_HEARTBEAT'}});
  assert.deepEqual((await storage.keys()).sort(),['ehs-shell-build-a','ehs-shell-build-b']);

  const clientB=createClient('tab-b',{version:'build-b'});
  const workerB=createWorker('build-b',{cacheStorage:storage,clients:[clientA,clientB]});
  clientA.postMessage=(message,ports=[])=>{
    clientA.messages.push(message);
    if(message.type==='EHS_CLIENT_VERSION')ports[0].postMessage({version:'build-b'});
  };
  await dispatch(workerB,'message',{data:{type:'EHS_CLIENT_HEARTBEAT'}});
  assert.deepEqual(await storage.keys(),['ehs-shell-build-b']);
});

async function postMessage(worker,client,message){
  const channel=new MessageChannel();
  const reply=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('worker message response timed out')),3500);
    channel.port1.on('message',value=>{clearTimeout(timer);resolve(value)});
  });
  await dispatch(worker,'message',{
    data:message,source:client,ports:[channel.port2]
  });
  return reply;
}
