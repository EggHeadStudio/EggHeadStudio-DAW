const port=process.argv[2]||'9228',origin=process.argv[3]||'http://localhost:8767';
const sizes=(process.argv[4]||'small,medium,large').split(','),exportAudio=process.argv[5]!=='no-render';
const targets=await(await fetch(`http://localhost:${port}/json/list`)).json(),target=targets.find(t=>t.type==='page');
if(!target)throw new Error('Start a disposable browser with remote debugging enabled.');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
let next=0;const requests=new Map();
socket.addEventListener('message',event=>{
 const message=JSON.parse(event.data),request=requests.get(message.id);
 if(!request)return;requests.delete(message.id);
 if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
});
const send=(method,params={})=>new Promise((resolve,reject)=>{
 const id=++next;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
});
try{
 await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.navigate',{url:origin});
 const deadline=Date.now()+15000;
 while(true){
  const ready=await send('Runtime.evaluate',{expression:"document.querySelector('#toast')?.textContent.startsWith('Ready.')",returnByValue:true});
  if(ready.result.value)break;
  if(Date.now()>deadline)throw new Error('Application did not load.');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 for(const size of sizes){
  if(!['small','medium','large'].includes(size))throw new Error('Unsupported workload.');
  let timer,result;
  try{
   result=await Promise.race([
    send('Runtime.evaluate',{expression:`import('./tests/performance-fixture.js').then(m=>m.runPerformanceBenchmark('${size}',{exportAudio:${exportAudio},playback:true}))`,awaitPromise:true,returnByValue:true,userGesture:true}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${size} exceeded the 180-second benchmark deadline.`)),180000)})
   ]);
  }catch(error){await send('Page.navigate',{url:'about:blank'});throw error}
  finally{clearTimeout(timer)}
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value));
 }
}finally{socket.close()}
