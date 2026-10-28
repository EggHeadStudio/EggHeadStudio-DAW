import {AudioEngine,createTrackEffect} from '../src/audio.js';
import {createProjectTrack} from '../src/project-state.js';
import {createInstrumentClip} from '../src/instrument-clips.js';
import {duplicateClip} from '../src/arrangement.js';
import {encodeExport} from '../src/export.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {instrumentFixture,instrumentBuffers} from './instrument-fixture.js';

const check=(condition,message)=>{if(!condition)throw new Error(message)};
const waitFor=async(predicate)=>{
  const deadline=performance.now()+30000;
  while(!predicate()){if(performance.now()>deadline)throw new Error(`Timed out: ${predicate}`);await new Promise(resolve=>setTimeout(resolve,25))}
};
const read=()=>JSON.parse(localStorage.getItem('pulse-project'));
const inputArchive=blob=>{
  const transfer=new DataTransfer();transfer.items.add(new File([blob],'acceptance.ehs'));
  const input=document.querySelector('#importEhs');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
};

export async function runCleanInstrumentAcceptance(){
  await waitFor(()=>document.querySelector('#toast')?.textContent.startsWith('Ready.'));
  check(localStorage.getItem('pulse-project')===null,'Use a new browser profile: autosave is not empty.');
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pulse-studio-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const assetCount=await new Promise((resolve,reject)=>{const request=db.transaction('assets').objectStore('assets').count();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  check(assetCount===0,'Use a new browser profile: asset library is not empty.');
  db.close();
  const {project,sampler,id}=instrumentFixture(),context=new OfflineAudioContext(2,44100,44100),buffers=instrumentBuffers(context);
  project.name='Clean browser instrument acceptance';project.schemaVersion=2;
  const bass=createProjectTrack({name:'Bass',color:'#77bdb2',type:'sampler',assetId:'tone',duration:1},'bass',{instrumentClipModel:true});
  const clip=createInstrumentClip(bass,0,id,{name:'Bass pattern'});
  bass.patterns[0].notes.push({id:id(),beat:0,midi:48,durationBeats:1,velocity:.7});
  project.tracks.push(bass);duplicateClip(project.tracks,sampler.id,sampler.clips[0].id,120,id,true);
  const compressor=createTrackEffect('compressor','bass-sidechain');
  compressor.params.sidechain={enabled:true,sourceTrackId:'drums',position:'pre',ghost:true,detectorGain:0,lowCut:0};
  bass.fx.effects=[compressor];project.mastering={outputGainDb:-3,limiter:{enabled:true,ceiling:-1}};
  project.releaseMetadata={title:'Clean browser song',artist:'Acceptance fixture'};
  const archive=await createPortableProjectArchive(project,{audioBuffers:buffers}),original=await openPortableProjectArchive(archive);
  inputArchive(archive);
  await waitFor(()=>document.querySelector('#toast').textContent.startsWith('Portable project opened'));
  const restored=read();
  check(restored.schemaVersion===2&&restored.tracks.length===4,'Schema or tracks were not restored.');
  for(const track of project.tracks){
    const saved=restored.tracks.find(item=>item.id===track.id);
    check(JSON.stringify(saved.patterns)===JSON.stringify(track.patterns),`Pattern data changed on ${track.id}.`);
    check(JSON.stringify(saved.clips)===JSON.stringify(track.clips),`Clip data changed on ${track.id}.`);
  }
  document.querySelector('[data-track="1"]').click();document.querySelector('#openPiano').click();
  const name=document.querySelector('#patternName');name.value='Edited in clean browser';name.dispatchEvent(new Event('change',{bubbles:true}));
  const lane=document.querySelector('.piano-lane[data-midi="67"]'),rect=lane.getBoundingClientRect();
  lane.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:rect.left+50,clientY:rect.top+8}));
  document.querySelector('#backArrange').click();
  const originalClick=HTMLAnchorElement.prototype.click;let secondArchive=null;
  try{
    HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.ehs')){fetch(this.href).then(response=>response.blob()).then(blob=>secondArchive=blob);return}originalClick.call(this)};
    document.querySelector('#saveEhs').click();await waitFor(()=>secondArchive!==null);
  }finally{HTMLAnchorElement.prototype.click=originalClick}
  const second=await openPortableProjectArchive(secondArchive);
  const hashes=portable=>[...portable.assetMetadata.values()].map(record=>record.sha256).sort();
  check(JSON.stringify(hashes(original))===JSON.stringify(hashes(second)),'Audio asset hashes changed.');
  document.querySelector('#toast').textContent='';
  inputArchive(secondArchive);await waitFor(()=>document.querySelector('#toast').textContent.startsWith('Portable project opened'));
  const reopened=read(),edited=reopened.tracks[1].patterns.find(pattern=>pattern.name==='Edited in clean browser');
  check(edited?.notes.some(note=>note.midi===67),'Second archive lost continued pattern edits.');
  const shared=reopened.tracks[1].clips.filter(item=>item.patternId===edited.id);
  check(shared.length===2,'Linked references were not retained.');
  document.querySelector('#play').click();await waitFor(()=>document.querySelector('#elapsedTime').textContent!=='00:00.000');document.querySelector('#stop').click();
  const decodedBuffers=new Map();
  for(const [asset,file]of second.assetFiles)decodedBuffers.set(asset,await context.decodeAudioData(await file.arrayBuffer()));
  const engine=new AudioEngine(),rendered=await engine.render(reopened,decodedBuffers),exports=[];
  for(const format of ['wav','mp3']){
    const output=await encodeExport(rendered,{format,bitDepth:24,bitrate:320,sampleRate:44100,channels:2,dither:false});
    const decoded=await context.decodeAudioData(await output.blob.arrayBuffer());let peak=0,square=0;
    for(let channel=0;channel<decoded.numberOfChannels;channel++)for(const value of decoded.getChannelData(channel)){peak=Math.max(peak,Math.abs(value));square+=value*value}
    const rms=Math.sqrt(square/(decoded.length*decoded.numberOfChannels));
    check(decoded.numberOfChannels===2&&decoded.sampleRate===44100&&rms>.005&&peak<1,`${format} decoded audio is invalid.`);
    exports.push({format,bytes:output.blob.size,duration:decoded.duration,channels:decoded.numberOfChannels,sampleRate:decoded.sampleRate,rms,peak});
  }
  const beforeFailure=JSON.stringify(read());
  document.querySelector('#toast').textContent='';inputArchive(new Blob(['not a ZIP']));
  await waitFor(()=>document.querySelector('#toast').textContent.startsWith('Could not open portable project'));
  check(JSON.stringify(read())===beforeFailure,'Invalid archive replaced the active project.');
  return{browser:navigator.userAgent,initialAssets:assetCount,initialAutosaveEmpty:true,schema:reopened.schemaVersion,container:second.manifest.formatVersion,firstBytes:archive.size,secondBytes:secondArchive.size,hashes:hashes(second),linkedReferences:shared.length,continuedEditing:true,invalidImportPreservedProject:true,exports,clipId:clip.id};
}
