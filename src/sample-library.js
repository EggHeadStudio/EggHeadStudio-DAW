import {unzipSync} from '../vendor/fflate/fflate.js';
import {inspectZipEntries} from './portable-project.js';

export const SAMPLE_LIBRARY_KEY='pulse-sample-library-v1';
export const SAMPLE_PACK_MAX_ARCHIVE_BYTES=128*1024*1024;
export const SAMPLE_PACK_MAX_UNCOMPRESSED_BYTES=128*1024*1024;
export const SAMPLE_PACK_MAX_ENTRIES=4096;
const AUDIO_EXTENSION=/\.(wav|mp3|ogg|m4a|aac|flac)$/i;

export function normalizeLibraryPath(path=''){
  if(typeof path!=='string')throw new TypeError('Folder path must be text.');
  const parts=path.replace(/\\/g,'/').split('/').filter(Boolean);
  if(parts.some(part=>part==='.'||part==='..'||part.includes('\0')))throw new Error('Unsafe sample-library folder path.');
  return parts.join('/');
}

export function createSampleLibrary(value){
  const state={version:1,folders:[],assets:{},expanded:{},selected:'Factory'};
  if(!value||value.version!==1)return state;
  state.folders=[...new Set((Array.isArray(value.folders)?value.folders:[]).map(normalizeLibraryPath).filter(Boolean))];
  for(const[id,record]of Object.entries(value.assets||{})){
    if(typeof id!=='string'||!record||typeof record!=='object')continue;
    state.assets[id]={folder:normalizeLibraryPath(record.folder||''),...(typeof record.sha256==='string'?{sha256:record.sha256}:{})};
  }
  state.expanded=Object.fromEntries(Object.entries(value.expanded||{}).filter(([,expanded])=>typeof expanded==='boolean'));
  state.selected=typeof value.selected==='string'?value.selected:'Factory';
  return state;
}

export function libraryFolderForAsset(asset,state){
  if(asset.factory){
    if(asset.category)return normalizeLibraryPath(asset.category);
    const path=String(asset.path||'').replace(/^Factory\s*\/?\s*/i,'').replace(/\s*\/\s*/g,'/');
    return normalizeLibraryPath(path.split('/').slice(0,-1).join('/'));
  }
  return normalizeLibraryPath(state.assets[asset.id]?.folder??String(asset.path||'').replace(/\s*\/\s*/g,'/').replace(/[^/]+$/,''));
}

export function registerLibraryAsset(state,id,{folder='',sha256}={}){
  if(typeof id!=='string'||!id)throw new TypeError('Sample asset identity is required.');
  const normalized=normalizeLibraryPath(folder);
  state.assets[id]={folder:normalized,...(sha256?{sha256}:{})};
  for(let parent=normalized;parent;parent=parent.slice(0,parent.lastIndexOf('/'))){
    if(!state.folders.includes(parent))state.folders.push(parent);
    if(!parent.includes('/'))break;
  }
  return state.assets[id];
}

export function findLibraryDuplicate(state,sha256,exceptId=null){
  if(typeof sha256!=='string'||!sha256)return null;
  return Object.entries(state.assets).find(([id,record])=>id!==exceptId&&record.sha256===sha256)?.[0]||null;
}

export function renameLibraryFolder(state,folder,name){
  const source=normalizeLibraryPath(folder),label=String(name).trim();
  if(!source||!state.folders.includes(source))throw new Error('Choose an existing User Library folder.');
  if(!label||/[\\/\\0]/.test(label)||label==='.'||label==='..')throw new Error('Folder name must be a non-empty name without path separators.');
  const parent=source.includes('/')?source.slice(0,source.lastIndexOf('/')):'',target=parent?`${parent}/${label}`:label;
  if(state.folders.some(path=>path===target||path.startsWith(`${target}/`))&&target!==source)throw new Error('A folder with that name already exists.');
  replaceFolderPrefix(state,source,target);return target;
}

export function moveLibraryFolder(state,folder,parent=''){
  const source=normalizeLibraryPath(folder),destination=normalizeLibraryPath(parent);
  if(!source||!state.folders.includes(source))throw new Error('Choose an existing User Library folder.');
  if(destination&&!state.folders.includes(destination))throw new Error('Choose an existing destination folder.');
  if(destination===source||destination.startsWith(`${source}/`))throw new Error('A folder cannot be moved inside itself.');
  const name=source.split('/').at(-1),target=destination?`${destination}/${name}`:name;
  if(target!==source&&state.folders.some(path=>path===target||path.startsWith(`${target}/`)))throw new Error('A folder with that name already exists at the destination.');
  replaceFolderPrefix(state,source,target);return target;
}

