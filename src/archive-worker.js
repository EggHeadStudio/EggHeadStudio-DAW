import {chunkedZip} from './archive-zip.js';

self.onmessage=async({data})=>{
 if(data?.type!=='zip'&&data?.type!=='open')return;
 try{
  if(data.type==='open'){
   const {openPortableProjectArchive}=await import('./portable-project.js');
   const result=await openPortableProjectArchive(data.input,{useWorker:false,onProgress:status=>self.postMessage({type:'progress',status})});
   self.postMessage({type:'done',result});return;
  }
  const files=data.files.map(([path,bytes,options])=>[path,new Uint8Array(bytes),options]);
  const archive=await chunkedZip(files,{maxBytes:data.maxBytes,onProgress:status=>self.postMessage({type:'progress',status})});
  self.postMessage({type:'done',archive});
 }catch(error){self.postMessage({type:'error',name:error?.name||'Error',message:error?.message||String(error)})}
};
