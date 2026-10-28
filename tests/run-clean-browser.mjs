const port=process.argv[2]||'9225',origin=process.argv[3]||'http://localhost:8765';
const targets=await(await fetch(`http://localhost:${port}/json/list`)).json();
const target=targets.find(target=>target.type==='page');
if(!target)throw new Error('Start a disposable Chromium browser with remote debugging enabled.');
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
  await send('Page.enable');await send('Page.navigate',{url:`${origin}/?acceptance=clean-browser`});
  const readyDeadline=Date.now()+15000;
  while(true){
    const ready=await send('Runtime.evaluate',{expression:"document.querySelector('#toast')?.textContent.startsWith('Ready.')",returnByValue:true});
    if(ready.result.value)break;
    if(Date.now()>readyDeadline)throw new Error('Disposable browser did not load the application.');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const result=await send('Runtime.evaluate',{expression:"import('./tests/instrument-clean-browser.js').then(module=>module.runCleanInstrumentAcceptance())",awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value,null,2));
}finally{socket.close()}
