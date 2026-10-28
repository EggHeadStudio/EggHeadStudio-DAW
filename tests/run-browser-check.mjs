const port=process.argv[2]||'9228',origin=process.argv[3]||'http://127.0.0.1:8767',module=process.argv[4],method=process.argv[5],input=process.argv[6]||'null';
const argument=JSON.parse(input.startsWith('base64:')?Buffer.from(input.slice(7),'base64').toString('utf8'):input);
if(!module?.startsWith('./tests/')||!method)throw new Error('Pass a local browser test module and exported function.');
const targets=await(await fetch(`http://localhost:${port}/json/list`)).json(),target=targets.find(item=>item.type==='page');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
const requests=new Map(),contexts=new Map();let sequence=0,created=0,destroyed=0;
socket.addEventListener('message',event=>{
 const message=JSON.parse(event.data);
 if(message.method==='WebAudio.contextCreated'){contexts.set(message.params.context.contextId,message.params.context.contextType);created++}
 if(message.method==='WebAudio.contextDestroyed'){contexts.delete(message.params.contextId);destroyed++}
 const request=requests.get(message.id);if(!request)return;requests.delete(message.id);if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result);
});
const send=(name,params={})=>new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method:name,params}))});
const evaluate=async(expression,awaitPromise=false)=>{const response=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true,userGesture:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||JSON.stringify(response.exceptionDetails));return response.result.value};
let timer;
try{
 await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.navigate',{url:origin});
 if(process.env.EHS_GRAPH_DIAGNOSTICS)await send('WebAudio.enable');
 const deadline=Date.now()+15000;
 while(!await evaluate("document.querySelector('#toast')?.textContent.startsWith('Ready.')")){
  if(Date.now()>deadline)throw new Error('Application did not load.');await new Promise(resolve=>setTimeout(resolve,100));
 }
 const expression=`import(${JSON.stringify(module)}).then(module=>module[${JSON.stringify(method)}](${argument===null?'':JSON.stringify(argument)}))`;
 const result=await Promise.race([evaluate(expression,true),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Browser check exceeded its 300-second deadline.')),300000)})]);
 if(process.env.EHS_GRAPH_DIAGNOSTICS){
  await send('HeapProfiler.collectGarbage');await new Promise(resolve=>setTimeout(resolve,2000));await send('HeapProfiler.collectGarbage');
  console.error(JSON.stringify({createdContexts:created,destroyedContexts:destroyed,remainingContexts:[...contexts]}));
 }
 console.log(JSON.stringify(result));
}catch(error){
 await send('Page.navigate',{url:'about:blank'});
 throw error;
}finally{clearTimeout(timer);socket.close()}
