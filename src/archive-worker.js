import {zipSync} from '../vendor/fflate/fflate.js';

self.onmessage=async({data})=>{
 if(data?.type!=='zip'&&data?.type!=='open')return;
 try{
  if(data.type==='open'){
   const {openPortableProjectArchive}=await import('./portable-project.js');
   const result=await openPortableProjectArchive(data.input,{useWorker:false,onProgress:status=>self.postMessage({type:'progress',status})});
   self.postMessage({type:'done',result});return;
  }
  const files=Object.fromEntries(data.files.map(([path,bytes,options])=>[path,options?[new Uint8Array(bytes),options]:new Uint8Array(bytes)]));
  const archive=zipSync(files,{level:1});
  self.postMessage({type:'done',archive:archive.buffer},[archive.buffer]);
 }catch(error){self.postMessage({type:'error',name:error?.name||'Error',message:error?.message||String(error)})}
};
