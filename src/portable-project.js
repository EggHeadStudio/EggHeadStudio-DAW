import {unzipSync,zipSync} from '../vendor/fflate/fflate.js';
import {encodeWavAsync} from './export-dsp.js';
import {validateReleaseMetadata} from './release-metadata.js';

export const EHS_FORMAT_VERSION=1;
export const PROJECT_SCHEMA_VERSION=1;
export const MAX_EHS_ARCHIVE_BYTES=256*1024*1024;
export const MAX_EHS_UNCOMPRESSED_BYTES=512*1024*1024;
export const MAX_EHS_FILE_COUNT=4096;
export const MAX_EHS_COMPRESSION_RATIO=200;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const CRC_TABLE=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=CRC_TABLE[(value^byte)&0xff]^(value>>>8);return(value^0xffffffff)>>>0}

function assertSafePath(path){
 if(typeof path!=='string'||!path||path.length>1024||path.includes('\0')||path.includes('\\')||path.startsWith('/')||/^[A-Za-z]:/.test(path))throw new Error('Archive contains an unsafe path.');
 const parts=path.split('/');
 if(parts.some(part=>!part||part==='.'||part==='..'))throw new Error('Archive path traversal is not allowed.');
}
function validImageBytes(bytes,mime){
 return mime==='image/png'
  ?bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)
  :mime==='image/jpeg'&&bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
}

function zipCentralDirectory(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),minimum=Math.max(0,bytes.length-65557);
 let end=-1;
 for(let offset=bytes.length-22;offset>=minimum;offset--)if(view.getUint32(offset,true)===0x06054b50){end=offset;break}
 if(end<0)throw new Error('Invalid ZIP archive: end record not found.');
 if(end+22+view.getUint16(end+20,true)!==bytes.length)throw new Error('ZIP end record or archive comment is truncated.');
 if(view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw new Error('Multi-disk ZIP archives are not supported.');
 const entryCount=view.getUint16(end+10,true),totalCount=view.getUint16(end+8,true),centralSize=view.getUint32(end+12,true),centralOffset=view.getUint32(end+16,true);
 if(entryCount!==totalCount||entryCount>MAX_EHS_FILE_COUNT||entryCount===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error('ZIP entry count or ZIP64 layout is unsupported.');
 if(centralOffset+centralSize>end)throw new Error('Invalid ZIP central directory bounds.');
 if(centralOffset+centralSize!==end)throw new Error('ZIP central directory bounds are invalid or contain unsupported records.');
 const entries=[],paths=new Set(),localRanges=[];let offset=centralOffset,totalUncompressed=0;
 for(let index=0;index<entryCount;index++){
  if(offset+46>centralOffset+centralSize||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid ZIP central directory entry.');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),crc=view.getUint32(offset+16,true),compressedSize=view.getUint32(offset+20,true),uncompressedSize=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),externalAttributes=view.getUint32(offset+38,true),localOffset=view.getUint32(offset+42,true);
  if(flags&1)throw new Error('Encrypted ZIP entries are not supported.');
  if(flags&~0x080e)throw new Error('ZIP entry uses unsupported general-purpose flags.');
  if(method!==0&&method!==8)throw new Error('ZIP entry uses an unsupported compression method.');
  if(compressedSize===0xffffffff||uncompressedSize===0xffffffff||localOffset===0xffffffff)throw new Error('ZIP64 entries are not supported.');
  if(offset+46+nameLength+extraLength+commentLength>centralOffset+centralSize)throw new Error('Truncated ZIP directory entry.');
  let path;try{path=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength))}catch{throw new Error('ZIP entry path is not valid UTF-8.')}
  assertSafePath(path);
  if(((externalAttributes>>>16)&0xf000)===0xa000)throw new Error('Symbolic-link ZIP entries are not supported.');
  if((path==='manifest.json'&&uncompressedSize>2*1024*1024)||(path==='project.json'&&uncompressedSize>16*1024*1024)||path.startsWith('presets/')&&uncompressedSize>2*1024*1024)throw new Error(`ZIP entry ${path} exceeds its JSON size limit.`);
  if(paths.has(path))throw new Error('ZIP archive contains duplicate paths.');
  paths.add(path);
  if(uncompressedSize>0&&(!compressedSize||uncompressedSize/compressedSize>MAX_EHS_COMPRESSION_RATIO))throw new Error('ZIP compression ratio exceeds the safety limit.');
  totalUncompressed+=uncompressedSize;
  if(totalUncompressed>MAX_EHS_UNCOMPRESSED_BYTES)throw new Error('ZIP archive exceeds the uncompressed size limit.');
  if(localOffset+30>centralOffset||view.getUint32(localOffset,true)!==0x04034b50)throw new Error('ZIP local file header is invalid.');
  const localNameLength=view.getUint16(localOffset+26,true),localExtraLength=view.getUint16(localOffset+28,true),dataStart=localOffset+30+localNameLength+localExtraLength;
  if(localNameLength!==nameLength||localOffset+30+localNameLength+localExtraLength>centralOffset||!bytes.subarray(localOffset+30,localOffset+30+localNameLength).every((value,index)=>value===bytes[offset+46+index]))throw new Error('ZIP local and central paths do not match.');
  if(view.getUint16(localOffset+6,true)&1||view.getUint16(localOffset+6,true)!==flags||view.getUint16(localOffset+8,true)!==method)throw new Error('ZIP local and central headers disagree.');
  const dataEnd=dataStart+compressedSize,descriptorBytes=flags&8?(view.getUint32(dataEnd,true)===0x08074b50?16:12):0;
  if(dataEnd+descriptorBytes>centralOffset)throw new Error('ZIP entry data exceeds archive bounds.');
  if(!(flags&8)&&(view.getUint32(localOffset+14,true)!==crc||view.getUint32(localOffset+18,true)!==compressedSize||view.getUint32(localOffset+22,true)!==uncompressedSize))throw new Error('ZIP local and central sizes or checksums disagree.');
  localRanges.push([localOffset,dataEnd+descriptorBytes]);
  entries.push({path,method,crc,compressedSize,uncompressedSize});
  offset+=46+nameLength+extraLength+commentLength;
 }
 if(offset!==centralOffset+centralSize)throw new Error('ZIP directory size does not match its entries.');
 localRanges.sort((left,right)=>left[0]-right[0]);
 for(let index=1;index<localRanges.length;index++)if(localRanges[index][0]<localRanges[index-1][1])throw new Error('ZIP entries overlap in the archive.');
 return entries;
}

