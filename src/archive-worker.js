import {zipSync} from '../vendor/fflate/fflate.js';

self.onmessage=({data})=>{
 if(data?.type!=='zip')return;
 try{
  const files=Object.fromEntries(data.files.map(([path,bytes,options])=>[path,options?[new Uint8Array(bytes),options]:new Uint8Array(bytes)]));
  const archive=zipSync(files,{level:1});
  self.postMessage({type:'done',archive:archive.buffer},[archive.buffer]);
 }catch(error){self.postMessage({type:'error',message:error?.message||String(error)})}
};
