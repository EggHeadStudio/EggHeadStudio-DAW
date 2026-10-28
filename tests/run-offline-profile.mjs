import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),port=process.argv[2]||'9228',size=process.argv[3]||'small';
const variants=(process.argv[4]||'full').split(','),mode=process.argv[5]||'',origin=process.argv[6]||'http://127.0.0.1:8767';
const targets=await(await fetch(`http://localhost:${port}/json/list`)).json(),target=targets.find(item=>item.type==='page');
if(!target)throw new Error('Start an isolated browser with remote debugging enabled.');
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
const requests=new Map();let sequence=0;
socket.addEventListener('message',event=>{const message=JSON.parse(event.data),request=requests.get(message.id);if(!request)return;requests.delete(message.id);if(message.error)request.reject(new Error(JSON.stringify(message.error)));else request.resolve(message.result)});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
const evaluate=async(expression,awaitPromise=false)=>{const result=await send('Runtime.evaluate',{expression,awaitPromise,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));return result.result.value};
let memoryTimer;
try{
 await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Page.navigate',{url:`${origin}/index.html`});
 for(let attempt=0;;attempt++){if(await evaluate("document.readyState==='complete'"))break;if(attempt>100)throw new Error('Page load timed out.');await new Promise(resolve=>setTimeout(resolve,100))}
 for(const variant of variants){
  let nativePeak=0,privatePeak=0,nativeSamples=0,sampling=false,lastMemory=null;
  const sampleMemory=async()=>{
   if(process.platform!=='win32')return;
   if(sampling)return;sampling=true;
   try{
    const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`$owned=Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*render-7c-profile*' }; $ids=@($owned.ProcessId); $all=Get-CimInstance Win32_Process; for($n=0;$n -lt 4;$n++){ $ids+=@($all | Where-Object { $ids -contains $_.ParentProcessId } | Select-Object -ExpandProperty ProcessId) }; $p=Get-Process -Id ($ids | Sort-Object -Unique) -ErrorAction SilentlyContinue; @{workingSet=($p | Measure-Object WorkingSet64 -Sum).Sum; privateBytes=($p | Measure-Object PrivateMemorySize64 -Sum).Sum} | ConvertTo-Json -Compress`]);
    lastMemory=JSON.parse(stdout);nativePeak=Math.max(nativePeak,lastMemory.workingSet);privatePeak=Math.max(privatePeak,lastMemory.privateBytes);nativeSamples++;
   }finally{sampling=false}
  };
  await sampleMemory();memoryTimer=setInterval(()=>sampleMemory().catch(error=>console.error(error.message)),5000);
  const expression=`import('./tests/offline-profile-browser.js').then(m=>m.profileOfflineRender(${JSON.stringify(size)},{variant:${JSON.stringify(variant)},encode:${mode.includes('encode')},reference:${mode.includes('reference')},compare:${mode.includes('compare')}}))`;
  const start=Date.now();let complete=false,result,error;
  evaluate(expression,true).then(value=>{result=value;complete=true},reason=>{error=reason;complete=true});
  let stage;
  while(!complete){
   await new Promise(resolve=>setTimeout(resolve,1000));
   const status=await evaluate('globalThis.offlineProfileStatus');
   if(status?.stage!==stage){stage=status?.stage;console.error(JSON.stringify({size,variant,stage,elapsedMs:Date.now()-start}))}
   if(Date.now()-start>Number(process.env.EHS_PROFILE_TIMEOUT_MS||900000)){await send('Page.navigate',{url:'about:blank'});throw new Error(`Workload deadline reached during ${stage}, after ${Date.now()-start} ms.`)}
  }
  clearInterval(memoryTimer);if(error)throw error;
  await send('HeapProfiler.collectGarbage');await new Promise(resolve=>setTimeout(resolve,1000));await sampleMemory();
  console.log(JSON.stringify({...result,nativeProcessWorkingSetPeak:nativePeak,nativeProcessPrivateBytesPeak:privatePeak,nativeAfterGC:lastMemory,nativeSamples}));
 }
}finally{clearInterval(memoryTimer);socket.close()}