async function bytesOf(value){
 if(value instanceof Uint8Array)return value;
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 if(value&&typeof value.arrayBuffer==='function')return new Uint8Array(await value.arrayBuffer());
 throw new TypeError('Packaged assets must be Blob, File, ArrayBuffer, or Uint8Array values.');
}

async function sha256(bytes){
 if(!globalThis.crypto?.subtle)throw new Error('SHA-256 requires Web Crypto support in this browser.');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
async function zipFiles(files,{signal,onProgress}={}){
 const zipInputs=Object.fromEntries(Object.entries(files).map(([path,bytes])=>[path,path.startsWith('assets/audio/')||path.startsWith('assets/artwork/')?[bytes,{level:0}]:bytes]));
 if(typeof Worker!=='function'){
  if(signal?.aborted)throw signal.reason||new DOMException('Archive creation cancelled.','AbortError');
  return zipSync(zipInputs,{level:1});
 }
 const worker=new Worker(new URL('./archive-worker.js',import.meta.url),{type:'module'});
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>{signal?.removeEventListener('abort',abort);worker.terminate()};
  const finish=(callback,value)=>{if(settled)return;settled=true;cleanup();callback(value)};
  const abort=()=>finish(reject,signal?.reason||new DOMException('Archive creation cancelled.','AbortError'));
  worker.onmessage=({data})=>{
   if(data?.type==='error')finish(reject,new Error(`ZIP compression failed: ${data.message}`));
   else if(data?.type==='done'){onProgress?.({stage:'zip',progress:1,message:'ZIP compression complete.'});finish(resolve,new Uint8Array(data.archive))}
  };
  worker.onerror=event=>finish(reject,new Error(event.message||'Archive worker failed.'));
  worker.onmessageerror=()=>finish(reject,new Error('Archive worker returned unreadable data.'));
  signal?.addEventListener('abort',abort,{once:true});
  const entries=Object.entries(zipInputs),transfer=[];
  const payload=entries.map(([path,value])=>{const[data,options]=Array.isArray(value)?value:[value,null],bytes=data instanceof Uint8Array?data:new Uint8Array(data);transfer.push(bytes.buffer);return[path,bytes.buffer,options]});
  onProgress?.({stage:'zip',progress:0,message:'Compressing archive in a background worker…'});
  try{worker.postMessage({type:'zip',files:payload},transfer)}catch(error){finish(reject,error)}
 });
}