function replaceFolderPrefix(state,source,target){
  state.folders=[...new Set(state.folders.map(path=>path===source?target:path.startsWith(`${source}/`)?`${target}${path.slice(source.length)}`:path))];
  for(const record of Object.values(state.assets))if(record.folder===source||record.folder.startsWith(`${source}/`))record.folder=`${target}${record.folder.slice(source.length)}`;
  for(const key of Object.keys(state.expanded))if(key===source||key.startsWith(`${source}/`)){const next=`${target}${key.slice(source.length)}`;state.expanded[next]=state.expanded[key];delete state.expanded[key]}
}

export function removeLibraryFolder(state,folder){
  const source=normalizeLibraryPath(folder);
  if(!source||!state.folders.includes(source))throw new Error('Choose an existing User Library folder.');
  const parent=source.includes('/')?source.slice(0,source.lastIndexOf('/')):'';
  for(const record of Object.values(state.assets))if(record.folder===source||record.folder.startsWith(`${source}/`))record.folder=parent;
  state.folders=state.folders.filter(path=>path!==source&&!path.startsWith(`${source}/`));
  for(const key of Object.keys(state.expanded))if(key===source||key.startsWith(`${source}/`))delete state.expanded[key];
  if(state.selected===source||state.selected.startsWith(`${source}/`))state.selected=parent||'User';
  return parent;
}

export function moveLibraryAsset(state,id,folder=''){
  if(!state.assets[id])throw new Error('The sample is not in the User Library.');
  const target=normalizeLibraryPath(folder);
  if(target&&!state.folders.includes(target))throw new Error('Create the destination folder before moving the sample.');
  state.assets[id].folder=target;
  return target;
}

export function buildLibraryTree(assets,state){
  const roots={Factory:{name:'Factory Library',children:{},assets:[]},User:{name:'User Library',children:{},assets:[]}};
  const node=(root,path)=>{
    let current=root;
    const parts=path.split('/').filter(Boolean);
    for(let index=0;index<parts.length;index++){
      const segment=parts[index];
      current.children[segment]||={name:segment,path:'',children:{},assets:[]};
      current=current.children[segment];current.path=parts.slice(0,index+1).join('/');
    }
    return current;
  };
  for(const folder of state.folders)node(roots.User,folder);
  for(const asset of assets){
    const root=asset.factory?roots.Factory:roots.User,path=libraryFolderForAsset(asset,state),parent=path?node(root,path):root;
    parent.assets.push(asset);
  }
  return roots;
}

function crc32(bytes){
  let value=0xffffffff;
  for(const byte of bytes){
    value^=byte;
    for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
  }
  return(value^0xffffffff)>>>0;
}

export async function unpackSamplePack(file,{signal,onProgress=()=>{}}={}){
  if(!file||typeof file.arrayBuffer!=='function')throw new TypeError('Choose a ZIP sample pack.');
  if(file.size>SAMPLE_PACK_MAX_ARCHIVE_BYTES)throw new RangeError('Sample pack exceeds the 128 MiB compressed size limit.');
  if(signal?.aborted)throw signal.reason||new DOMException('Sample pack import cancelled.','AbortError');
  const bytes=new Uint8Array(await file.arrayBuffer()),entries=inspectZipEntries(bytes,{
    allowDirectories:true,maxArchiveBytes:SAMPLE_PACK_MAX_ARCHIVE_BYTES,
    maxUncompressedBytes:SAMPLE_PACK_MAX_UNCOMPRESSED_BYTES,maxEntries:SAMPLE_PACK_MAX_ENTRIES,maxCompressionRatio:100
  });
  const audioEntries=entries.filter(entry=>!entry.directory&&AUDIO_EXTENSION.test(entry.path));
  if(!audioEntries.length)throw new Error('The ZIP contains no supported audio samples.');
  if(audioEntries.some(entry=>entry.uncompressedSize>64*1024*1024))throw new RangeError('A sample-pack audio file exceeds the 64 MiB per-file limit.');
  const extracted=unzipSync(bytes),files=[];
  for(const [index,entry]of audioEntries.entries()){
    if(signal?.aborted)throw signal.reason||new DOMException('Sample pack import cancelled.','AbortError');
    const contents=extracted[entry.path];
    if(!contents||contents.byteLength!==entry.uncompressedSize||crc32(contents)!==entry.crc)throw new Error(`Sample pack entry "${entry.path}" failed size or CRC validation.`);
    const fileName=entry.path.split('/').at(-1),folder=entry.path.split('/').slice(0,-1).join('/');
    files.push({file:new File([contents],fileName,{type:audioMime(fileName)}),folder});
    onProgress({completed:index+1,total:audioEntries.length,path:entry.path});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  return files;
}

function audioMime(name){
  const extension=name.slice(name.lastIndexOf('.')+1).toLowerCase();
  return({wav:'audio/wav',mp3:'audio/mpeg',ogg:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac'})[extension]||'application/octet-stream';
}
