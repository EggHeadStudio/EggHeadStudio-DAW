import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync} from '../vendor/fflate/fflate.js';
import {chunkedZip} from '../src/archive-zip.js';
import {createPortableProjectArchive,MAX_EHS_ARCHIVE_BYTES,openPortableProjectArchive} from '../src/portable-project.js';

test('chunked ZIP output preserves lossless stored audio and compressed metadata',async()=>{
 const bytes=Uint8Array.from({length:2*1024*1024+57},(_,i)=>i%251),progress=[];
 const blob=await chunkedZip([['assets/audio/test.wav',bytes,{level:0}],['project.json',new TextEncoder().encode('{"tracks":[]}')]],{maxBytes:4*1024*1024,onProgress:s=>progress.push(s.progress)});
 const restored=unzipSync(new Uint8Array(await blob.arrayBuffer()));
 assert.deepEqual(restored['assets/audio/test.wav'],bytes);
 assert.equal(new TextDecoder().decode(restored['project.json']),'{"tracks":[]}');
 assert.ok(progress.length>=4);assert.equal(progress.at(-1),1);
});

test('chunked ZIP rejects cancellation and bounded output failure without returning a partial archive',async()=>{
 const controller=new AbortController();
 await assert.rejects(chunkedZip([['audio',new Uint8Array(2*1024*1024),{level:0}]],{maxBytes:4*1024*1024,signal:controller.signal,onProgress:()=>controller.abort()}),{name:'AbortError'});
 await assert.rejects(chunkedZip([['audio',new Uint8Array(2048),{level:0}]],{maxBytes:1024}),/size limit/);
 await assert.rejects(chunkedZip([['empty',new Uint8Array(),{level:0}]],{maxBytes:1}),/size limit/);
});

test('portable format v1 validates chunked ZIP data descriptors and detects corrupt audio',async()=>{
 const source=new Uint8Array([1,2,3,4]),project={id:'chunked',name:'Chunked',bpm:120,tracks:[{id:'audio',clips:[{asset:'sample',bar:0,start:0,end:1}]}]};
 const archive=await createPortableProjectArchive(project,{assetFiles:new Map([['sample',source]])});
 const restored=await openPortableProjectArchive(archive,{useWorker:false});
 assert.equal(restored.manifest.formatVersion,1);
 assert.deepEqual(new Uint8Array(await restored.assetFiles.get('sample').arrayBuffer()),source);
 const bytes=new Uint8Array(await archive.arrayBuffer()),path=new TextDecoder().decode(bytes).indexOf('assets/audio/');
 const view=new DataView(bytes.buffer),start=30+view.getUint16(26,true)+view.getUint16(28,true);
 assert.ok(path>0);bytes[start]^=1;
 await assert.rejects(openPortableProjectArchive(bytes,{useWorker:false}),/checksum/);
});

test('allocation/read failure propagates rather than returning a successful partial import',async()=>{
 const error=new RangeError('Injected allocation failure');
 await assert.rejects(openPortableProjectArchive({arrayBuffer(){throw error}},{useWorker:false}),value=>value===error);
});

test('streamed ZIP descriptor corruption is rejected before accepting the archive',async()=>{
 const blob=await chunkedZip([['manifest.json',new TextEncoder().encode('{}')]],{maxBytes:4096});
 const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer);
 let descriptor=-1;
 for(let i=0;i<bytes.length-4;i++)if(view.getUint32(i,true)===0x08074b50){descriptor=i;break}
 assert.ok(descriptor>=0);bytes[descriptor+4]^=1;
 await assert.rejects(openPortableProjectArchive(bytes,{useWorker:false}),/data descriptor/);
});

test('archive import worker allocation failures remain visible and terminate the worker',async()=>{
 const original=globalThis.Worker;let worker;
 globalThis.Worker=class{
  constructor(){worker=this}
  postMessage(){queueMicrotask(()=>this.onmessage({data:{type:'error',name:'RangeError',message:'Injected memory pressure'}}))}
  terminate(){this.terminated=true}
 };
 try{
  await assert.rejects(openPortableProjectArchive(new Blob(['archive'])),{name:'RangeError',message:'Injected memory pressure'});
  assert.equal(worker.terminated,true);
 }finally{globalThis.Worker=original}
});

test('oversized stored audio is rejected before allocating file bytes or encoding PCM',async()=>{
 const project={name:'Oversized',bpm:120,tracks:[{id:'audio',clips:[{asset:'sample',bar:0,start:0,end:1}]}]};
 let read=false;
 await assert.rejects(createPortableProjectArchive(project,{assetFiles:new Map([['sample',{size:MAX_EHS_ARCHIVE_BYTES+1,arrayBuffer(){read=true;throw new Error('Must not read oversized audio')}}]])}),/256 MiB/);
 assert.equal(read,false);
 await assert.rejects(createPortableProjectArchive(project,{audioBuffers:new Map([['sample',{length:MAX_EHS_ARCHIVE_BYTES,numberOfChannels:2,sampleRate:48000,getChannelData(){read=true;throw new Error('Must not encode oversized audio')}}]])}),/256 MiB/);
 assert.equal(read,false);
});
