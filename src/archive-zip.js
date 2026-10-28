import {Zip,ZipDeflate,ZipPassThrough} from '../vendor/fflate/fflate.js';

export async function chunkedZip(files,{maxBytes,signal,onProgress=()=>{}}={}){
 const parts=[];let size=0,finished=false;
 const zip=new Zip((error,chunk,final)=>{
  if(error)throw error;
  size+=chunk.byteLength;
  if(size>maxBytes)throw new RangeError('ZIP output exceeds the 256 MiB archive size limit.');
  parts.push(chunk);finished=final;
 });
 try{
  const total=files.reduce((sum,[,bytes])=>sum+bytes.byteLength,0);let completed=0;
  for(const[path,bytes,options]of files){
   const entry=options?.level===0?new ZipPassThrough(path):new ZipDeflate(path,{level:1});
   zip.add(entry);
   for(let offset=0;offset<bytes.byteLength||offset===0;offset+=1024*1024){
    if(signal?.aborted)throw signal.reason||new DOMException('Archive creation cancelled.','AbortError');
    const end=Math.min(bytes.byteLength,offset+1024*1024);
    entry.push(bytes.subarray(offset,end),end===bytes.byteLength);
    completed+=end-offset;
    onProgress({stage:'zip',progress:total?completed/total:1,message:'Building ZIP output in bounded chunks.'});
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  if(signal?.aborted)throw signal.reason||new DOMException('Archive creation cancelled.','AbortError');
  zip.end();
  if(!finished)throw new Error('ZIP output did not finish.');
  return new Blob(parts,{type:'application/zip'});
 }catch(error){zip.terminate();throw error}
}