function referencedAssetIds(project){
 const ids=new Set();
 for(const track of project.tracks||[]){
  for(const clip of track.clips||[])if(clip.asset)ids.add(String(clip.asset));
  if(track.sampler?.asset)ids.add(String(track.sampler.asset));
  for(const pad of track.drumRack?.pads||[])if(pad.asset)ids.add(String(pad.asset));
 }
 return ids;
}
export function getProjectAssetIds(project){return referencedAssetIds(project)}

function safeExtension(name,mime){
 const fromName=String(name||'').match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase();
 if(fromName)return fromName;
 return({'audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg','audio/mp4':'m4a','audio/flac':'flac'}[mime]||'bin');
}

function manifestJson(value){
 return encoder.encode(JSON.stringify(value,null,2));
}

export async function createPortableProjectArchive(project,{assetFiles=new Map(),audioBuffers=new Map(),artworkFile=null,artworkSourceFile=null,presets={},signal,onProgress=()=>{},appVersion='0.1.0',now=new Date()}={}){
 validateProjectShape(project);
 const ids=referencedAssetIds(project),assetMap={},files={},contentPaths=new Map(),totalIds=ids.size;
 let completed=0,uncompressed=0;
 for(const id of ids){
  if(signal?.aborted)throw signal.reason||new DOMException('Archive creation cancelled.','AbortError');
  let source=assetFiles.get(id),bytes,name=source?.name||id,mime=source?.type||'application/octet-stream',sampleRate=null,channels=null;
  if(source)bytes=await bytesOf(source);
  else{
   const audio=audioBuffers.get(id);
   if(!audio)throw new Error(`Project references missing audio asset "${id}". Nothing was archived.`);
   channels=audio.numberOfChannels;sampleRate=audio.sampleRate;
   bytes=new Uint8Array(await encodeWavAsync(Array.from({length:channels},(_,index)=>audio.getChannelData(index)),sampleRate,{bitDepth:32,dither:false}));
   name=`${id}.wav`;mime='audio/wav';
  }
  const digest=await sha256(bytes),path=contentPaths.get(digest)||`assets/audio/${digest}.${safeExtension(name,mime)}`;
  if(bytes.byteLength>MAX_EHS_UNCOMPRESSED_BYTES)throw new RangeError(`Audio asset "${id}" exceeds the archive asset size limit.`);
  if(!contentPaths.has(digest)){contentPaths.set(digest,path);files[path]=bytes;uncompressed+=bytes.byteLength}
  if(uncompressed>MAX_EHS_UNCOMPRESSED_BYTES)throw new RangeError('Portable project exceeds the 512 MiB uncompressed size limit.');
  if(!/^[A-Za-z0-9._-]{1,128}$/.test(id))throw new Error(`Project asset identifier "${id}" cannot be safely packaged.`);
  assetMap[id]={path,size:bytes.byteLength,sha256:digest,name:String(name).slice(0,255),mime:String(mime).slice(0,100),...(sampleRate?{sampleRate,channels}:{})};
  completed++;onProgress({stage:'assets',progress:totalIds?completed/totalIds:1,message:`Packaged ${completed}/${totalIds} audio assets`});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(project.tracks.some(track=>(track.clips||[]).some(clip=>clip.asset&&!assetMap[String(clip.asset)])))throw new Error('At least one arrangement clip references an asset that was not packaged.');
 if(project.releaseArtwork&&!artworkFile)throw new Error('Project artwork is referenced but its prepared image is missing from local storage.');
 const projectCopy={...project,schemaVersion:PROJECT_SCHEMA_VERSION};
 files['project.json']=manifestJson(projectCopy);uncompressed+=files['project.json'].byteLength;
 let artworkRecord=null;
 if(artworkFile){
  const bytes=await bytesOf(artworkFile),digest=await sha256(bytes),mime=artworkFile.type||'image/jpeg',path=`assets/artwork/${digest}.${safeExtension(artworkFile.name,mime)}`;
  if(bytes.byteLength>25*1024*1024||!validImageBytes(bytes,mime))throw new Error('Prepared artwork must be a valid JPEG or PNG no larger than 25 MiB.');
  files[path]=bytes;uncompressed+=bytes.byteLength;
  artworkRecord={path,size:bytes.byteLength,sha256:digest,mime,name:String(artworkFile.name||'cover').slice(0,255)};
 }
 let artworkSourceRecord=null;
 if(artworkSourceFile){
  const bytes=await bytesOf(artworkSourceFile),digest=await sha256(bytes),mime=artworkSourceFile.type||'image/jpeg',path=`assets/artwork/original-${digest}.${safeExtension(artworkSourceFile.name,mime)}`;
  if(bytes.byteLength>25*1024*1024||!validImageBytes(bytes,mime))throw new Error('Original artwork must be a valid JPEG or PNG no larger than 25 MiB.');
  files[path]=bytes;uncompressed+=bytes.byteLength;
  artworkSourceRecord={path,size:bytes.byteLength,sha256:digest,mime,name:String(artworkSourceFile.name||'original-cover').slice(0,255)};
 }
 const presetEntries=Object.entries(presets||{}).filter(([,value])=>value&&typeof value==='object');
 const presetManifest=[];
 for(const[name,value]of presetEntries){
  const safeName=String(name).replace(/[^a-z0-9_-]+/gi,'_').slice(0,80)||'preset';
  const path=`presets/${safeName}.json`;if(files[path])throw new Error(`Preset names collide after archive-safe normalization: ${name}`);
  files[path]=manifestJson(value);uncompressed+=files[path].byteLength;presetManifest.push({name:String(name).slice(0,120),path});
 }
 files['README.txt']=encoder.encode('EggHeadStudio portable project archive (.ehs).\r\nOpen this file with EggHeadStudio DAW. Audio assets are losslessly embedded and referenced by project.json.\r\n');
 uncompressed+=files['README.txt'].byteLength;
 const fileManifest=[];
 for(const[path,data]of Object.entries(files))fileManifest.push({path,size:data.byteLength,sha256:await sha256(data)});
 const createdAt=now.toISOString(),manifest={
  format:'EggHeadStudioProject',formatVersion:EHS_FORMAT_VERSION,applicationVersion:appVersion,
  projectSchemaVersion:PROJECT_SCHEMA_VERSION,projectId:String(project.id||''),projectName:String(project.name||'Untitled Project'),
  createdAt,lastModified:String(project.modifiedAt||createdAt),compatibility:{minimumApplicationVersion:appVersion},
  assets:assetMap,artwork:artworkRecord,artworkSource:artworkSourceRecord,presets:presetManifest,
  files:fileManifest,
  limits:{payloadBytes:uncompressed,fileCount:Object.keys(files).length+1}
 };
 files['manifest.json']=manifestJson(manifest);
 const totalUncompressed=Object.values(files).reduce((size,data)=>size+data.byteLength,0);
 if(Object.keys(files).length>MAX_EHS_FILE_COUNT||totalUncompressed>MAX_EHS_UNCOMPRESSED_BYTES)throw new RangeError('Portable project exceeds archive size or file-count limits.');
 if(signal?.aborted)throw signal.reason||new DOMException('Archive creation cancelled.','AbortError');
 onProgress({stage:'zip',progress:0,message:'Compressing project archive…'});
 await new Promise(resolve=>setTimeout(resolve,0));
 const archive=await zipFiles(files,{signal,onProgress});
 if(archive.byteLength>MAX_EHS_ARCHIVE_BYTES)throw new RangeError('Portable project archive exceeds the 256 MiB compressed size limit.');
 onProgress({stage:'zip',progress:1,message:'Portable project archive ready.'});
 return new Blob([archive],{type:'application/vnd.eggheadstudio.project+zip'});
}

function parseJson(bytes,label){
 try{return JSON.parse(decoder.decode(bytes))}catch{throw new Error(`${label} is missing or contains invalid UTF-8/JSON.`)}
}

function validateProjectShape(project){
 if(!project||typeof project!=='object'||!Array.isArray(project.tracks)||project.tracks.length>256||!Number.isFinite(project.bpm)||project.bpm<1||project.bpm>999)throw new Error('Project data is invalid or exceeds track limits.');
 let clips=0,notes=0;
 for(const track of project.tracks){
  if(!track||typeof track!=='object')throw new Error('Project contains an invalid track.');
  clips+=(track.clips||[]).length;notes+=(track.pattern?.notes||[]).length;
  if(!Array.isArray(track.clips||[])||!Array.isArray(track.pattern?.notes||[])||!Array.isArray(track.drumRack?.pads||[]))throw new Error('Project contains invalid clip, note, or pad data.');
  if((track.drumRack?.pads||[]).length>16)throw new Error('Project contains more than 16 Drum Rack pads on a track.');
  for(const clip of track.clips||[]){
   if(!clip||typeof clip.asset!=='string'||!Number.isFinite(clip.bar)||clip.bar<0||!Number.isFinite(clip.start)||clip.start<0||!Number.isFinite(clip.end)||clip.end<=clip.start||clip.rate!==undefined&&(!Number.isFinite(clip.rate)||clip.rate<=0||clip.rate>16)||clip.gain!==undefined&&!Number.isFinite(clip.gain))throw new Error('Project contains an invalid audio clip.');
   for(const key of ['loopOffset','envelopeOffset','envelopeDuration'])if(clip[key]!==undefined&&(!Number.isFinite(clip[key])||clip[key]<0))throw new Error(`Project contains an invalid clip ${key}.`);
  }
 }
 if(clips>100000||notes>1000000)throw new Error('Project exceeds clip or note safety limits.');
 if(typeof project.name!=='string'||project.name.length>2000)throw new Error('Project name is invalid.');
 if(project.id!==undefined&&(typeof project.id!=='string'||project.id.length>128))throw new Error('Project identifier is invalid.');
 if(project.schemaVersion!==undefined&&(!Number.isInteger(project.schemaVersion)||project.schemaVersion<0||project.schemaVersion>PROJECT_SCHEMA_VERSION))throw new Error(`Project schema ${project.schemaVersion} is invalid or newer than supported schema ${PROJECT_SCHEMA_VERSION}; the archive was not opened.`);
 return project;
}

export async function openPortableProjectArchive(input,{signal,onProgress=()=>{},useWorker=true}={}){
 if(signal?.aborted)throw signal.reason||new DOMException('Archive import cancelled.','AbortError');
 if(Number.isFinite(input?.size)&&input.size>MAX_EHS_ARCHIVE_BYTES)throw new RangeError('Portable project exceeds the 256 MiB archive size limit.');
 if(useWorker&&typeof Worker==='function'){
  if(!(input instanceof Blob)&&!(input instanceof ArrayBuffer)&&!(input instanceof Uint8Array))throw new TypeError('Packaged assets must be Blob, File, ArrayBuffer, or Uint8Array values.');
  if((input.byteLength||0)>MAX_EHS_ARCHIVE_BYTES)throw new RangeError('Portable project exceeds the 256 MiB archive size limit.');
  const blob=input instanceof Blob?input:new Blob([input]);
  const worker=new Worker(new URL('./archive-worker.js',import.meta.url),{type:'module'});
  return new Promise((resolve,reject)=>{
   let settled=false;
   const cleanup=()=>{signal?.removeEventListener('abort',abort);worker.terminate()};
   const finish=(callback,value)=>{if(settled)return;settled=true;cleanup();callback(value)};
   const abort=()=>finish(reject,signal?.reason||new DOMException('Archive import cancelled.','AbortError'));
   worker.onmessage=({data})=>{
    if(settled)return;
    if(data?.type==='progress'){try{onProgress(data.status)}catch(error){finish(reject,error)}return}
    if(data?.type==='done'){finish(resolve,data.result);return}
    if(data?.type==='error'){const error=new Error(data.message);error.name=data.name||'Error';finish(reject,error)}
   };
   worker.onerror=event=>finish(reject,new Error(event.message||'Archive import worker failed.'));
   worker.onmessageerror=()=>finish(reject,new Error('Archive import worker returned unreadable data.'));
   signal?.addEventListener('abort',abort,{once:true});
   try{onProgress({stage:'verify',progress:0,message:'Validating portable project in a background worker…'});if(signal?.aborted){abort();return}worker.postMessage({type:'open',input:blob})}catch(error){finish(reject,error)}
  });
 }
 const bytes=await bytesOf(input);
 if(bytes.byteLength>MAX_EHS_ARCHIVE_BYTES)throw new RangeError('Portable project exceeds the 256 MiB archive size limit.');
 const entries=zipCentralDirectory(bytes),entryMap=new Map(entries.map(entry=>[entry.path,entry]));
 for(const required of ['manifest.json','project.json'])if(!entryMap.has(required))throw new Error(`Portable project is missing ${required}.`);
 const allowedRoot=new Set(['manifest.json','project.json','README.txt']);
 for(const path of entryMap.keys())if(!allowedRoot.has(path)&&!path.startsWith('assets/audio/')&&!path.startsWith('assets/artwork/')&&!/^presets\/[^/]+\.json$/.test(path))throw new Error(`Portable project contains an unsupported file path: ${path}`);
 if(signal?.aborted)throw signal.reason||new DOMException('Archive import cancelled.','AbortError');
 let extracted;try{extracted=unzipSync(bytes)}catch(error){throw new Error(`ZIP archive could not be decoded: ${error.message}`)}
 if(signal?.aborted)throw signal.reason||new DOMException('Archive import cancelled.','AbortError');
 const manifest=parseJson(extracted['manifest.json'],'manifest.json');
 if(manifest.format!=='EggHeadStudioProject'||manifest.formatVersion!==EHS_FORMAT_VERSION)throw new Error(`Unsupported EHS archive version "${manifest.formatVersion}".`);
 if(!Number.isInteger(manifest.projectSchemaVersion)||manifest.projectSchemaVersion<0||manifest.projectSchemaVersion>PROJECT_SCHEMA_VERSION)throw new Error(`Project schema ${manifest.projectSchemaVersion} is invalid or newer than supported schema ${PROJECT_SCHEMA_VERSION}; the archive was not opened.`);
 if(!manifest.assets||typeof manifest.assets!=='object'||Array.isArray(manifest.assets)||Object.keys(manifest.assets).length>MAX_EHS_FILE_COUNT)throw new Error('Archive asset manifest is invalid.');
 if(!Array.isArray(manifest.files))throw new Error('Archive file manifest is invalid.');
 if(!Array.isArray(manifest.presets||[])||manifest.presets.length>MAX_EHS_FILE_COUNT)throw new Error('Archive preset manifest is invalid.');
 const declaredFiles=new Map();
 for(const item of manifest.files){
  if(!item||typeof item.path!=='string'||!Number.isSafeInteger(item.size)||item.size<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw new Error('Archive file manifest contains an invalid record.');
  assertSafePath(item.path);if(item.path==='manifest.json'||declaredFiles.has(item.path))throw new Error('Archive file manifest contains duplicate or reserved paths.');
  declaredFiles.set(item.path,item);
 }
 if(declaredFiles.size!==manifest.files.length)throw new Error('Archive file manifest contains duplicate paths.');
 const verifiedContent=new Map();
 for(const path of entryMap.keys())if(path==='manifest.json')continue;else{
  if(signal?.aborted)throw signal.reason||new DOMException('Archive import cancelled.','AbortError');
  assertSafePath(path);
  const record=declaredFiles.get(path),data=extracted[path];
  if(!record||record.size!==data?.byteLength)throw new Error(`Archive file ${path} is missing from the manifest or has the wrong size.`);
  if(crc32(data)!==entryMap.get(path).crc)throw new Error(`ZIP checksum verification failed for ${path}.`);
  const digest=await sha256(data);
  if(digest!==record.sha256)throw new Error(`SHA-256 verification failed for ${path}.`);
  verifiedContent.set(path,digest);
  onProgress({stage:'verify',progress:verifiedContent.size/(entryMap.size-1),message:`Verified ${verifiedContent.size}/${entryMap.size-1} archive files`});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 if(declaredFiles.size!==entryMap.size-1)throw new Error('Archive file manifest does not match the ZIP contents.');
 const payloadBytes=[...declaredFiles.values()].reduce((sum,record)=>sum+record.size,0);
 if(!manifest.limits||manifest.limits.payloadBytes!==payloadBytes||manifest.limits.fileCount!==entryMap.size)throw new Error('Archive limits summary does not match the payload.');
 const project=validateProjectShape(parseJson(extracted['project.json'],'project.json'));
 if(manifest.projectId&&manifest.projectId!==project.id)throw new Error('Manifest project ID does not match project.json.');
 project.schemaVersion=PROJECT_SCHEMA_VERSION;
 project.id ||= globalThis.crypto?.randomUUID?.()||`project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
 if(project.releaseMetadata&&validateReleaseMetadata(project.releaseMetadata).length)throw new Error('Project release metadata is invalid.');
 const assetFiles=new Map(),assetMetadata=new Map(),audioBlobs=new Map(),assets=Object.entries(manifest.assets);
 let completed=0;
 for(const[id,record]of assets){
  if(signal?.aborted)throw signal.reason||new DOMException('Archive import cancelled.','AbortError');
  if(!/^[A-Za-z0-9._-]{1,128}$/.test(id)||typeof record?.path!=='string'||!record.path.startsWith('assets/audio/')||!Number.isSafeInteger(record.size)||record.size<1||!/^[a-f0-9]{64}$/.test(record.sha256))throw new Error('Archive asset manifest contains an invalid record.');
  assertSafePath(record.path);
  const data=extracted[record.path];if(!data)throw new Error(`Archive is missing referenced asset ${record.path}.`);
  if(data.byteLength!==record.size)throw new Error(`Packaged audio size does not match for asset "${id}".`);
  const digest=verifiedContent.get(record.path);
  if(digest!==record.sha256)throw new Error(`SHA-256 verification failed for audio asset "${id}".`);
  const blobKey=JSON.stringify([record.path,record.mime||'application/octet-stream']);
  if(!audioBlobs.has(blobKey))audioBlobs.set(blobKey,new Blob([data],{type:record.mime||'application/octet-stream'}));
  assetFiles.set(id,audioBlobs.get(blobKey));
  assetMetadata.set(id,{...record,id});
  completed++;onProgress({stage:'assets',progress:assets.length?completed/assets.length:1,message:`Verified ${completed}/${assets.length} audio assets`});
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(const id of referencedAssetIds(project))if(!assetFiles.has(id))throw new Error(`Project references missing packaged audio asset "${id}".`);
 const usedAudioPaths=new Set([...assetMetadata.values()].map(record=>record.path));
 for(const path of entryMap.keys())if(path.startsWith('assets/audio/')&&!usedAudioPaths.has(path))throw new Error(`Archive contains unreferenced audio asset "${path}".`);
 if(project.releaseArtwork&&!manifest.artwork)throw new Error('Project references album artwork that is missing from the archive.');
 const readArtwork=async(record,label)=>{
  if(!record)return null;
  if(typeof record.path!=='string'||!record.path.startsWith('assets/artwork/')||!Number.isSafeInteger(record.size)||record.size<1||record.size>25*1024*1024||!/^[a-f0-9]{64}$/.test(record.sha256))throw new Error(`${label} manifest record is invalid.`);
  assertSafePath(record.path);
  const data=extracted[record.path];if(!data||data.byteLength!==record.size||await sha256(data)!==record.sha256)throw new Error(`${label} is missing or failed SHA-256 verification.`);
  if(!['image/jpeg','image/png'].includes(record.mime)||record.name!==undefined&&(typeof record.name!=='string'||record.name.length>255))throw new Error(`${label} metadata must specify a JPEG or PNG and a valid filename.`);
  if(!validImageBytes(data,record.mime))throw new Error(`${label} content does not match its declared image type.`);
  if(verifiedContent.get(record.path)!==record.sha256)throw new Error(`${label} checksum does not match the archive file manifest.`);
  return makeNamedBlob(data,record);
 };
 const makeNamedBlob=(data,record)=>{
  const name=record.name||'cover';
  if(typeof File==='function')return new File([data],name,{type:record.mime});
  const blob=new Blob([data],{type:record.mime});blob.name=name;return blob;
 };
 let artworkFile=null,artworkSourceFile=null;
 if(manifest.artwork){
  artworkFile=await readArtwork(manifest.artwork,'Album artwork');
 }
 if(manifest.artworkSource)artworkSourceFile=await readArtwork(manifest.artworkSource,'Original album artwork');
 const usedArtworkPaths=new Set([manifest.artwork?.path,manifest.artworkSource?.path].filter(Boolean));
 for(const path of entryMap.keys())if(path.startsWith('assets/artwork/')&&!usedArtworkPaths.has(path))throw new Error(`Archive contains unreferenced artwork "${path}".`);
 const presetFiles=new Map();
 const usedPresetPaths=new Set();
 for(const preset of manifest.presets||[]){
  if(typeof preset?.name!=='string'||typeof preset?.path!=='string'||!preset.path.startsWith('presets/'))throw new Error('Archive preset record is invalid.');
  if(usedPresetPaths.has(preset.path)||presetFiles.has(preset.name))throw new Error('Archive contains duplicate preset records.');
  assertSafePath(preset.path);const data=extracted[preset.path];if(!data)throw new Error(`Archive is missing preset "${preset.name}".`);
  const parsed=parseJson(data,`Preset "${preset.name}"`);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`Preset "${preset.name}" is invalid.`);
  usedPresetPaths.add(preset.path);presetFiles.set(preset.name,parsed);
 }
 for(const path of entryMap.keys())if(path.startsWith('presets/')&&!usedPresetPaths.has(path))throw new Error(`Archive contains an unreferenced preset "${path}".`);
 if(signal?.aborted)throw signal.reason||new DOMException('Archive import cancelled.','AbortError');
 return{project,assetFiles,assetMetadata,artworkFile,artworkSourceFile,presetFiles,manifest,entries:entryMap};
}

export function createReleaseZip(files,{signal,onProgress=()=>{}}={}){
 if(!files||typeof files!=='object'||!files['metadata.json']||!files['release-info.txt'])throw new TypeError('Release ZIP requires metadata.json and release-info.txt.');
 return Promise.resolve().then(async()=>{
  if(signal?.aborted)throw signal.reason||new DOMException('Release package cancelled.','AbortError');
  onProgress({stage:'zip',progress:.1,message:'Preparing release package…'});
  const safeFiles={};
  for(const[path,value]of Object.entries(files)){assertSafePath(path);if(value instanceof Uint8Array)safeFiles[path]=value;else if(value instanceof ArrayBuffer)safeFiles[path]=new Uint8Array(value);else throw new TypeError(`Release package entry "${path}" must be binary data.`)}
  const archive=await zipFiles(safeFiles,{signal,onProgress});
  if(archive.byteLength>MAX_EHS_ARCHIVE_BYTES)throw new RangeError('Release package exceeds the 256 MiB compressed size limit.');
  if(signal?.aborted)throw signal.reason||new DOMException('Release package cancelled.','AbortError');
  onProgress({stage:'zip',progress:1,message:'Release package ready.'});
  return new Blob([archive],{type:'application/zip'});
 });
}

export function inspectZipEntries(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 return zipCentralDirectory(bytes).map(({path,compressedSize,uncompressedSize,method})=>({path,compressedSize,uncompressedSize,method}));
}
