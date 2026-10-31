import {AudioEngine,uid,encodeWav,toWav,download,processSample,drawWave,createTrackEffect,clipDurationSeconds,estimateProjectRender} from './audio.js';
import {detectPitch,snapBeats} from './music.js';
import {renderSamplerHTML,wireSamplerUI} from './sampler-ui.js';
import {renderDrumRackHTML,wireDrumRackUI} from './drum-rack-ui.js';
import {normalizeDrumRack} from './drum-pads.js';
import {SampleEditor,renderSampleStudioHTML,wireSampleStudio,drawSampleStudioWave,stopSampleStudioPreview,toggleSampleStudioPreview,sampleStudioPreviewPlaying} from './sample-editor.js';
import {ArrangementHistory,copyTimeRange,pasteTimeRange,duplicateClip,moveClipTo,splitClipAtTime} from './arrangement.js';
import {createInstrumentClip,isInstrumentClip,instrumentType,makePatternIndependent,migrateInstrumentArrangement,patternForClip} from './instrument-clips.js';
import {selectedPatternContext,setPatternLength} from './pattern-editor.js';
import {TimelineScale,anchoredTimelineScrollLeft,formatTransportTime,playheadBeatAtSeconds,timelineBeatsAtClientX as timelineBeatsAtScale,timelineContentOrigin,timelinePixelsAtClientX} from './timeline.js';
import {createEmptyProject,createProjectTrack,deleteProjectTrack,DEFAULT_MASTER_SETTINGS,normalizeArrangementLoop,normalizeProjectSchema,parseProject,planProjectReset,serializeProject} from './project-state.js';
import {createEmptySampleSession,resolveRecordingChunks,shouldConfirmSampleDiscard} from './sample-lifecycle.js';
import {DEFAULT_MASTERING_SETTINGS,MASTERING_PRESETS,analyzeMasterBufferAsync,normalizeMasteringSettings,createMasteringGraph} from './mastering.js';
import {loudnessMatchGainDb,stereoMonitorMatrix} from './mastering-dsp.js';
import {encodeExport,exportMemoryWarning,estimateExportMemory,normalizeExportSettings} from './export.js';
import {EXPORT_BITRATES,EXPORT_SAMPLE_RATES} from './export-dsp.js';
import {createPortableProjectArchive,getProjectAssetIds,openPortableProjectArchive,createReleaseZip} from './portable-project.js';
import {addId3v23Metadata,addWavInfoMetadata,normalizeReleaseMetadata,validateReleaseMetadata} from './release-metadata.js';
import {mountArrangementWorkspace} from './arrangement-workspace.js';
import {showTrackSetup} from './track-ui.js';
import {RecordingStudio} from './recording-studio.js';
import {saveProjectSnapshot} from './project-storage.js';
import {mountProjectControls,mountArrangementChrome,enhanceDeviceChain} from './workspace-ui.js';
import {EFFECT_CONTROLS,captureDeviceUi,restoreDeviceUi} from './device-ui.js';
import {mountTransportShortcuts} from './transport-shortcuts.js';
import {updateTrackMeters} from './meter-ui.js';
import {organizeExportStudio,organizeInstrumentStudio,organizeMasteringStudio,organizeSampleStudio} from './studio-workflows.js';
import {mountMasterEq,mountTrackEqs} from './eq-workspace.js';
import {WorkspaceNavigation,mountMobileShell,syncMobileShell,mountExpandedEditors,closeExpandedEditor} from './mobile-workspace.js';
import {closeMobileFocus,mountMobileFocus,mobileFocusStage} from './mobile-focus.js';
import {mountPianoPerformance,mountDrumPerformance} from './mobile-performance.js';
import {mountPwaUpdates} from './pwa-updates.js';
const workspaceNavigation=new WorkspaceNavigation();
const HIDDEN_LIBRARY_ASSETS_KEY='pulse-hidden-library-assets-v1';
function loadHiddenLibraryAssets(){
 try{
  const saved=JSON.parse(localStorage.getItem(HIDDEN_LIBRARY_ASSETS_KEY)||'[]');
  return new Set(Array.isArray(saved)?saved.filter(id=>typeof id==='string'):[]);
 }catch(error){console.warn('Could not restore hidden sample-library entries.',error);return new Set()}
}
const hiddenLibraryAssets=loadHiddenLibraryAssets();
const navigationBlocked=()=>recordingStudio.busy||sampleCapturePending||recorder?.state==='recording';
const navigationWarning=()=>notify('Finish or recover the current recording before switching workspaces. Your audio is preserved.');
function navigateWorkspace(next){
 if(navigationBlocked()){navigationWarning();return}
 if(next==='keys'||next==='rack'){
  const type=next==='keys'?'sampler':'drumRack';
  if(!project.tracks[selectedTrack]?.[type]){
   const index=project.tracks.findIndex(track=>track[type]);if(index>=0)selectedTrack=index;
  }
 }
 closeExpandedEditor({focus:false});closeMobileFocus({restoreFocus:false});workspaceNavigation.sync(view);
 if(workspaceNavigation.visit(next)){view=next;render()}
}
function mobileBack(){
 if(navigationBlocked()){navigationWarning();return}
 closeMobileFocus({restoreFocus:false});
 const previous=workspaceNavigation.back();if(previous){view=previous;render()}
}
let eqEditors=[];
function disposeEqEditors(){eqEditors.forEach(editor=>editor.dispose());eqEditors=[]}
function refreshEqEditors(){eqEditors.forEach(editor=>editor.refresh())}
const arrangementWorkspaceState={selection:null,insertionBeat:0,selectMode:false,clipMode:null,follow:false,browserOpen:true,mixerOpen:true,devicesOpen:true};
let arrangementWorkspace=null;
const $=s=>document.querySelector(s),app=$('#app'),engine=new AudioEngine(),arrangementHistory=new ArrangementHistory();let project={id:uid(),schemaVersion:1,name:'Untitled Project',bpm:120,loop:false,loopStart:0,loopEnd:4,patternBeats:64,releaseMetadata:{},exportSettings:normalizeExportSettings(),tracks:['Drums','Bass','Synth','Audio'].map((name,i)=>({id:uid(),name,volume:.85,pan:0,mute:false,solo:false,color:['#df8c72','#77bdb2','#9b91dc','#d3b66c'][i],clips:[],fx:{filterType:'lowpass',cutoff:20000,resonance:.7,delay:0,delayTime:.25,feedback:.25}})),mastering:normalizeMasteringSettings(DEFAULT_MASTERING_SETTINGS)},assets=new Map(),buffers=new Map(),folderHandle=null,selectedTrack=0,selectedClip=null,playhead=0,recordStream=null,recorder=null,chunks=[],recordBlob=null,recordBuffer=null,sampleEditor=null,savedSampleId=null,previewSource=null,previewCursorFrame=0,previewRaf=0,recordingRaf=0,recordingStartedAt=0,recordingAnalyser=null,recordingSource=null,recordingToken=0,projectDirty=false,view='arrange',zoom=1,snapGrid=.25,arrangementClipboard=null,masteringPreview=null,masteringPreviewRevision=0,masteringRevision=0,masteringAB='B',masteringPlayback=null,masteringPausedOffset=0,masterLevelMatch=true,masterMonitorMode='stereo',masterSpectrumPeak=null,masterSpectrumHoldTime=0,masteringAnalysisController=null,exportController=null,exportRun=null,exportDownloadUrl=null,releaseZipController=null,releaseArtworkBlob=null,releaseArtworkSourceBlob=null,releaseArtworkUrl=null;
let portableImportController=null;
let sampleCapturePending=false;
let sampleCaptureFinalizing=false,projectImportPending=false,sampleLoadPending=false,sampleSavePending=false,assetImportPending=false;
let pointerGesturePending=false,keyboardGesturePending=false;
let portableExportController=null;
let recoverySnapshot=null;
let renderedWorkspace=null,transportPending=false;
const portableBufferDigests=new WeakMap();
const dbp=new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('assets');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const recordingStudio=new RecordingStudio({engine,getProject:()=>project,assets,buffers,save,notify,
 storeAsset:async(id,file,buffer)=>{await dbSet(id,file);buffers.set(id,buffer);assets.set(id,{id,name:file.name,path:file.name,size:file.size,duration:buffer.duration})},
 createTrack:()=>{const track=createProjectTrack({name:`Recording ${project.tracks.length+1}`,color:'#db8a70'},uid());project.tracks.push(track);save();return track},
 openSample:openInstrumentSample,
 openArrangement:(trackId,clipId)=>{selectedTrack=project.tracks.findIndex(track=>track.id===trackId);selectedClip=clipId;view='arrange';render()},
 onBusy:busy=>{for(const element of document.querySelectorAll('header button,header input,nav button'))element.disabled=busy;const stop=$('#stop');if(stop)stop.disabled=false;syncMobileShell(app,view,{canBack:workspaceNavigation.history.length>0,busy})}
});
engine.onError=error=>{notify(error.message);if($('#play'))$('#play').textContent='▶';if(recordingStudio.busy)recordingStudio.finish()};
async function toggleWorkspacePlayback(){
 if(transportPending)return;
 if(recordingStudio.busy||recorder?.state==='recording'){notify('Space/Play does not control microphone recording. Use the recording Finish/Stop controls.');return}
 transportPending=true;
 try{
  if(view==='sample'){await toggleSampleStudioPreview();return}
  if(view==='master'){
   if(masteringPlayback){masteringPausedOffset=masteringPosition();stopMasteringPlayback(false)}
   else{await playMasteringBuffer(masteringPausedOffset);masteringPausedOffset=0}
   return;
  }
  if(engine.playing){playhead=engine.position();engine.stop();$('#play').textContent='▶'}
  else{await engine.play(view==='recording'?recordingStudio.playbackProject():project,buffers,playhead);$('#play').textContent='Ⅱ'}
 }finally{transportPending=false;updateTransportButton()}
}
function updateTransportButton(){
 const play=$('#play');if(!play)return;
 const playing=view==='sample'?sampleStudioPreviewPlaying():view==='master'?Boolean(masteringPlayback):engine.playing;
 const workspace=view==='sample'?'sample preview':view==='master'?'mastering preview':view==='recording'?'backing tracks':'Arrangement';
 const text=playing?'Ⅱ':'▶',label=`${playing?'Pause':'Play'} ${workspace}`;
 if(play.textContent!==text)play.textContent=text;
 if(play.title!==label){play.title=label;play.setAttribute('aria-label',label)}
}
mountTransportShortcuts(document,{toggle:toggleWorkspacePlayback,blocked:()=>recordingStudio.busy||recorder?.state==='recording',
 onBlocked:()=>notify('Space is disabled during microphone recording. Use Finish/Stop; the take is preserved.'),
 onError:error=>notify(`Playback failed: ${error.message}`)});
window.addEventListener('beforeunload',event=>{if(recordingStudio.busy){event.preventDefault();event.returnValue='A recording or buffered take is not saved.'}});
document.addEventListener('pointerdown',event=>{pointerGesturePending=Boolean(event.target?.closest?.('#app'))},{capture:true});
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,()=>{pointerGesturePending=false},{capture:true});
document.addEventListener('keydown',event=>{if(event.key!=='Tab'&&event.target?.closest?.('#app'))keyboardGesturePending=true},{capture:true});
document.addEventListener('keyup',()=>{keyboardGesturePending=false},{capture:true});
document.addEventListener('click',event=>{if(event.target?.closest?.('#finishRecord')&&recorder?.state==='recording')sampleCaptureFinalizing=true},{capture:true});
function pwaUpdateBlockers(){
 const blockers=[];
 if(recordingStudio.busy||sampleCapturePending||sampleCaptureFinalizing||recorder?.state==='recording')blockers.push('Finish or cancel the active recording first.');
 if(sampleEditor&&!savedSampleId)blockers.push('Save or discard the current unsaved sample edits first.');
 if(projectDirty)blockers.push('Save or export the project before updating; there are unsaved changes.');
 if(projectImportPending||portableImportController)blockers.push('Wait for the project import to finish.');
 if(portableExportController)blockers.push('Wait for the .EHS export to finish.');
 if(sampleSavePending)blockers.push('Wait for the sample save to finish.');
 if(exportController||releaseZipController||masteringAnalysisController)blockers.push('Wait for the audio render/export to finish or cancel it.');
 if(sampleLoadPending||assetImportPending)blockers.push('Wait for the sample import to finish.');
 if(pointerGesturePending||keyboardGesturePending)blockers.push('Finish the current edit gesture first.');
 if(engine.playing||masteringPlayback||sampleStudioPreviewPlaying())blockers.push('Stop audio playback before updating.');
 return blockers;
}
async function dbSet(k,v){const db=await dbp;return new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error)})}async function dbGet(k){const db=await dbp;return new Promise((res,rej)=>{const t=db.transaction('assets');const r=t.objectStore('assets').get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbSetMany(entries){const db=await dbp;return new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite'),store=tx.objectStore('assets');for(const[key,value]of entries)value===null?store.delete(key):store.put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Asset cache transaction was aborted.'))})}
function notify(s){$('#toast').textContent=s;$('#toast').classList.add('show');setTimeout(()=>$('#toast')?.classList.remove('show'),3500)}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function captureProjectSnapshot(markDirty=true){project.id ||= uid();normalizeProjectSchema(project);project.modifiedAt=new Date().toISOString();project.releaseMetadata=normalizeReleaseMetadata(project.releaseMetadata,project);project.masterSettings={...engine.masterSettings};project.mastering=normalizeMasteringSettings(engine.masteringSettings);if(engine.playing){const playback=recordingStudio.busy?recordingStudio.playbackProject():project;engine.syncTracks(playback.tracks,project.bpm);engine.updatePlayback(playback,buffers)}if(markDirty)projectDirty=true;return serializeProject(project)}
function save(markDirty=true){
 if(markDirty&&view!=='master'){masteringPreview=null;masteringPausedOffset=0}
 try{
  saveProjectSnapshot(localStorage,captureProjectSnapshot(markDirty),recoverySnapshot);recoverySnapshot=null;
  const state=$('#projectSaveState');if(state)state.textContent=projectDirty?'Unsaved changes':'Saved locally';
 }catch(error){
  projectDirty=true;const state=$('#projectSaveState');if(state)state.textContent='Local save failed';
  notify(`Local project save failed: ${error.message}. Changes remain in this tab; export JSON or .EHS before closing.`);
  throw error;
 }
}
function barSeconds(){return 240/project.bpm}
function beatsWidth(){return 156*zoom}
function timelineScale(){return new TimelineScale(project.bpm,beatsWidth()/4)}
function timelineBeatsAtClientX(clientX){return timelineBeatsAtScale(clientX,$('#ruler'),$('.arrangement'),timelineScale())}
function timelineTimeAtClientX(clientX,grid=0){return Math.max(0,snapBeats(timelineBeatsAtClientX(clientX),grid)*60/project.bpm)}
function clipWidth(c){return Math.max(1,timelineScale().timeToPixels(clipDurationSeconds(c,project.bpm)))}
function setArrangementZoom(value,anchorClientX){const arrangement=$('.arrangement'),ruler=$('#ruler');if(!arrangement||!ruler){zoom=value;render();return}const anchor=anchorClientX??arrangement.getBoundingClientRect().left+arrangement.clientWidth/2,anchorBeat=Math.max(0,timelineScale().pixelsToBeats(timelinePixelsAtClientX(anchor,ruler,arrangement)));zoom=Math.max(.4,Math.min(4,value));render();const nextArrangement=$('.arrangement'),nextRuler=$('#ruler');if(nextArrangement&&nextRuler){const rulerContentLeft=nextRuler.getBoundingClientRect().left+nextArrangement.scrollLeft;nextArrangement.scrollLeft=anchoredTimelineScrollLeft(anchorBeat,anchor,rulerContentLeft,timelineScale().pixelsPerBeat)}}
function shell(){app.innerHTML=`<header><div class="brand"><span class="logo">◉</span><b>EggHeadStudio</b><span>DAW</span></div><input id="projectName" value="${esc(project.name)}" aria-label="Project name"><div class="transport"><button id="toStart" title="Back to start" aria-label="Back to start">⏮</button><button id="play" class="primary" title="Play Arrangement" aria-label="Play Arrangement">▶</button><button id="stop" title="Stop Playback" aria-label="Stop Playback">■</button><span class="clock" id="clock">1.1.1</span><label>BPM <input id="bpm" type="number" min="40" max="240" value="${project.bpm}" aria-label="Project tempo in BPM"></label><button id="loop" class="${project.loop?'active':''}" aria-label="Toggle arrangement loop">↻ Loop</button></div><div class="actions"><button id="newProject" title="Create an Empty Project" aria-label="New Project">New Project</button><button id="saveProject" title="Save project metadata locally">Save Locally</button><button id="saveEhs" title="Download the complete portable .ehs project">Save .EHS</button><button id="openProject" title="Open a legacy JSON project">Open JSON</button><button id="openEhs" title="Open a portable .ehs project">Open .EHS</button><button id="exportMix" title="Open Export Studio">Export Audio</button><span id="projectSaveState" role="status">${projectDirty?'Unsaved changes':'Saved locally'}</span></div></header><nav><button data-view="arrange" class="selected">▥ Arrangement</button><button data-view="sample">◉ Sample Studio</button><button data-view="master">▤ Mastering</button><button data-view="export">⇩ Export Studio</button><span class="grow"></span><span id="status">Local-first · Browser audio</span></nav><main id="main"></main><footer><span>EggHeadStudio DAW • Prototype v0.1</span><span id="footerInfo">Ready</span></footer><div id="toast" role="status"></div><input id="importProject" type="file" accept="application/json,.json" hidden><input id="importEhs" type="file" accept=".ehs,application/vnd.eggheadstudio.project+zip,application/zip" hidden><input id="artworkFile" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" hidden><input id="importFiles" type="file" accept="audio/*,.wav,.mp3,.ogg,.m4a" multiple hidden><input id="importFolder" type="file" webkitdirectory directory multiple hidden><dialog id="newProjectDialog" class="new-project-dialog" aria-labelledby="newProjectTitle"><h2 id="newProjectTitle">Start a New Project?</h2><p id="newProjectMessage">Your project has unsaved changes. Save a JSON copy before creating an empty project, discard changes, or cancel.</p><div class="new-project-actions"><button id="saveAndNew">Save Current Project</button><button id="discardAndNew" class="accent">Discard Changes</button><button id="cancelNewProject">Cancel</button></div></dialog>`;wireShell();render()}
document.addEventListener('change',event=>{if(event.target?.id==='snapGrid'){snapGrid=+event.target.value;$$('.lane').forEach(lane=>lane.style.backgroundSize=`${beatsWidth()*(snapGrid||.0625)/4}px 100%`)}});
function saveProjectFile(serialized=serializeProject(project),name=project.name){download(new Blob([serialized],{type:'application/json'}),`${name.replace(/[^\w-]/g,'_')||'Untitled_Project'}.json`);projectDirty=false;const state=$('#projectSaveState');if(state)state.textContent='JSON project exported'}
function archiveStatus(message){const footer=$('#footerInfo');if(footer)footer.textContent=message}
function artworkKeys(forProject=project){const id=String(forProject.id||'project');return{current:forProject.releaseArtwork?.key||`${id}:artwork`,source:forProject.releaseArtwork?.sourceKey||`${id}:artwork-source`}}
function audioBlobName(blob,name){if(!blob||!name||blob.name===name)return blob;if(typeof File==='function')return new File([blob],name,{type:blob.type||'application/octet-stream'});Object.defineProperty(blob,'name',{value:name,configurable:true});return blob}
async function savePortableProject(){
 if(releaseZipController||portableExportController||portableImportController)return notify('Wait for the current archive operation to finish or cancel it first.');
 const controller=new AbortController();portableExportController=controller;
 const cancel=document.createElement('button');cancel.textContent='Cancel project export';cancel.onclick=()=>controller.abort();
 document.querySelector('footer').append(cancel);
 const replacementButtons=['#newProject','#openProject','#openEhs','#saveEhs'].map(selector=>$(selector));
 replacementButtons.forEach(button=>button.disabled=true);
 try{
  const snapshot=JSON.parse(captureProjectSnapshot(false)),ids=getProjectAssetIds(snapshot),assetFiles=new Map();
  for(const id of ids){const blob=await dbGet(id);if(blob)assetFiles.set(id,blob)}
  const keys=artworkKeys(),artworkFile=await dbGet(keys.current),artworkSourceFile=await dbGet(keys.source);
  let customPresets={};
  try{
   const presets=JSON.parse(localStorage.getItem('pulse-master-presets')||'{}');
   if(!presets||typeof presets!=='object'||Array.isArray(presets))throw new Error('Stored presets are not an object.');
   customPresets=presets;
  }catch(error){throw new Error(`Could not read custom mastering presets: ${error.message}`)}
  const estimatedBytes=[...assetFiles.values()].reduce((sum,file)=>sum+(file.size||0),0)+(artworkFile?.size||0)+(artworkSourceFile?.size||0);
  if(estimatedBytes>192*1024*1024&&!window.confirm(`The portable archive will include about ${Math.ceil(estimatedBytes/1024/1024)} MiB of source audio/artwork in memory. Continue?`))return;
  archiveStatus('Packaging portable project…');
  const archive=await createPortableProjectArchive(snapshot,{assetFiles,audioBuffers:buffers,artworkFile,artworkSourceFile,presets:customPresets,signal:controller.signal,onProgress:status=>archiveStatus(status.message)});
  const filename=`${snapshot.name.replace(/[^\w-]/g,'_')||'Untitled_Project'}.ehs`;
  download(archive,filename);const unchanged=serializeProject(project)===serializeProject(snapshot);if(unchanged)projectDirty=false;
  const state=$('#projectSaveState');if(state)state.textContent=unchanged?'Portable project exported':'Earlier snapshot exported; newer changes unsaved';
  archiveStatus('Ready');notify(`Portable project saved · ${filename} · ${(archive.size/1024/1024).toFixed(1)} MiB.`);
 }catch(error){archiveStatus('Ready');notify(error.name==='AbortError'?'Portable project export cancelled. No archive was downloaded.':`Portable project export failed: ${error.message}`)}
 finally{cancel.remove();replacementButtons.forEach(button=>button.disabled=recordingStudio.busy);portableExportController=null}
}
async function importPortableProject(file){
 if(portableExportController){notify('Finish or cancel the portable project export before opening a project.');return}
 if(portableImportController){notify('A portable project is already being opened. Cancel it or wait for it to finish.');return}
 if(projectDirty&&!window.confirm('The current project has unsaved changes. Opening this portable project replaces the active arrangement. Continue?'))return;
 const controller=new AbortController();portableImportController=controller;
 const cancel=document.createElement('button');cancel.textContent='Cancel project import';cancel.onclick=()=>controller.abort();
 document.querySelector('footer').append(cancel);
 const replacementButtons=['#newProject','#openProject','#openEhs','#saveEhs'].map(selector=>$(selector));
 replacementButtons.forEach(button=>button.disabled=true);
 archiveStatus('Validating portable project…');
 try{
  const archive=await openPortableProjectArchive(file,{signal:controller.signal,onProgress:status=>archiveStatus(status.message)}),stagedBuffers=new Map(),stagedAssets=new Map(),writes=[],idRemap=new Map(),decodedByHash=new Map(),ctx=await engine.init();
  for(const[id,blob]of archive.assetFiles){
   controller.signal.throwIfAborted();
   archiveStatus(`Restoring audio ${stagedAssets.size+1}/${archive.assetFiles.size}…`);
   const bytes=await blob.arrayBuffer();let finalId=id,existing=await dbGet(id),reusableBuffer=null;
   if(existing){
    const newBytes=new Uint8Array(bytes),record=archive.assetMetadata.get(id);
    const oldBytes=existing.size===newBytes.byteLength?new Uint8Array(await existing.arrayBuffer()):null;
    const oldDigest=oldBytes?new Uint8Array(await crypto.subtle.digest('SHA-256',oldBytes)):null;
    const oldHex=oldDigest?[...oldDigest].map(value=>value.toString(16).padStart(2,'0')).join(''):'';
    const same=oldHex===record?.sha256;
    // Edited PCM can differ from its saved WAV; reuse only known decodes.
    if(!same)finalId=uid();
    else if(portableBufferDigests.get(buffers.get(id))===record.sha256)reusableBuffer=buffers.get(id);
   }
   idRemap.set(id,finalId);
   const digest=archive.assetMetadata.get(id).sha256;
   let buffer=decodedByHash.get(digest)||reusableBuffer;
   if(!buffer)buffer=await ctx.decodeAudioData(bytes);
   controller.signal.throwIfAborted();
   portableBufferDigests.set(buffer,digest);
   decodedByHash.set(digest,buffer);
   stagedBuffers.set(finalId,buffer);
   const record=archive.assetMetadata.get(id),assetBlob=audioBlobName(blob,record?.name||`${id}.audio`);
   stagedAssets.set(finalId,{id:finalId,name:record?.name||assetBlob.name||'Sample',path:record?.name||assetBlob.name||'Sample',size:blob.size,duration:buffer.duration});
   writes.push([finalId,assetBlob]);
  }
  for(const track of archive.project.tracks){
   for(const clip of track.clips||[]){
    if(isInstrumentClip(clip))continue;
    const buffer=stagedBuffers.get(idRemap.get(String(clip.asset))||String(clip.asset));
    if(!buffer||clip.end>buffer.duration+1/buffer.sampleRate)throw new Error(`Clip "${clip.id||clip.asset}" extends beyond its packaged audio.`);
   }
   if(track.sampler?.asset){
    const buffer=stagedBuffers.get(idRemap.get(String(track.sampler.asset))||String(track.sampler.asset));
    const start=Number.isFinite(track.sampler.start)?track.sampler.start:0,end=Number.isFinite(track.sampler.end)?track.sampler.end:buffer?.duration;
    if(!buffer||start<0||end>buffer.duration+1/buffer.sampleRate||start>=end)throw new Error(`Sampler track "${track.name||track.id}" has an invalid sample range.`);
   }
  }
  const restored=normalizeProjectData({...archive.project,tracks:archive.project.tracks.map(track=>({...track,clips:(track.clips||[]).map(clip=>({...clip,...(clip.asset?{asset:idRemap.get(String(clip.asset))||clip.asset}:{})})),sampler:track.sampler?{...track.sampler,asset:track.sampler.asset?idRemap.get(String(track.sampler.asset))||track.sampler.asset:track.sampler.asset}:track.sampler,drumRack:track.drumRack?{...track.drumRack,pads:(track.drumRack.pads||[]).map(pad=>({...pad,asset:pad.asset?idRemap.get(String(pad.asset))||pad.asset:pad.asset}))}:track.drumRack}))});
  restored.id ||= uid();restored.releaseMetadata=normalizeReleaseMetadata(restored.releaseMetadata,restored);
  const artKeys={current:`${restored.id}:artwork`,source:`${restored.id}:artwork-source`};
  if(archive.artworkFile)restored.releaseArtwork={...(restored.releaseArtwork||{}),key:artKeys.current,sourceKey:artKeys.source};
  writes.push([artKeys.current,archive.artworkFile],[artKeys.source,archive.artworkSourceFile]);
  let portablePresets={};
  if(archive.presetFiles.size){
   try{portablePresets=JSON.parse(localStorage.getItem('pulse-master-presets')||'{}')}catch(error){throw new Error(`Could not merge custom mastering presets: ${error.message}`)}
   for(const[name,value]of archive.presetFiles){
    let target=name,index=2;
    while(portablePresets[target]&&JSON.stringify(portablePresets[target])!==JSON.stringify(value))target=`${name} (portable ${index++})`;
    portablePresets[target]=value;
    if(restored.mastering?.preset===name)restored.mastering.preset=target;
   }
  }
  controller.signal.throwIfAborted();cancel.disabled=true;archiveStatus('Saving verified project assets…');
  await dbSetMany(writes);
  saveProjectSnapshot(localStorage,serializeProject(restored),recoverySnapshot);recoverySnapshot=null;
  if(archive.presetFiles.size)try{localStorage.setItem('pulse-master-presets',JSON.stringify(portablePresets))}catch(error){notify(`Project opened, but custom presets could not be saved locally: ${error.message}`)}
  engine.stop(true);engine.setMaster({...DEFAULT_MASTER_SETTINGS,...restored.masterSettings});engine.setMastering(restored.mastering||DEFAULT_MASTERING_SETTINGS);
  resetArrangementEditing();project=restored;for(const[id,buffer]of stagedBuffers)buffers.set(id,buffer);for(const[id,asset]of stagedAssets)assets.set(id,asset);
  releaseArtworkBlob=archive.artworkFile;releaseArtworkSourceBlob=archive.artworkSourceFile;
  if(releaseArtworkUrl)URL.revokeObjectURL(releaseArtworkUrl);releaseArtworkUrl=releaseArtworkBlob?URL.createObjectURL(releaseArtworkBlob):null;
  projectDirty=false;selectedTrack=0;selectedClip=null;playhead=0;masteringPreview=null;view='arrange';shell();
  notify(`Portable project opened · ${archive.assetFiles.size} audio assets verified and restored.`);
 }catch(error){notify(error.name==='AbortError'?'Portable project import cancelled. The active project was not replaced.':`Could not open portable project: ${error.message}`)}
 finally{cancel.remove();replacementButtons.forEach(button=>button.disabled=false);portableImportController=null;archiveStatus('Ready')}
}
async function openJsonProject(file){
 if(projectDirty&&!window.confirm('The current project has unsaved changes. Open this JSON project anyway?'))return;
 projectImportPending=true;
 try{
  const parsed=normalizeProjectData(parseProject(await file.text()));
  engine.stop();resetArrangementEditing();project=parsed;
  engine.setMaster({...DEFAULT_MASTER_SETTINGS,...parsed.masterSettings});
  engine.setMastering(parsed.mastering||DEFAULT_MASTER_SETTINGS);
  await restoreAssets();save(false);projectDirty=false;shell();
  notify('JSON project loaded; samples not present in the local library may need relinking.');
 }catch(error){notify(error.message)}
 finally{projectImportPending=false}
}
function resetArrangementEditing(){arrangementHistory.clear();arrangementWorkspaceState.selection=null;arrangementWorkspaceState.clipboard=null;arrangementWorkspaceState.insertionBeat=0;arrangementWorkspaceState.clipMode=null;arrangementClipboard=null}
function resetTemporarySample(){recordingToken++;stopSampleStudioPreview();if(recorder?.state==='recording')cancelSampleRecording(true,false);sampleEditor=null;recordBuffer=null;recordBlob=null;savedSampleId=null;sampleFilename=createEmptySampleSession().filename}
function applyNewProject(choice){
 const plan=planProjectReset(project,choice);
 if(!plan.project)return false;
 if(plan.serialized)saveProjectFile(plan.serialized,project.name);
 engine.stop(true);engine.syncTracks([]);engine.setMaster({...DEFAULT_MASTER_SETTINGS});engine.setMastering(DEFAULT_MASTERING_SETTINGS);
 project=plan.project;projectDirty=false;selectedTrack=0;selectedClip=null;playhead=0;zoom=1;snapGrid=.25;arrangementClipboard=null;
 resetArrangementEditing();
 resetTemporarySample();save(false);view='arrange';shell();notify('Empty project created. Your sample library and folder access are preserved.');return true;
}
function openNewProjectDialog(){
 if(shouldConfirmSampleDiscard({hasBuffer:Boolean(sampleEditor),saved:Boolean(savedSampleId)})){
  if(!window.confirm('Unsaved Sample Studio edits are not part of project files and will be discarded. Continue?'))return;
 }
 if(!projectDirty){
  if(window.confirm('Create an empty project? The current project will be cleared.'))applyNewProject('discard');
  return;
 }
 const dialog=$('#newProjectDialog');
 dialog.showModal();
 $('#saveAndNew').onclick=()=>{dialog.close();applyNewProject('save')};
 $('#discardAndNew').onclick=()=>{dialog.close();applyNewProject('discard')};
 $('#cancelNewProject').onclick=()=>dialog.close();
}
function wireShell(){
 const recordingNavigation=document.createElement('button');recordingNavigation.dataset.view='recording';recordingNavigation.textContent='Recording Studio';document.querySelector('nav [data-view="sample"]').after(recordingNavigation);
 $('#clock').setAttribute('aria-label','Musical position (bar.beat.subdivision)');
 $('#clock').insertAdjacentHTML('afterend','<output id="elapsedTime" class="elapsed-time" aria-label="Arrangement time (minutes:seconds.milliseconds)" title="Arrangement position · minutes:seconds.milliseconds">00:00.000</output>');
 $('#elapsedTime').textContent=formatTransportTime(engine.position());
 $('#projectName').onchange=e=>{project.name=e.target.value;save()};
 $('#bpm').onchange=async e=>{const playing=engine.playing,beat=(playing?engine.position():playhead)*project.bpm/60;project.bpm=Math.max(40,Math.min(240,+e.target.value||120));playhead=beat*60/project.bpm;if(playing)engine.stop();engine.offset=playhead;engine.syncTracks(project.tracks,project.bpm);save();render();if(playing)try{await engine.play(project,buffers,playhead)}catch(error){notify(error.message)}};
 $('#loop').onclick=()=>{checkpointArrangement();project.loop=!project.loop;save();$('#loop').classList.toggle('active',project.loop);if(view==='arrange')render()};
 $('#newProject').onclick=openNewProjectDialog;
 $('#play').onclick=()=>toggleWorkspacePlayback().catch(error=>notify(error.message));
 $('#stop').onclick=()=>{if(recordingStudio.busy){if(recordingStudio.state==='requesting')recordingStudio.cancel();else recordingStudio.finish();return}if(view==='sample'){$('#stopPreview')?.click();return}if(view==='master'){stopMasteringPlayback();return}engine.stop();playhead=engine.offset;$('#play').textContent='▶';tick(playhead)};
 $('#toStart').onclick=()=>{if(recordingStudio.busy||recorder?.state==='recording'){notify('Finish microphone recording before returning to start.');return}if(view==='sample'){$('#stopPreview')?.click();return}if(view==='master'){stopMasteringPlayback();return}engine.stop(true);playhead=0;tick(0);$('#play').textContent='▶'};
 $('#saveProject').onclick=()=>saveProjectFile();
 $('#saveEhs').onclick=savePortableProject;
 $('#openEhs').onclick=()=>$('#importEhs').click();
 $('#importEhs').onchange=async event=>{const file=event.target.files?.[0];if(file)await importPortableProject(file);event.target.value=''};
 $('#openProject').onclick=()=>$('#importProject').click();
 $('#importProject').onchange=async e=>{const file=e.target.files?.[0];if(file)await openJsonProject(file);e.target.value=''};
 $('#exportMix').onclick=()=>openExportStudio();
 $$('[data-view]').forEach(b=>b.onclick=()=>navigateWorkspace(b.dataset.view));
 $('#importFiles').onchange=e=>{const files=[...e.target.files];e.target.value='';importFiles(files)};
 $('#importFolder').onchange=e=>importFiles([...e.target.files]);
 engine.onTick=t=>{playhead=t;tick(t);updateTransportButton()};
 engine.onMeter=meters=>updateTrackMeters(app,meters);
 engine.onEnd=()=>$('#play').textContent='▶';
 mountProjectControls(app);
 mountMobileShell(app,{navigate:navigateWorkspace,back:mobileBack,blocked:navigationBlocked,onBlocked:navigationWarning});
}
const $$=s=>[...document.querySelectorAll(s)];
async function addAsset(file){
 const path=file.webkitRelativePath||file.name;
 const existing=[...assets.values()].find(asset=>asset.name===file.name&&asset.path===path&&asset.size===file.size&&(asset.lastModified||0)===(file.lastModified||0));
 if(existing){if(hiddenLibraryAssets.has(existing.id)){const next=new Set(hiddenLibraryAssets);next.delete(existing.id);if(!persistHiddenLibraryAssets(next))throw new Error('The sample was already in the library, but its hidden state could not be updated.')}return existing.id}
 const bytes=await file.arrayBuffer(),ctx=await engine.init(),buffer=await ctx.decodeAudioData(bytes),id=uid();
 await dbSet(id,file);
 assets.set(id,{id,name:file.name,path,size:file.size,lastModified:file.lastModified||0,duration:buffer.duration});buffers.set(id,buffer);return id;
}
function persistHiddenLibraryAssets(next){
 try{localStorage.setItem(HIDDEN_LIBRARY_ASSETS_KEY,JSON.stringify([...next]));hiddenLibraryAssets.clear();for(const id of next)hiddenLibraryAssets.add(id);return true}
 catch(error){notify(`Could not update the sample library: ${error.message}`);return false}
}
async function importFiles(files){
 let imported=0,failed=0;assetImportPending=true;
 try{
  for(const file of files){
   if(!/\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(file.name)&&!file.type.startsWith('audio/'))continue;
   try{await addAsset(file);imported++}catch(error){failed++;console.warn(`Could not import ${file.name}.`,error)}
  }
  drawList($('#search')?.value||'');
  notify(`Imported ${imported} audio files${failed?`; ${failed} failed` : ''}. Files are cached locally.`);
 }finally{assetImportPending=false}
}
async function restoreAssets(){
 const ids=new Set(project.tracks.flatMap(track=>[...track.clips.map(clip=>clip.asset),track.sampler?.asset,...(track.drumRack?.pads||[]).map(pad=>pad.asset)].filter(Boolean)));
 for(const id of ids){
  if(buffers.has(id))continue;
  const file=await dbGet(id);
  if(file){try{const buffer=await(await engine.init()).decodeAudioData(await file.arrayBuffer());buffers.set(id,buffer);assets.set(id,{id,name:file.name||'Sample',duration:buffer.duration,path:file.webkitRelativePath||file.name,size:file.size,lastModified:file.lastModified||0})}catch(error){console.warn(`Could not restore sample ${file.name||id}.`,error)}}
 }
}
function normalizeProject(){project=normalizeProjectData(project)}
function normalizeProjectData(input){
 const project=structuredClone(input);
  normalizeArrangementLoop(project);project.id ||= uid();project.releaseMetadata=normalizeReleaseMetadata(project.releaseMetadata,project);project.bpm=Math.max(40,Math.min(240,Number(project.bpm)||120));project.patternBeats ||= 64;project.exportSettings=normalizeExportSettings(project.exportSettings);
  for(const track of project.tracks){
   track.clips ||= [];if(!track.patterns){track.pattern ||= {notes:[]};track.pattern.notes ||= []}
   if(!track.drumRack)continue;
   normalizeDrumRack(track,uid);
  }
  migrateInstrumentArrangement(project,uid);normalizeProjectSchema(project);
 return project;
}
function checkpointArrangement(){arrangementHistory.checkpoint(project.tracks,project)}
function commitArrangement(){save();render()}
function splitSelectedClip(){if(!selectedClip)return notify('Select a clip to split.');const track=project.tracks.find(item=>item.clips.some(clip=>clip.id===selectedClip)),clip=track?.clips.find(item=>item.id===selectedClip);if(!clip)return;const start=clip.bar*barSeconds(),end=start+clipDurationSeconds(clip,project.bpm);if(playhead<=start||playhead>=end)return notify('Move the playhead inside the selected clip to split it.');checkpointArrangement();const right=splitClipAtTime(project.tracks,track.id,selectedClip,playhead,project.bpm,uid);if(!right)return notify('Could not split the selected clip.');selectedClip=right.id;commitArrangement()}
function duplicateSelectedClip(shared=false){if(!selectedClip)return notify('Select a clip to duplicate.');const track=project.tracks.find(item=>item.clips.some(clip=>clip.id===selectedClip));if(!track)return;checkpointArrangement();const copy=duplicateClip(project.tracks,track.id,selectedClip,project.bpm,uid,shared===true);if(!copy){arrangementHistory.undo(project.tracks);return notify('Could not duplicate the selected clip.')}selectedClip=copy.id;commitArrangement()}
function deleteSelectedClip(){if(!selectedClip)return;checkpointArrangement();for(const track of project.tracks)track.clips=track.clips.filter(clip=>clip.id!==selectedClip);selectedClip=null;commitArrangement()}
function copySelectedClip(){const index=project.tracks.findIndex(track=>track.clips.some(clip=>clip.id===selectedClip)),clip=project.tracks[index]?.clips.find(clip=>clip.id===selectedClip);if(!clip)return notify('Select a clip to copy.');const start=clip.bar*4;arrangementWorkspaceState.clipboard=copyTimeRange(project.tracks,{startBeat:start,endBeat:start+clipDurationSeconds(clip,project.bpm)*project.bpm/60,firstTrack:index,lastTrack:index},project.bpm);arrangementWorkspaceState.clipboard.entries=arrangementWorkspaceState.clipboard.entries.filter(entry=>entry.clip.id===clip.id);arrangementClipboard=arrangementWorkspaceState.clipboard;notify('Clip copied.')}
function pasteClip(){const clipboard=arrangementWorkspaceState.clipboard||arrangementClipboard;if(!clipboard)return notify('Copy a clip before pasting.');try{pasteTimeRange(project.tracks,clipboard,arrangementWorkspaceState.insertionBeat,selectedTrack,uid,true);checkpointArrangement();const copies=pasteTimeRange(project.tracks,clipboard,arrangementWorkspaceState.insertionBeat,selectedTrack,uid);selectedClip=copies[0]?.id;commitArrangement()}catch(error){notify(error.message)}}
function openInstrumentClip(id=selectedClip,index=selectedTrack){
 const track=project.tracks[index];if(!track?.sampler&&!track?.drumRack)return notify('Select an instrument track first.');
 const clip=track.clips.find(clip=>clip.id===id&&isInstrumentClip(clip))||track.clips.find(isInstrumentClip);
 selectedTrack=index;selectedClip=clip?.id||null;view=track.drumRack?'rack':'keys';render();
}
function addPatternClip(index=selectedTrack,beat=arrangementWorkspaceState.insertionBeat,lengthBeats=16){
 const track=project.tracks[index];if(!track?.sampler&&!track?.drumRack)return notify('Select a Sampler or Drum Rack track first.');
 try{if(!Number.isFinite(lengthBeats)||lengthBeats<=0||lengthBeats>64)throw new Error('Pattern length must be greater than zero and at most 64 beats.');checkpointArrangement();const clip=createInstrumentClip(track,snapBeats(beat,snapGrid),uid,{name:`${track.name} ${track.patterns.length+1}`,lengthBeats});selectedTrack=index;selectedClip=clip.id;commitArrangement()}catch(error){notify(error.message)}
}
function choosePatternLength(index=selectedTrack){
 const dialog=document.createElement('dialog');dialog.className='track-setup';
 dialog.innerHTML='<form><h2>Create Pattern</h2><label>Length <select id="newPatternLength"><option value="4">1 bar (4 beats)</option><option value="8">2 bars (8 beats)</option><option value="16" selected>4 bars (16 beats)</option><option value="32">8 bars (32 beats)</option><option value="custom">Custom beats</option></select></label><label>Custom beats <input id="customPatternLength" type="number" min=".25" max="64" step=".25" value="16" disabled></label><p role="alert"></p><button type="button" data-cancel>Cancel</button><button type="submit">Create Pattern</button></form>';
 const select=dialog.querySelector('select'),input=dialog.querySelector('input');
 select.onchange=()=>input.disabled=select.value!=='custom';
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const length=select.value==='custom'?Number(input.value):Number(select.value);if(!Number.isFinite(length)||length<=0||length>64){dialog.querySelector('[role=alert]').textContent='Choose a length from 0.25 to 64 beats.';return}addPatternClip(index,arrangementWorkspaceState.insertionBeat,length);dialog.close()};
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
}
function unlinkSelectedPattern(){
 const track=project.tracks[selectedTrack],clip=track?.clips.find(clip=>clip.id===selectedClip);
 if(!isInstrumentClip(clip))return;
 checkpointArrangement();makePatternIndependent(track,clip,uid);save();render();
}
function undoArrangement(){if(arrangementHistory.undo(project.tracks,project)){selectedClip=null;commitArrangement()}}
function redoArrangement(){if(arrangementHistory.redo(project.tracks,project)){selectedClip=null;commitArrangement()}}
function moveArrangementTrack(id,direction){
 const index=project.tracks.findIndex(track=>track.id===id),destination=index+direction;
 if(index<0||destination<0||destination>=project.tracks.length)return;
 checkpointArrangement();
 const selectedId=project.tracks[selectedTrack]?.id,[track]=project.tracks.splice(index,1);
 project.tracks.splice(destination,0,track);selectedTrack=project.tracks.findIndex(track=>track.id===selectedId);
 arrangementWorkspaceState.selection=null;commitArrangement();
 $(`.track-label[data-track="${destination}"] .track-select`)?.focus({preventScroll:true});
}
document.addEventListener('keydown',event=>{if(view!=='arrange'||event.target.closest('dialog,.device-panel')||event.target.matches('input,select,textarea,[contenteditable="true"]'))return;if(arrangementWorkspace?.handleKey(event))return;const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();if(mod&&key==='z'){event.preventDefault();event.shiftKey?redoArrangement():undoArrangement()}else if(mod&&key==='y'){event.preventDefault();redoArrangement()}else if(mod&&key==='c'){event.preventDefault();copySelectedClip()}else if(mod&&key==='v'){event.preventDefault();pasteClip()}else if(mod&&key==='d'){event.preventDefault();duplicateSelectedClip()}else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelectedClip()}else if(key==='s'){event.preventDefault();splitSelectedClip()}});
function addArrangementControls(){
 const tools=$('.editor-tools');
 if(!tools)return;
 tools.insertAdjacentHTML('afterbegin',`<label class="snap-control">Snap <select id="snapGrid"><option value="4">1 bar</option><option value="2">1/2 bar</option><option value="1">1/4 note</option><option value="0.5">1/8 note</option><option value="0.25">1/16 note</option><option value="0.125">1/32 note</option><option value="0.0625">1/64 note</option><option value="0">Off</option></select></label><button id="openPiano">Open Editor</button><button id="splitClip">Split at playhead</button><button id="duplicateClip">Duplicate</button><button id="copyClip">Copy</button><button id="pasteClip">Paste</button><button id="undoArrangement" ${arrangementHistory.undoStack.length?'':'disabled'}>Undo</button><button id="redoArrangement" ${arrangementHistory.redoStack.length?'':'disabled'}>Redo</button>`);
 $('#snapGrid').value=String(snapGrid);
 $('#snapGrid').onchange=event=>snapGrid=Number(event.target.value);
 tools.insertAdjacentHTML('beforeend','<button id="linkedDuplicate">Linked Duplicate</button><button id="unlinkPattern">Make Independent</button>');
 $('#openPiano').textContent='Open Editor';$('#openPiano').onclick=()=>openInstrumentClip();
 $('#linkedDuplicate').onclick=()=>duplicateSelectedClip(true);
 $('#unlinkPattern').onclick=unlinkSelectedPattern;
 const footer=document.createElement('div');footer.className='track-row add-track-row';
 const add=$('#addTrack');add.textContent='+ Add Track';add.className='add-track-button';footer.append(add);$('.arrangement').append(footer);
  for(const [index,label]of $$('.track-label[data-track]').entries()){
   const button=document.createElement('button');button.textContent='Edit';button.dataset.trackSettings=String(index);button.title='Edit track name and color';button.setAttribute('aria-label',`Edit ${project.tracks[index].name} track settings`);
   button.onclick=event=>{event.stopPropagation();openTrackSetup('audio',project.tracks[index])};
   label.querySelector('.track-actions').append(button);
   if(project.tracks[index].sampler||project.tracks[index].drumRack){
    const pattern=document.createElement('button');pattern.textContent='+ Pattern';pattern.dataset.newPattern=String(index);pattern.onclick=event=>{event.stopPropagation();choosePatternLength(index)};label.append(pattern);
   }
  }
 $('#splitClip').onclick=splitSelectedClip;
 $('#duplicateClip').onclick=duplicateSelectedClip;
 $('#copyClip').onclick=copySelectedClip;
 $('#pasteClip').onclick=pasteClip;
 $('#undoArrangement').onclick=undoArrangement;
 $('#redoArrangement').onclick=redoArrangement;
 const arrangement=$('.arrangement');
 arrangement.addEventListener('drop',event=>{
  const lane=event.target.closest('.lane');
  if(!lane)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const bar=Math.max(0,snapBeats(timelineBeatsAtClientX(event.clientX),snapGrid)/4),id=event.dataTransfer.getData('text/sample'),clipId=event.dataTransfer.getData('text/clip'),targetTrack=project.tracks[Number(lane.dataset.lane)];
  if(id){placeClip(id,Number(lane.dataset.lane),bar);return}
  if(clipId&&targetTrack){try{checkpointArrangement();if(moveClipTo(project.tracks,clipId,targetTrack.id,bar)){selectedClip=clipId;commitArrangement()}}catch(error){notify(error.message)}}
 },true);
}
function openTrackSetup(type='audio',track=null){
 showTrackSetup({track,type,number:project.tracks.length+1,assets,buffers,onSubmit:settings=>{
  if(track){track.name=settings.name;track.color=settings.color;save();render();return}
  if(settings.type==='sampler'){createSamplerTrack(settings.assetId,settings);return}
  if(settings.type==='drumRack'){createDrumRack(settings.assetId,settings);return}
  project.tracks.push(createProjectTrack(settings,uid(),{instrumentClipModel:true}));normalizeProject();selectedTrack=project.tracks.length-1;selectedClip=null;save();render();
 }});
}
function createSamplerTrack(assetId,settings={}){
 const asset=assets.get(assetId),buffer=buffers.get(assetId);
 if(assetId&&(!asset||!buffer))return notify('Import and decode that sample before creating a sampler.');
 const pitch=buffer&&detectPitch(buffer);
 project.tracks.push(createProjectTrack({name:`Sampler ${project.tracks.filter(track=>track.sampler).length+1}`,color:'#a58bdb',...settings,type:'sampler',assetId,duration:buffer?.duration||0,pitch},uid(),{instrumentClipModel:true}));
 normalizeProject();selectedTrack=project.tracks.length-1;selectedClip=null;save();view='keys';render();
 notify(pitch?`Sample root detected: ${pitch.name}.`:assetId?'Set the root key manually.':'Empty Sampler created. Choose a sample inside Sample Source.');
}
function createDrumRack(assetId=null,settings={}){
 const track=createProjectTrack({name:`Drum Rack ${project.tracks.filter(track=>track.drumRack).length+1}`,color:'#db8a70',...settings,type:'drumRack',assetId},uid(),{instrumentClipModel:true});
 if(assetId)track.drumRack.pads[0].name=assets.get(assetId)?.name.replace(/\.[^.]+$/,'')||'Pad 1';
 project.tracks.push(track);normalizeProject();selectedTrack=project.tracks.length-1;selectedClip=null;save();view='rack';render();
}
function renderKeys(){
 const source=project.tracks[selectedTrack];
 const track=source;
 if(track?.drumRack){view='rack';renderRack();return}
 if(!track?.sampler&&!track?.drumRack){$('#main').innerHTML='<section class="studio"><h2>Sampler / Piano Roll</h2><p>Select or create an instrument track from Arrangement.</p><button id="backArrange">Back to Arrangement</button></section>';$('#backArrange').onclick=()=>{view='arrange';render()};return}
 const previous=$('#pianoScroll'),scroll=previous?{left:previous.scrollLeft,top:previous.scrollTop}:null;
 const context=instrumentEditorContext(source);
 selectedClip=context.clip?.id||null;
 $('#main').innerHTML=renderSamplerHTML(context.adapter,assets,buffers,snapGrid);
 wireSamplerUI($('#main'),{track:context.adapter,tracks:project.tracks,assets,buffers,engine,save:()=>{context.commit();save()},notify,preview:previewAsset,openSample:openInstrumentSample,grid:snapGrid,setGrid:value=>{snapGrid=value;renderKeys()},playhead:()=>context.localBeat(engine.position(),project.bpm)*60/project.bpm,position:seconds=>context.localBeat(seconds,project.bpm)*60/project.bpm,secondsPerBeat:60/project.bpm,back:()=>{view='arrange';render()}});
 mountPatternControls(context);
 mountInstrumentDevices();
 organizeInstrumentStudio($('#main'));
 if(scroll){$('#pianoScroll').scrollLeft=scroll.left;$('#pianoScroll').scrollTop=scroll.top}
 mountMobileEditors();
}
function renderRack(){
 const source=project.tracks[selectedTrack];if(!source?.drumRack){view='arrange';render();return}
 const context=instrumentEditorContext(source);
 selectedClip=context.clip?.id||null;
 $('#main').innerHTML=renderDrumRackHTML(context.adapter,assets);
 wireDrumRackUI($('#main'),{track:context.adapter,assets,buffers,engine,tracks:project.tracks,save:()=>{context.commit();save()},notify,preview:previewAsset,back:()=>{view='arrange';render()},refresh:renderRack});
 mountPatternControls(context);
 mountInstrumentDevices();
 organizeInstrumentStudio($('#main'));
 mountMobileEditors();
}
function mountMobileEditors(){
 workspaceNavigation.sync(view);
 mountExpandedEditors($('#main'),{blocked:navigationBlocked,onBlocked:navigationWarning,onChange:()=>syncMobileShell(app,view,{canBack:workspaceNavigation.history.length>0,busy:navigationBlocked()})});
 const root=$('#main'),track=project.tracks[selectedTrack];
 if(view==='keys')mountPianoPerformance(root,{track,buffers,engine,tracks:project.tracks,notify});
 if(view==='rack')mountDrumPerformance(root,{track,buffers,engine,tracks:project.tracks,notify,onSelectPad:padId=>{
  root.dispatchEvent(new CustomEvent('ehs-select-pad',{detail:{padId}}));
 }});
 const performanceButton=root.querySelector('.performance-mode-launch');
 mountMobileFocus(root,{workspace:view,onPerformance:performanceButton?{
  label:view==='keys'?'Open Piano Performance Mode':'Open Drum Pad Performance Mode',
  open:()=>performanceButton.click()
 }:null});
 syncMobileShell(app,view,{canBack:workspaceNavigation.history.length>0,busy:navigationBlocked()});
}
function instrumentEditorContext(track){
 if(track.clips.some(isInstrumentClip))return selectedPatternContext(track,selectedClip);
 return{adapter:{...track,pattern:{id:`${track.id}-empty-editor`,notes:[],lengthBeats:16}},clip:null,commit(){},localBeat:()=>0};
}
function mountInstrumentDevices(){
 const section=document.createElement('section');section.className='instrument-devices';
 const devices=document.createElement('button');devices.id='openTrackDevices';devices.textContent='Track effects & Mixer';
 devices.title='Open this track in Arrangement. Track effects are edited only in the Device Panel; volume and pan in the Mixer.';
 devices.onclick=()=>{arrangementWorkspaceState.devicesOpen=true;arrangementWorkspaceState.mixerOpen=true;view='arrange';render();$('#main .bottom-panel').scrollIntoView({block:'nearest'})};
 section.append(devices);$('#main .studio').append(section);
 const browser=document.createElement('details');browser.className='instrument-browser';browser.innerHTML='<summary>Sample Browser — drag samples to the source or a pad</summary><input id="search" aria-label="Search instrument samples" placeholder="Search samples…"><div id="sampleList"></div>';section.before(browser);drawList();$('#search').oninput=event=>drawList(event.target.value);
}
function openInstrumentSample(id){
 const buffer=buffers.get(id);if(!buffer)return notify('Select a loaded sample first.');
 if(shouldConfirmSampleDiscard({hasBuffer:Boolean(sampleEditor),saved:Boolean(savedSampleId)})&&!confirm('Discard the current unsaved sample and open this library sample?'))return;
 resetSampleEditor(buffer,assets.get(id)?.name||'Sample.wav');view='sample';render();
}
function mountPatternControls(context){
 if(!context.clip){
  const panel=document.createElement('div');panel.className='pattern-controls';panel.innerHTML='<p>No Arrangement pattern yet. Assign samples and preview the instrument, then create a pattern.</p><button id="emptyPattern">+ Pattern</button>';$('#main .section-title').after(panel);$('#emptyPattern').onclick=()=>choosePatternLength();
  for(const selector of ['.piano-toolbar','.piano-scroll','.drum-tools','.step-scroll']){const element=$(selector);if(element){element.hidden=true;element.inert=true}}
  return;
 }
 const {pattern,clip,shared}=context,track=project.tracks[selectedTrack],panel=document.createElement('div');panel.className='pattern-controls';
 panel.innerHTML=`<strong>Editing ${esc(pattern.name)}</strong><label>Pattern <select id="editorPattern">${track.clips.filter(isInstrumentClip).map(item=>`<option value="${esc(item.id)}" ${item.id===clip.id?'selected':''}>${esc(patternForClip(track,item).name)} @ bar ${item.bar+1}</option>`).join('')}</select></label><label>Name <input id="patternName" maxlength="80" value="${esc(pattern.name)}"></label><label>Length (beats) <input id="patternLength" type="number" min=".25" max="64" step=".25" value="${pattern.lengthBeats}"></label><span>${shared>1?`LINKED: ${shared} clips`:'Independent pattern'}</span><button id="editorUnlink" ${shared<2?'disabled':''}>Make Independent</button>`;
 $('#main .section-title').after(panel);
 $('#editorPattern').onchange=event=>{selectedClip=event.target.value;render()};
 $('#patternName').onchange=event=>{const name=event.target.value.trim();if(!name){notify('Pattern name cannot be empty.');return}checkpointArrangement();pattern.name=name;save();render()};
 $('#patternLength').onchange=event=>{try{const length=Number(event.target.value);const copy={...pattern};setPatternLength(copy,length);checkpointArrangement();const previous=pattern.lengthBeats;setPatternLength(pattern,length);if(clip.offsetBeats===0&&clip.durationBeats===previous){clip.durationBeats=length;delete clip.legacyTail}save();render()}catch(error){event.target.value=pattern.lengthBeats;notify(error.message)}};
 $('#editorUnlink').onclick=unlinkSelectedPattern;
}
function renderSamplerBlocks(){
 const elements=new Map($$('[data-clip]').map(element=>[element.dataset.clip,element]));
 project.tracks.forEach((track,index)=>{
  for(const clip of track.clips.filter(isInstrumentClip)){
   const element=elements.get(clip.id),pattern=patternForClip(track,clip);if(!element||!pattern)continue;
   element.classList.add('instrument-clip');element.querySelector('span').textContent=`${pattern.name}${clip.loop?' · LOOP':''}${track.clips.filter(item=>item.patternId===pattern.id).length>1?' · LINKED':''}`;
   element.setAttribute('aria-label',`${pattern.name}, ${track.drumRack?'Drum Rack':'Sampler'} clip`);element.tabIndex=0;
   element.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();openInstrumentClip(clip.id,index)}};
  }
 });
}
function render(){
 workspaceNavigation.sync(view);
 closeMobileFocus({restoreFocus:false});
 if(renderedWorkspace!==view){
  closeExpandedEditor({focus:false});
  stopLibraryPreview();
  if(renderedWorkspace==='sample')stopSampleStudioPreview();
  if(renderedWorkspace==='master')stopMasteringPlayback();
  if(view==='sample'&&engine.playing){playhead=engine.position();engine.stop();$('#play').textContent='▶'}
  renderedWorkspace=view;
 }
 disposeEqEditors();
 const deviceUi=view==='arrange'?captureDeviceUi($('#main')):null;
 const scroll=$('.arrangement'),scrollLeft=scroll?.scrollLeft||0,scrollTop=scroll?.scrollTop||0;
 $$('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 if(view==='arrange'){
  renderArrange();$$('.lane').forEach(lane=>lane.style.backgroundSize=`${beatsWidth()*(snapGrid||.0625)/4}px 100%`);renderSamplerBlocks();addArrangementControls();
  arrangementWorkspace=mountArrangementWorkspace({root:$('#main'),project,buffers,state:arrangementWorkspaceState,scale:timelineScale(),zoom,grid:()=>snapGrid,selectedTrack,selectedClip,checkpoint:checkpointArrangement,commit:commitArrangement,save,notify,idFactory:uid,render,openClip:openInstrumentClip,openClipEditor:(id,index)=>{selectedClip=id;selectedTrack=index;render();requestAnimationFrame(()=>$('.clip-device')?.scrollIntoView({behavior:'smooth',block:'nearest'}))},createClip:addPatternClip,selectTrack:selectArrangementTrack,selectClip:(id,index)=>{selectedClip=id;selectedTrack=index;render()},activateClip:(id,index)=>{selectedClip=id;selectedTrack=index},setZoom:setArrangementZoom,seek:async seconds=>{const playing=engine.playing;if(playing)engine.stop();playhead=seconds;engine.offset=seconds;tick(seconds);if(playing)try{await engine.play(project,buffers,seconds)}catch(error){notify(error.message)}},playFrom:async beat=>{try{playhead=beat*60/project.bpm;await engine.play(project,buffers,playhead)}catch(error){notify(error.message)}},copyClip:copySelectedClip,pasteClip,duplicateClip:duplicateSelectedClip,deleteClip:deleteSelectedClip});
  mountArrangementChrome({root:$('#main'),project,selectedTrack,selectedClip,state:arrangementWorkspaceState,addTrack:openTrackSetup,moveTrack:moveArrangementTrack,addEffect:type=>{arrangementWorkspaceState.devicesOpen=true;const select=$('#addTrackEffect');select.value=type;select.dispatchEvent(new Event('change',{bubbles:true}))},selectContext:(id,index)=>{selectedClip=id;selectArrangementTrack(index)}});
  restoreDeviceUi($('#main'),deviceUi);
  $('.arrangement').scrollLeft=scrollLeft;$('.arrangement').scrollTop=scrollTop;tick(playhead);
 }
 if(view==='sample')renderSampleBatch003();if(view==='master')renderMaster();if(view==='export')renderExport();if(view==='keys')renderKeys();if(view==='rack')renderRack();
 if(view==='recording')recordingStudio.mount($('#main'));
 mountMobileEditors();
 updateTransportButton();
}
function selectArrangementTrack(index){
 selectedTrack=index;
 if(!project.tracks[index]?.clips.some(clip=>clip.id===selectedClip))selectedClip=null;
 render();
}
function eqResponsePath(bands,sampleRate=48000,lowCut=20,highCut=20000){
 const width=420,height=120,minDb=-24,maxDb=24,points=[];
 const filterResponse=(type,frequency,cutoff)=>{
  const f=Math.max(0,Math.min(sampleRate/2-1,cutoff)),w=2*Math.PI*f/sampleRate,cos=Math.cos(w),alpha=Math.sin(w)/2;
  const b0=type==='highpass'?(1+cos)/2:(1-cos)/2,b1=type==='highpass'?-(1+cos):(1-cos),b2=b0,a0=1+alpha,a1=-2*cos,a2=1-alpha,omega=2*Math.PI*frequency/sampleRate;
  const numerator=Math.hypot(b0+b1*Math.cos(omega)+b2*Math.cos(2*omega),-b1*Math.sin(omega)-b2*Math.sin(2*omega));
  const denominator=Math.hypot(a0+a1*Math.cos(omega)+a2*Math.cos(2*omega),-a1*Math.sin(omega)-a2*Math.sin(2*omega));
  return 20*Math.log10(Math.max(1e-9,numerator/denominator));
 };
 for(let x=0;x<=width;x+=4){
  const frequency=20*1000**(x/width),omega=2*Math.PI*frequency/sampleRate;
  let response=filterResponse('highpass',frequency,lowCut)+filterResponse('lowpass',frequency,highCut);
  for(const band of bands){
   const f=Math.max(20,Math.min(20000,Number(band.frequency)||1000)),q=Math.max(.1,Number(band.q)||1),gain=Math.max(-24,Math.min(24,Number(band.gain)||0));
   const a=10**(gain/40),w0=2*Math.PI*f/sampleRate,alpha=Math.sin(w0)/(2*q),cos=Math.cos(w0);
   const b0=1+alpha*a,b1=-2*cos,b2=1-alpha*a,a0=1+alpha/a,a1=-2*cos,a2=1-alpha/a;
   const real=(b0+b1*Math.cos(omega)+b2*Math.cos(2*omega)),imag=(-b1*Math.sin(omega)-b2*Math.sin(2*omega));
   const denReal=a0+a1*Math.cos(omega)+a2*Math.cos(2*omega),denImag=(-a1*Math.sin(omega)-a2*Math.sin(2*omega));
   response+=20*Math.log10(Math.hypot(real,imag)/Math.max(1e-9,Math.hypot(denReal,denImag)));
  }
  const y=height-(Math.max(minDb,Math.min(maxDb,response))-minDb)/(maxDb-minDb)*height;
  points.push(`${x===0?'M':'L'}${x.toFixed(1)},${y.toFixed(1)}`);
 }
 return points.join(' ');
}
function renderTrackEffects(track){
 if(!track)return'<div class="effect-chain"><strong>No track selected</strong><p class="hint">Add a track to open its independent effect chain.</p></div>';
 const labels={eq:'Parametric EQ',compressor:'Compressor',delay:'Delay',reverb:'Reverb',saturation:'Saturation',limiter:'Limiter',utility:'Utility'};
 const controls=EFFECT_CONTROLS;
 const effects=track.fx?.effects||[];
 return `<div class="effect-chain"><div class="effect-chain-title"><strong>Track effects</strong><label>Add effect <select id="addTrackEffect"><option value="">Choose…</option>${Object.entries(labels).map(([type,label])=>`<option value="${type}">${label}</option>`).join('')}</select></label></div><div class="effect-presets"><label>Preset name <input id="effectPresetName" maxlength="60" placeholder="My chain"></label><button id="saveEffectPreset">Save preset</button><select id="effectPresetSelect" aria-label="Effect preset"><option value="">Choose preset…</option></select><button id="loadEffectPreset">Load preset</button></div>${effects.length?effects.map((effect,index)=>`<article class="effect-device"><header><label><input type="checkbox" data-effect-enabled="${index}" ${effect.enabled?'checked':''}> ${labels[effect.type]||esc(effect.type)}</label><div><button data-effect-up="${index}" ${index===0?'disabled':''} aria-label="Move effect up">↑</button><button data-effect-down="${index}" ${index===effects.length-1?'disabled':''} aria-label="Move effect down">↓</button><button data-effect-remove="${index}" aria-label="Remove effect">×</button></div></header>${effect.type==='eq'?`<svg class="eq-response" viewBox="0 0 420 120" role="img" aria-label="Equalizer frequency response"><path class="eq-zero" d="M0 60H420"/><path data-eq-response="${index}" d="${eqResponsePath(effect.params?.bands||[{frequency:effect.params?.frequency||1000,gain:effect.params?.gain||0,q:effect.params?.q||1},{frequency:500,gain:0,q:1},{frequency:2500,gain:0,q:1},{frequency:10000,gain:0,q:1}],engine.ctx?.sampleRate||48000,effect.params?.lowCut||20,effect.params?.highCut||20000)}"/></svg><label>Low-cut (Hz)<input type="range" min="20" max="20000" step="1" value="${effect.params?.lowCut??20}" data-effect-param="${index}" data-param="lowCut"><output>${Math.round(effect.params?.lowCut??20)}</output></label><label>High-cut (Hz)<input type="range" min="20" max="20000" step="1" value="${effect.params?.highCut??20000}" data-effect-param="${index}" data-param="highCut"><output>${Math.round(effect.params?.highCut??20000)}</output></label>${(effect.params?.bands||[{frequency:effect.params?.frequency??1000,gain:effect.params?.gain??0,q:effect.params?.q??1},{frequency:500,gain:0,q:1},{frequency:2500,gain:0,q:1},{frequency:10000,gain:0,q:1}]).map((band,bandIndex)=>`<fieldset class="eq-band"><legend>Band ${bandIndex+1}</legend>${[['frequency','Hz',20,20000,1],['gain','dB',-24,24,.5],['q','Q',.1,18,.1]].map(([key,label,min,max,step])=>`<label>${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${band[key]}" data-effect-param="${index}" data-eq-band="${bandIndex}" data-param="${key}"><output>${Number(band[key]).toFixed(key==='frequency'?0:1)}</output></label>`).join('')}</fieldset>`).join('')}`:(controls[effect.type]||[]).map(([key,label,min,max,step,scale])=>`<label>${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${Number(effect.params?.[key]??0)*(scale==='ms'?1000:1)}" data-scale="${scale==='ms'?'1000':'1'}" data-effect-param="${index}" data-param="${key}"><output>${Number(effect.params?.[key]??0)*(scale==='ms'?1000:1)}</output></label>`).join('')}${effect.type==='delay'?`<label>Tempo sync <input type="checkbox" data-effect-toggle="${index}" data-param="sync" ${effect.params?.sync?'checked':''}></label><label>Beat division <select data-effect-choice="${index}" data-param="division">${[[.25,'1/16'],[.5,'1/8'],[.75,'1/8 dotted'],[1,'1/4'],[1.5,'1/4 dotted'],[2,'1/2'],[4,'1 bar']].map(([value,label])=>`<option value="${value}" ${Number(effect.params?.division??1)===value?'selected':''}>${label}</option>`).join('')}</select></label>`:''}${effect.type==='utility'?`<label>Invert polarity <input type="checkbox" data-effect-toggle="${index}" data-param="invert" ${effect.params?.invert?'checked':''}></label>`:''}${effect.type==='compressor'?`<label class="reduction-meter">Gain reduction <output data-compressor-meter="${esc(effect.id)}" data-meter-track="${esc(track.id)}">0.0 dB</output></label>`:''}</article>`).join(''):'<p class="hint">Add an effect to process this track during playback and WAV export.</p>'}</div>`;
}
function renderArrange(){
 const t=project.tracks[selectedTrack];
 $('#main').innerHTML=`<section class="workspace"><aside class="browser"><div class="pane-head">SAMPLE BROWSER</div><div class="browser-actions"><button id="connectFolder">＋ Folder</button><button id="addFiles">＋ Files</button></div><input id="search" placeholder="Search samples…"><div class="sample-list" id="sampleList"></div><p class="hint">Drag samples to a track or click +. On mobile, + inserts at the snapped playhead on the selected Audio track.</p><button id="recordOwn" class="accent full">● Record Own Sample</button></aside><section class="editor"><div class="editor-tools"><button id="addTrack">＋ Track</button><button id="zoomOut">−</button><span>Zoom ${Math.round(zoom*100)}%</span><button id="zoomIn">＋</button><span class="grow"></span><span>Tap to select • Long-press or choose Move to drag</span></div><div class="arrangement"><div class="ruler-row"><div class="track-label">TRACKS</div><div class="ruler" id="ruler" style="width:${Math.max(1200,16*beatsWidth())}px">${Array.from({length:16},(_,i)=>`<span style="left:${timelineScale().barsToPixels(i)}px">${i+1}</span>`).join('')}</div></div>${project.tracks.map((tr,i)=>`<div class="track-row"><div class="track-label ${i===selectedTrack?'track-selected':''}" data-track="${i}"><strong style="color:${tr.color}">${esc(tr.name)}</strong><div class="track-actions"><button data-mute="${i}" class="${tr.mute?'active':''}">M</button><button data-solo="${i}" class="${tr.solo?'active':''}">S</button><button data-remove="${i}" title="Remove track">×</button></div></div><div class="lane" data-lane="${i}" style="width:${Math.max(1200,16*beatsWidth())}px;background-size:${beatsWidth()}px 100%">${tr.clips.map(c=>`<div class="clip ${selectedClip===c.id?'clip-selected':''}" draggable="true" data-clip="${c.id}" data-track-index="${i}" style="left:${timelineScale().barsToPixels(c.bar)}px;width:${clipWidth(c)}px;background:${tr.color}"><button type="button" class="clip-handle clip-handle-start" data-resize="start" aria-label="Trim ${esc(assets.get(c.asset)?.name||'clip')} start"></button><span>${esc(assets.get(c.asset)?.name||'Missing sample')}${c.loop?' · LOOP':''}</span><button type="button" class="clip-handle clip-handle-end" data-resize="end" aria-label="Trim ${esc(assets.get(c.asset)?.name||'clip')} end"></button></div>`).join('')}</div></div>`).join('')}<div class="playhead" id="playhead" role="slider" aria-label="Arrangement playhead" aria-valuemin="0" aria-valuenow="${playhead}" aria-valuetext="${playhead.toFixed(3)} seconds"></div></div><section class="bottom-panel"><div class="pane-head">MIXER & EFFECTS <span>Selected: ${esc(t?.name||'')}</span></div><div class="mixer">${project.tracks.map((tr,i)=>`<div class="mixer-strip"><div class="strip-title" style="color:${tr.color}">${esc(tr.name)}</div><label>Volume <input type="range" min="0" max="1.5" step=".01" value="${tr.volume}" data-vol="${i}"></label><label>Pan <input type="range" min="-1" max="1" step=".01" value="${tr.pan}" data-pan="${i}"></label><span>${Math.round(tr.volume*100)}%</span><div class="stereo-meter" data-meter="${esc(tr.id)}" data-track-name="${esc(tr.name)}" aria-label="${esc(tr.name)} stereo level"><span class="meter-channel"><i data-meter-left></i></span><span class="meter-channel"><i data-meter-right></i></span><b data-clip-warning hidden>CLIP</b></div></div>`).join('')}<div class="mixer-strip master-strip"><div class="strip-title">Master</div><label>Volume <input type="range" min="0" max="1.5" step=".01" value="${engine.masterSettings.volume??1}" id="masterVolume"></label><output id="masterVolumeValue">${Math.round((engine.masterSettings.volume??1)*100)}%</output></div></div><div class="device-panel">${renderTrackEffects(t)}<section class="clip-device"><strong>Clip Editor</strong><div id="clipEditor">${selectedClip?clipControls():'Select a clip to adjust trim, fades, loop and gain.'}</div></section></div></section></section></section>`;
 drawList();wireArrange();wireTrackEffects();tick(playhead);
}
function wireTrackEffects(){
 const track=project.tracks[selectedTrack];
 if(!track)return;
 track.fx ||= {filterType:'lowpass',cutoff:20000,resonance:.7,delay:0,delayTime:.25,feedback:.25};
 track.fx.effects ||= [];
 const compressorEffects=track.fx.effects.map((effect,index)=>({effect,index})).filter(item=>item.effect.type==='compressor');
 for(const {effect,index} of compressorEffects){
  effect.params.sidechain ||= {enabled:false,sourceTrackId:'',position:'pre',ghost:false,detectorGain:0,lowCut:0};
  const article=$('#main').querySelector(`[data-effect-enabled="${index}"]`)?.closest('.effect-device');
  if(!article)continue;
  const sidechain=effect.params.sidechain,section=document.createElement('fieldset');
  section.className='sidechain-controls';
  const legend=document.createElement('legend');legend.textContent='External sidechain';section.append(legend);
  const enabledLabel=document.createElement('label'),enabled=document.createElement('input');enabledLabel.className='sidechain-checkbox';
  enabled.type='checkbox';enabled.checked=Boolean(sidechain.enabled);enabled.dataset.sidechainToggle=String(index);enabledLabel.append(enabled,document.createTextNode(' Enable external detector'));section.append(enabledLabel);
  const sourceLabel=document.createElement('label');sourceLabel.textContent='Source track';
  const sourceSelect=document.createElement('select');sourceSelect.dataset.sidechainSource=String(index);sourceSelect.setAttribute('aria-label','Sidechain source track');
  sourceSelect.add(new Option('No source — compressor is not ducked',''));
  for(const candidate of project.tracks)if(candidate.id!==track.id)sourceSelect.add(new Option(candidate.name,candidate.id));
  sourceSelect.value=sidechain.sourceTrackId||'';sourceLabel.append(sourceSelect);section.append(sourceLabel);
  const positionLabel=document.createElement('label');positionLabel.textContent='Detector tap';
  const positionSelect=document.createElement('select');positionSelect.dataset.sidechainPosition=String(index);
  positionSelect.add(new Option('Pre-fader','pre'));positionSelect.add(new Option('Post-fader','post'));positionSelect.value=sidechain.position==='post'?'post':'pre';positionLabel.append(positionSelect);section.append(positionLabel);
  const ghostLabel=document.createElement('label'),ghost=document.createElement('input');ghostLabel.className='sidechain-checkbox';
  ghost.type='checkbox';ghost.checked=Boolean(sidechain.ghost);ghost.dataset.sidechainGhost=String(index);ghostLabel.append(ghost,document.createTextNode(' Ghost trigger (use source even when muted/unsoloed)'));section.append(ghostLabel);
  for(const [key,title,min,max,step] of [['detectorGain','Detector gain (dB)',-24,24,.5],['lowCut','Detector high-pass (Hz)',0,1000,10]]){
   const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');
   input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(Number(sidechain[key])||0);input.dataset.sidechainParam=String(index);input.dataset.param=key;
   const output=document.createElement('output');output.value=input.value;label.append(input,output);section.append(label);
  }
  if(sidechain.enabled&&sidechain.sourceTrackId&&!project.tracks.some(candidate=>candidate.id===sidechain.sourceTrackId)){
   const warning=document.createElement('p');warning.className='sidechain-warning';warning.textContent='The saved source track is missing. This compressor currently receives no external detector signal.';section.append(warning);
  }
  article.append(section);
 }
 const refresh=()=>{engine.syncTracks(project.tracks,project.bpm);save();refreshEqEditors()};
 const readPresets=()=>{const value=JSON.parse(localStorage.getItem('egghead-effect-presets')||'[]');if(!Array.isArray(value))throw new Error('Stored effect presets are invalid.');return value};
 const populatePresets=()=>{const select=$('#effectPresetSelect'),presets=readPresets();select.replaceChildren(new Option('Choose preset…',''));presets.forEach((preset,index)=>select.add(new Option(preset.name,String(index))))};
 try{populatePresets()}catch(error){notify(`Could not load effect presets: ${error.message}`)}
 $('#saveEffectPreset').onclick=()=>{const name=$('#effectPresetName').value.trim();if(!name)return notify('Enter a name for this effect preset.');try{const presets=readPresets();presets.push({name,effects:JSON.parse(JSON.stringify(track.fx.effects))});localStorage.setItem('egghead-effect-presets',JSON.stringify(presets));populatePresets();notify(`Saved effect preset “${name}”.`)}catch(error){notify(`Could not save effect preset: ${error.message}`)}};
 $('#loadEffectPreset').onclick=()=>{const value=$('#effectPresetSelect').value,index=Number(value);if(value===''||!Number.isInteger(index)||index<0)return notify('Choose an effect preset to load.');try{const preset=readPresets()[index];if(!preset||!Array.isArray(preset.effects)||preset.effects.some(effect=>!['eq','compressor','delay','reverb','saturation','limiter','utility'].includes(effect.type)||!effect.params||typeof effect.params!=='object'))throw new Error('Preset data is invalid.');track.fx.effects=JSON.parse(JSON.stringify(preset.effects));refresh();render()}catch(error){notify(`Could not load effect preset: ${error.message}`)}};
 $('#addTrackEffect').onchange=event=>{if(!event.target.value)return;track.fx.effects.push(createTrackEffect(event.target.value));refresh();render()};
 $$('[data-effect-enabled]').forEach(input=>input.onchange=()=>{track.fx.effects[+input.dataset.effectEnabled].enabled=input.checked;refresh()});
 $$('[data-sidechain-toggle]').forEach(input=>input.onchange=()=>{
  if(input.checked&&(typeof globalThis.AudioWorkletNode!=='function'||(engine.ctx&&!engine.sidechainReady))){input.checked=false;notify(engine.sidechainError?.message||'External sidechain compression is unavailable until its AudioWorklet processor initializes.');return}
  track.fx.effects[+input.dataset.sidechainToggle].params.sidechain.enabled=input.checked;refresh();
 });
 $$('[data-sidechain-source]').forEach(select=>select.onchange=()=>{track.fx.effects[+select.dataset.sidechainSource].params.sidechain.sourceTrackId=select.value;refresh()});
 $$('[data-sidechain-position]').forEach(select=>select.onchange=()=>{track.fx.effects[+select.dataset.sidechainPosition].params.sidechain.position=select.value;refresh()});
 $$('[data-sidechain-ghost]').forEach(input=>input.onchange=()=>{track.fx.effects[+input.dataset.sidechainGhost].params.sidechain.ghost=input.checked;refresh()});
 $$('[data-sidechain-param]').forEach(input=>input.oninput=()=>{
  const sidechain=track.fx.effects[+input.dataset.sidechainParam].params.sidechain;sidechain[input.dataset.param]=Number(input.value);
  input.nextElementSibling.value=input.value;refresh();
 });
 $$('[data-effect-remove]').forEach(button=>button.onclick=()=>{track.fx.effects.splice(+button.dataset.effectRemove,1);refresh();render()});
 $$('[data-effect-up],[data-effect-down]').forEach(button=>button.onclick=()=>{const from=Number(button.dataset.effectUp??button.dataset.effectDown),to=from+(button.hasAttribute('data-effect-up')?-1:1);[track.fx.effects[from],track.fx.effects[to]]=[track.fx.effects[to],track.fx.effects[from]];refresh();render()});
 $$('[data-effect-toggle]').forEach(input=>input.onchange=()=>{track.fx.effects[+input.dataset.effectToggle].params[input.dataset.param]=input.checked;refresh()});
 $$('[data-effect-choice]').forEach(select=>select.onchange=()=>{track.fx.effects[+select.dataset.effectChoice].params[select.dataset.param]=Number(select.value);refresh()});
 $$('[data-effect-param]').forEach(input=>input.oninput=()=>{
  const effect=track.fx.effects[+input.dataset.effectParam],key=input.dataset.param,value=Number(input.value)/Number(input.dataset.scale||1);
  if(effect.type==='eq'){
   if(input.dataset.eqBand!==undefined){effect.params.bands ||= [{frequency:effect.params.frequency??120,gain:effect.params.gain??0,q:effect.params.q??1},{frequency:500,gain:0,q:1},{frequency:2500,gain:0,q:1},{frequency:10000,gain:0,q:1}];effect.params.bands[Number(input.dataset.eqBand)][key]=value}
   else effect.params[key]=value;
   const response=$('#main').querySelector(`[data-eq-response="${input.dataset.effectParam}"]`);
   if(response)response.setAttribute('d',eqResponsePath(effect.params.bands,engine.ctx?.sampleRate||48000,effect.params.lowCut,effect.params.highCut));
  }else effect.params[key]=value;
  input.nextElementSibling.value=Number(input.value).toFixed(input.step.includes('.')?2:0);refresh();
 });
 enhanceDeviceChain($('#main'),track);
 eqEditors.push(...mountTrackEqs($('#main'),track,engine,persist=>{engine.syncTracks(project.tracks,project.bpm);if(persist)save()},error=>notify(`EQ visualization failed: ${error.message}`)));
}
function clipControls(){
 const c=project.tracks.flatMap(t=>t.clips).find(c=>c.id===selectedClip);if(!c)return '';
 const track=project.tracks.find(item=>item.clips.some(clip=>clip.id===selectedClip));
 const source=isInstrumentClip(c)?`<strong>${esc(patternForClip(track,c)?.name||'Pattern')}</strong><button id="openClipEditor">Open Editor</button><label>Duration (beats) <input id="instrumentDuration" type="number" min=".0625" step=".25" value="${c.durationBeats}"></label><label>Source offset (beats) <input id="instrumentOffset" type="number" min="0" step=".25" value="${c.offsetBeats}"></label>`:`<label>Start (s) <input id="clipStart" type="number" step=".01" min="0" value="${c.start.toFixed(2)}"></label><label>End (s) <input id="clipEnd" type="number" step=".01" min="0" value="${c.end.toFixed(2)}"></label><label>Speed <input id="clipRate" type="number" step=".05" min=".25" max="4" value="${c.rate||1}"></label><label>Fade in (s) <input id="clipFadeIn" type="number" step=".01" min="0" value="${c.fadeIn||0}"></label><label>Fade out (s) <input id="clipFadeOut" type="number" step=".01" min="0" value="${c.fadeOut||0}"></label>${c.loop?`<label>Loop duration (s) <input id="clipDuration" type="number" step=".01" min=".01" value="${clipDurationSeconds(c,project.bpm).toFixed(2)}"></label>`:''}`;
 return `<div class="clip-controls">${source}<label>Gain <input id="clipGain" type="number" step=".1" min="0" max="3" value="${c.gain??1}"></label><label>Loop <input id="clipLoop" type="checkbox" ${c.loop?'checked':''}></label><label>Move to track <select id="clipTrack">${project.tracks.filter(item=>instrumentType(item)===instrumentType(track)).map(item=>`<option value="${esc(item.id)}" ${item.id===track.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label><label>Start bar <input id="clipBar" type="number" min="0" step=".0625" value="${c.bar}"></label><button id="moveClip">Move clip</button><button id="deleteClip">Delete clip</button></div>`;
}
function assetReferenceCount(id){
 return project.tracks.reduce((count,track)=>count+track.clips.filter(clip=>clip.asset===id).length+(track.sampler?.asset===id?1:0)+(track.drumRack?.pads||[]).filter(pad=>pad.asset===id).length,0);
}
function removeAssetFromLibrary(id){
 const asset=assets.get(id);if(!asset)return;
 const references=assetReferenceCount(id),detail=references?`${references} active project reference${references===1?'':'s'} will remain intact.`:'No active project references were found.';
 if(!window.confirm(`Remove "${asset.name}" from the visible sample library? ${detail} This only hides the library entry; audio data and project playback are retained.`))return;
 const next=new Set(hiddenLibraryAssets);next.add(id);
 if(persistHiddenLibraryAssets(next)){drawList($('#search')?.value||'');notify('Sample hidden from the library. Existing project audio remains available.')}
}
function drawList(filter=''){
 const el=$('#sampleList');if(!el)return;
 const visible=[...assets.values()].filter(asset=>!hiddenLibraryAssets.has(asset.id)&&asset.name.toLowerCase().includes(filter.toLowerCase()));
 el.innerHTML=visible.map(asset=>`<div class="sample-item" draggable="true" data-asset="${esc(asset.id)}"><span title="${esc(asset.path)}">♫ ${esc(asset.name)}</span><button data-preview="${esc(asset.id)}" title="Preview" aria-label="Preview ${esc(asset.name)}">▶</button><button data-add="${esc(asset.id)}" title="Add to selected track" aria-label="Add ${esc(asset.name)} to selected track">＋</button><button data-remove-sample="${esc(asset.id)}" title="Hide from library; project audio is retained" aria-label="Remove ${esc(asset.name)} from visible library">×</button></div>`).join('')||'<div class="empty">No visible samples. Connect a folder or import files.</div>';
 $$('[data-preview]').forEach(button=>button.onclick=()=>previewAsset(button.dataset.preview));
 $$('[data-add]').forEach(button=>button.onclick=()=>insertSampleAtPlayhead(button.dataset.add));
 $$('[data-remove-sample]').forEach(button=>button.onclick=()=>removeAssetFromLibrary(button.dataset.removeSample));
 $$('[data-asset]').forEach(element=>element.ondragstart=event=>event.dataTransfer.setData('text/sample',element.dataset.asset));
}
function stopLibraryPreview(){const source=previewSource;previewSource=null;if(!source)return;source.onended=null;try{source.stop()}catch(error){if(error.name!=='InvalidStateError')throw error}source.disconnect()}
async function previewAsset(id){await engine.init();stopLibraryPreview();const b=buffers.get(id);if(!b)return notify('Missing sample');const s=engine.ctx.createBufferSource();s.buffer=b;s.connect(engine.ctx.destination);s.onended=()=>{s.disconnect();if(previewSource===s)previewSource=null};s.start();previewSource=s}
function placeClip(asset,trackIndex,bar){const b=buffers.get(asset);if(!b)return notify('Sample not loaded');if(!project.tracks[trackIndex]||instrumentType(project.tracks[trackIndex])!=='audio')return notify('Select an Audio track in Arrangement before adding this sample. The sample remains in the browser.');const clip={id:uid(),asset,bar:Math.max(0,bar),start:0,end:b.duration,rate:1,gain:1};checkpointArrangement();project.tracks[trackIndex].clips.push(clip);selectedTrack=trackIndex;selectedClip=clip.id;commitArrangement()}
function insertSampleAtPlayhead(asset){
 if(instrumentType(project.tracks[selectedTrack])!=='audio')return notify('Select an Audio track in Arrangement before adding this sample. The sample remains in the browser.');
 const beat=playheadBeatAtSeconds(playhead,project.bpm,snapGrid);
 arrangementWorkspaceState.insertionBeat=beat;
 placeClip(asset,selectedTrack,beat/4);
}
function wireArrange(){
 $$('[data-track]').forEach(row=>{const index=Number(row.dataset.track),actions=row.querySelector('.track-actions');actions?.insertAdjacentHTML('beforeend',`<button data-fx="${index}" title="Open Track Effects" aria-label="Open effects for ${esc(project.tracks[index].name)}">FX</button>`)});
 $$('[data-mute]').forEach(button=>{button.title='Mute Track — Silence this track';button.setAttribute('aria-label',`Mute ${project.tracks[Number(button.dataset.mute)].name}`);button.setAttribute('aria-pressed',String(project.tracks[Number(button.dataset.mute)].mute))});
 $$('[data-solo]').forEach(button=>{button.title='Solo Track — Listen to this track only';button.setAttribute('aria-label',`Solo ${project.tracks[Number(button.dataset.solo)].name}`);button.setAttribute('aria-pressed',String(project.tracks[Number(button.dataset.solo)].solo))});
 $$('[data-remove]').forEach(button=>{button.title='Delete Track';button.setAttribute('aria-label',`Delete ${project.tracks[Number(button.dataset.remove)].name}`)});
 $('#connectFolder').onclick=connectFolder;$('#addFiles').onclick=()=>$('#importFiles').click();$('#search').oninput=e=>drawList(e.target.value);$('#recordOwn').onclick=()=>{view='sample';render()};
 $('#addTrack').onclick=()=>openTrackSetup();
 $('#zoomIn').onclick=event=>setArrangementZoom(zoom*1.25,event.clientX);$('#zoomOut').onclick=event=>setArrangementZoom(zoom/1.25,event.clientX);
 $$('[data-track]').forEach(e=>e.onclick=()=>selectArrangementTrack(+e.dataset.track));
 $$('[data-mute]').forEach(b=>b.onclick=e=>{e.stopPropagation();const index=+b.dataset.mute;project.tracks[index].mute=!project.tracks[index].mute;engine.syncTracks(project.tracks);save();selectArrangementTrack(index)});
 $$('[data-solo]').forEach(b=>b.onclick=e=>{e.stopPropagation();const index=+b.dataset.solo;project.tracks[index].solo=!project.tracks[index].solo;engine.syncTracks(project.tracks);save();selectArrangementTrack(index)});
 $$('[data-fx]').forEach(button=>button.onclick=event=>{event.stopPropagation();arrangementWorkspaceState.devicesOpen=true;selectArrangementTrack(Number(button.dataset.fx));$('.effect-chain')?.scrollIntoView({behavior:'smooth',block:'nearest'})});
 $$('[data-remove]').forEach(b=>b.onclick=e=>{e.stopPropagation();const index=Number(b.dataset.remove),track=project.tracks[index];if(!window.confirm(`Delete track “${track.name}” and its clips/instrument settings? Shared samples will remain in your library.`))return;if(!deleteProjectTrack(project,index))return;selectedTrack=project.tracks.length?Math.min(selectedTrack>index?selectedTrack-1:index,project.tracks.length-1):0;selectedClip=null;engine.syncTracks(project.tracks);save();render()});
 $$('[data-vol]').forEach(e=>e.oninput=()=>{project.tracks[+e.dataset.vol].volume=+e.value;engine.syncTracks(project.tracks);save()});
 $$('[data-pan]').forEach(e=>e.oninput=()=>{project.tracks[+e.dataset.pan].pan=+e.value;engine.syncTracks(project.tracks);save()});
 const masterVolume=$('#masterVolume');masterVolume.oninput=()=>{engine.setMaster({volume:Number(masterVolume.value)});$('#masterVolumeValue').value=`${Math.round(Number(masterVolume.value)*100)}%`;save()};
 $$('[data-lane]').forEach(lane=>lane.ondragover=event=>event.preventDefault());
 const c=project.tracks.flatMap(track=>track.clips).find(clip=>clip.id===selectedClip);if(!c)return;
 for(const [selector,key]of [['#clipStart','start'],['#clipEnd','end'],['#clipRate','rate'],['#clipGain','gain'],['#clipFadeIn','fadeIn'],['#clipFadeOut','fadeOut'],['#instrumentDuration','durationBeats'],['#instrumentOffset','offsetBeats']])$(selector)?.addEventListener('change',event=>{const value=Number(event.target.value);if(!Number.isFinite(value)||value<0||['rate','durationBeats'].includes(key)&&value<=0)return notify('Enter a valid non-negative clip value (speed/duration must be positive).');checkpointArrangement();c[key]=value;if(key!=='gain'){delete c.envelopeOffset;delete c.envelopeDuration}if(['durationBeats','offsetBeats'].includes(key))delete c.legacyTail;if(key==='start'||key==='end')delete c.loopOffset;if(!isInstrumentClip(c)&&c.end<=c.start)c.end=c.start+.01;commitArrangement()});
 $('#openClipEditor')?.addEventListener('click',()=>openInstrumentClip());
 $('#clipLoop')?.addEventListener('change',event=>{checkpointArrangement();c.loop=event.target.checked;if(isInstrumentClip(c))delete c.legacyTail;else{if(c.loop)c.duration=Math.max(.01,(c.end-c.start)/(c.rate||1)*4);else delete c.duration}commitArrangement()});
 $('#clipDuration')?.addEventListener('change',event=>{checkpointArrangement();c.duration=Math.max(.01,Number(event.target.value)||clipDurationSeconds(c));commitArrangement()});
 $('#moveClip').onclick=()=>{const bar=Number($('#clipBar').value),target=$('#clipTrack').value;if(!Number.isFinite(bar)||bar<0)return notify('Enter a non-negative clip bar position.');if(!project.tracks.some(track=>track.id===target))return notify('Choose a valid destination track.');try{checkpointArrangement();if(!moveClipTo(project.tracks,c.id,target,bar)){arrangementHistory.undo(project.tracks);return notify('Could not move this clip.')}selectedTrack=project.tracks.findIndex(track=>track.id===target);commitArrangement()}catch(error){notify(error.message)}};
 $('#deleteClip').onclick=deleteSelectedClip;
}
async function connectFolder(){if('showDirectoryPicker'in window){try{folderHandle=await showDirectoryPicker({mode:'readwrite'});const files=[];async function walk(dir,prefix='',depth=0){if(depth>8)return;for await(const [name,h] of dir.entries()){if(h.kind==='directory')await walk(h,prefix+name+'/',depth+1);else if(/\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(name)){const f=await h.getFile();files.push(f)}}}await walk(folderHandle);await importFiles(files);notify(`Connected ${folderHandle.name}; ${files.length} files. Save-back enabled when permitted.`)}catch(e){if(e.name!=='AbortError')notify(e.message)}}else{$('#importFolder').click();notify('Folder import fallback: direct folder write is not available in this browser.')}}
function tick(t){const bar=t/barSeconds(),p=$('#playhead'),ruler=$('#ruler'),arrangement=$('.arrangement');if(p&&ruler&&arrangement){arrangementWorkspace?.ensureBeat(t*project.bpm/60+8);const x=timelineContentOrigin(ruler,arrangement)+timelineScale().timeToPixels(t);p.style.left=`${x}px`;p.setAttribute('aria-valuenow',String(t));p.setAttribute('aria-valuetext',`${t.toFixed(3)} seconds`);if(engine.playing&&arrangementWorkspaceState.follow&&x-arrangement.scrollLeft>arrangement.clientWidth-230)arrangement.scrollLeft=Math.max(0,x-arrangement.clientWidth/2)}const clock=$('#clock');if(clock)clock.textContent=`${Math.floor(bar)+1}.${Math.floor((bar%1)*4)+1}.1`;const elapsed=$('#elapsedTime'),text=formatTransportTime(t);if(elapsed&&elapsed.textContent!==text)elapsed.textContent=text}
window.addEventListener('resize',()=>tick(playhead),{passive:true});
matchMedia('(max-width:850px)').addEventListener('change',()=>{if(view==='arrange')render()});
function renderSample(){$('#main').innerHTML=`<section class="studio"><div class="section-title"><h2>Sample Studio</h2><p>Record → edit → preview → save to your library.</p></div><div class="record-controls"><button id="record" class="accent">● Record Own</button><button id="finishRecord" disabled>■ Stop Recording</button><button id="loadSample">＋ Edit Existing Sample</button><span id="recordState">Microphone idle</span></div><div class="wave-panel"><canvas id="sampleWave" class="sample-wave"></canvas><div class="edit-grid"><label>Start (seconds)<input id="trimStart" type="number" min="0" step=".01" value="${edit.start}"></label><label>End (seconds)<input id="trimEnd" type="number" min="0" step=".01" value="${edit.end}"></label><label>Gain<input id="editGain" type="range" min="0" max="3" step=".05" value="${edit.gain}"></label><label>Fade In (s)<input id="fadeIn" type="number" min="0" max="10" step=".01" value="${edit.fadeIn}"></label><label>Fade Out (s)<input id="fadeOut" type="number" min="0" max="10" step=".01" value="${edit.fadeOut}"></label><label>Reverse<input id="reverse" type="checkbox" ${edit.reverse?'checked':''}></label></div><div class="record-controls"><button id="previewEdit">▶ Preview Edited</button><button id="normalize">Normalize Gain</button><button id="saveSample" class="primary">Save Sample</button><button id="makeSampler" ${savedSampleId?'':'disabled'}>Create Sampler</button><button id="makeRack" ${savedSampleId?'':'disabled'}>Create Drum Rack with Sample</button></div><label>Sample name <input id="sampleName" value="My_Kick_01.wav" placeholder="My_Kick_01.wav"></label><p class="hint">Sample edits are non-destructive until Save. Recording uses your browser microphone permission. Chrome/Edge can save directly to an authorized folder; other browsers download the WAV.</p></div></section>`;wireSample();requestAnimationFrame(drawSample)}
function drawSample(){drawWave($('#sampleWave'),recordBuffer)}
function wireSample(){ $('#record').onclick=async()=>{try{savedSampleId=null;$('#makeSampler').disabled=true;$('#makeRack').disabled=true;await engine.init();recordStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});chunks=[];recorder=new MediaRecorder(recordStream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=async()=>{recordBlob=new Blob(chunks,{type:recorder.mimeType});recordBuffer=await engine.ctx.decodeAudioData(await recordBlob.arrayBuffer());edit={start:0,end:recordBuffer.duration,gain:1,fadeIn:0,fadeOut:0,reverse:false};recordStream.getTracks().forEach(t=>t.stop());renderSample();notify('Recording captured. Edit and preview before saving.')};recorder.start();$('#record').disabled=true;$('#finishRecord').disabled=false;$('#recordState').textContent='● Recording…'}catch(e){notify(`Microphone unavailable: ${e.message}`)}};$('#finishRecord').onclick=()=>{if(recorder?.state==='recording')recorder.stop()};$('#loadSample').onclick=()=>{const f=document.createElement('input');f.type='file';f.accept='audio/*';f.onchange=async()=>{try{recordBuffer=await(await engine.init()).decodeAudioData(await f.files[0].arrayBuffer());savedSampleId=null;edit={start:0,end:recordBuffer.duration,gain:1,fadeIn:0,fadeOut:0,reverse:false};renderSample();$('#sampleName').value=f.files[0].name}catch(e){notify(e.message)}};f.click()};for(const [sel,k] of [['#trimStart','start'],['#trimEnd','end'],['#editGain','gain'],['#fadeIn','fadeIn'],['#fadeOut','fadeOut']])$(sel).oninput=e=>{edit[k]=+e.target.value;savedSampleId=null;$('#makeSampler').disabled=true;$('#makeRack').disabled=true};$('#reverse').onchange=e=>{edit.reverse=e.target.checked;savedSampleId=null;$('#makeSampler').disabled=true;$('#makeRack').disabled=true};$('#sampleName').oninput=()=>{savedSampleId=null;$('#makeSampler').disabled=true;$('#makeRack').disabled=true};$('#normalize').onclick=()=>{if(!recordBuffer)return notify('Record or load a sample first');let peak=0;for(let c=0;c<recordBuffer.numberOfChannels;c++)for(const x of recordBuffer.getChannelData(c))peak=Math.max(peak,Math.abs(x));edit.gain=peak?Math.min(3,.95/peak):1;$('#editGain').value=edit.gain;savedSampleId=null;$('#makeSampler').disabled=true;$('#makeRack').disabled=true;notify(`Gain set to ${edit.gain.toFixed(2)}×`)};$('#previewEdit').onclick=async()=>{if(!recordBuffer)return notify('No sample loaded');await engine.init();try{previewSource?.stop()}catch{}const b=processSample(engine.ctx,recordBuffer,edit),s=engine.ctx.createBufferSource();s.buffer=b;s.connect(engine.ctx.destination);s.start();previewSource=s};$('#saveSample').onclick=()=>saveSample().catch(error=>notify(`Sample save failed: ${error.message}`));$('#makeSampler').onclick=()=>savedSampleId&&createSamplerTrack(savedSampleId);$('#makeRack').onclick=()=>savedSampleId&&createDrumRack(savedSampleId)}
async function nextFolderFileName(directory,name){const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):'';let candidate=name,index=2;while(true){try{await directory.getFileHandle(candidate);candidate=`${stem} (${index++})${extension}`}catch(error){if(error.name==='NotFoundError')return candidate;throw error}}}
async function saveSample(){if(!recordBuffer)return notify('Record or load a sample first');if(edit.end<=edit.start)return notify('End must be greater than start');const b=processSample(await engine.init(),recordBuffer,edit),name=($('#sampleName').value.trim()||'Sample').replace(/\.wav$/i,'')+'.wav',blob=toWav(b),file=new File([blob],name,{type:'audio/wav'});savedSampleId=await addAsset(file);let savedName=null,folderError=null;if(folderHandle){try{savedName=await nextFolderFileName(folderHandle,name);const h=await folderHandle.getFileHandle(savedName,{create:true}),w=await h.createWritable();await w.write(blob);await w.close()}catch(error){folderError=error}}if(!savedName)download(blob,name);renderSample();notify(folderError?`Folder save failed (${folderError.message}); downloaded ${name}.`:`${name} ready in sample library${savedName?` and saved as ${savedName}`:' (downloaded)'}.`)}
function renderSampleBatch003(){const filename=sampleFilename||'My_Sample.wav';$('#main').innerHTML=renderSampleStudioHTML(sampleEditor,filename,Boolean(savedSampleId));wireSampleStudio($('#main'),{editor:sampleEditor,engine,bpm:project.bpm,notify,onRecord:startSampleRecording,onStopRecord:()=>{if(recorder?.state==='recording')recorder.stop()},onCancelRecord:cancelSampleRecording,onDiscardSample:discardSampleStudio,onLoad:loadSampleForEditing,onSave:saveEditedSample,onEdit:()=>{savedSampleId=null},onStructureChange:renderSampleBatch003,onPlaybackChange:updateTransportButton,onCreateSampler:()=>savedSampleId&&createSamplerTrack(savedSampleId),onCreateRack:()=>savedSampleId&&createDrumRack(savedSampleId),recording:recorder?.state==='recording',recordingElapsed:(performance.now()-recordingStartedAt)/1000});organizeSampleStudio($('#main'));mountMobileEditors()}
let sampleFilename='My_Sample.wav';
function resetSampleEditor(buffer,name){stopSampleStudioPreview();recordBuffer=buffer;sampleEditor=new SampleEditor(buffer);sampleFilename=name||'My_Sample.wav';savedSampleId=null;if(view==='sample'){renderSampleBatch003();requestAnimationFrame(()=>{const viewport=$('#waveViewport'),canvas=$('#sampleWave');if(viewport&&canvas){canvas.style.width=`${Math.max(280,viewport.clientWidth)*sampleEditor.view.zoom}px`;drawSampleStudioWave(canvas,sampleEditor)}})}}
function drawRecordingWave(){if(!recorder||recorder.state!=='recording'||!recordingAnalyser)return;const canvas=$('#sampleWave'),ctx=canvas?.getContext('2d');if(!canvas||!ctx){recordingRaf=requestAnimationFrame(drawRecordingWave);return}const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2),data=new Float32Array(recordingAnalyser.fftSize);recordingAnalyser.getFloatTimeDomainData(data);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);ctx.strokeStyle='#79d5c1';ctx.lineWidth=1;let peak=0;ctx.beginPath();for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));const x=i/(data.length-1)*width,y=height/2-data[i]*height*.42;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();const level=peak?`${(20*Math.log10(peak)).toFixed(1)} dBFS`:'−∞ dBFS';$('#inputMeter').textContent=`Input ${level}`;$('#recordState').textContent=`● Recording · ${((performance.now()-recordingStartedAt)/1000).toFixed(1)} s`;recordingRaf=requestAnimationFrame(drawRecordingWave)}
function releaseRecordingResources(){cancelAnimationFrame(recordingRaf);recordingRaf=0;recordingSource?.disconnect();recordingSource=null;recordingAnalyser=null;recordStream?.getTracks().forEach(track=>track.stop());recordStream=null}
function clearSampleStudioSession(){stopSampleStudioPreview();recordBuffer=null;recordBlob=null;sampleEditor=null;savedSampleId=null;sampleFilename='My_Sample.wav';chunks=[]}
function cancelSampleRecording(silent=false,refresh=true){const activeRecorder=recorder;recordingToken++;recorder=null;if(activeRecorder?.state==='recording'){try{activeRecorder.stop()}catch(error){notify(`Could not stop recording: ${error.message}`)}}releaseRecordingResources();clearSampleStudioSession();if(refresh&&view==='sample')renderSampleBatch003();if(!silent)notify('Recording cancelled and temporary audio discarded.')}
function discardSampleStudio(){if(shouldConfirmSampleDiscard({hasBuffer:Boolean(sampleEditor),saved:Boolean(savedSampleId)})&&!confirm('Discard this unsaved sample and its edits?'))return;cancelSampleRecording(true,false);if(view==='sample')renderSampleBatch003();notify('Temporary sample discarded. Saved samples were kept.')}
async function startSampleRecording(){
 if(sampleCapturePending||recorder?.state==='recording')return;
 if(shouldConfirmSampleDiscard({hasBuffer:Boolean(sampleEditor),saved:Boolean(savedSampleId)})&&!confirm('Discard the current unsaved sample and start a new recording?'))return;
 let stream;const token=++recordingToken;sampleCapturePending=true;mountMobileEditors();
 try{
  await engine.init();if(token!==recordingToken)return;
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(token!==recordingToken){stream.getTracks().forEach(track=>track.stop());return}
  recordStream=stream;chunks=[];recordingSource=engine.ctx.createMediaStreamSource(stream);recordingAnalyser=engine.ctx.createAnalyser();recordingAnalyser.fftSize=2048;recordingSource.connect(recordingAnalyser);recordingStartedAt=performance.now();
  const activeRecorder=new MediaRecorder(stream);recorder=activeRecorder;
  activeRecorder.ondataavailable=event=>{if(token===recordingToken&&event.data.size)chunks.push(event.data)};
  activeRecorder.onerror=event=>notify(`Recording failed: ${event.error?.message||'unknown recorder error'}`);
  activeRecorder.onstop=async()=>{
   if(token!==recordingToken)return;
   sampleCaptureFinalizing=true;
   const parts=resolveRecordingChunks(chunks);chunks=[];const mimeType=activeRecorder.mimeType;releaseRecordingResources();recorder=null;
   if(!parts){clearSampleStudioSession();if(view==='sample')renderSampleBatch003();notify('Recording contained no audio and was discarded.');sampleCaptureFinalizing=false;return}
   try{
    recordBlob=new Blob(parts,{type:mimeType});const buffer=await engine.ctx.decodeAudioData(await recordBlob.arrayBuffer());if(token!==recordingToken)return;
    resetSampleEditor(buffer,'My_Recording.wav');notify('Recording captured. Select, edit, preview, and save the new sample.');
   }catch(error){if(token===recordingToken){clearSampleStudioSession();if(view==='sample')renderSampleBatch003();notify(`Recording decode failed: ${error.message}`)}}
   finally{sampleCaptureFinalizing=false}
  };
  clearSampleStudioSession();view='sample';activeRecorder.start();renderSampleBatch003();drawRecordingWave();
 }catch(error){
  stream?.getTracks().forEach(track=>track.stop());if(recordStream===stream)releaseRecordingResources();
  if(token===recordingToken)notify(`Microphone unavailable: ${error.message}`);
 }finally{sampleCapturePending=false;mountMobileEditors()}
}
function loadSampleForEditing(){if(shouldConfirmSampleDiscard({hasBuffer:Boolean(sampleEditor),saved:Boolean(savedSampleId)})&&!confirm('Discard the current unsaved sample and load another audio file?'))return;const token=recordingToken,input=document.createElement('input');input.type='file';input.accept='audio/*';sampleLoadPending=true;input.addEventListener('cancel',()=>{sampleLoadPending=false},{once:true});input.onchange=async()=>{const file=input.files?.[0];if(!file){sampleLoadPending=false;return}try{const buffer=await(await engine.init()).decodeAudioData(await file.arrayBuffer());if(token!==recordingToken)return;resetSampleEditor(buffer,file.name);notify(`${file.name} loaded for non-destructive editing.`)}catch(error){if(token===recordingToken)notify(`Sample decode failed: ${error.message}`)}finally{sampleLoadPending=false}};input.click()}
async function saveEditedSample(buffer,name){
 if(!buffer||!buffer.length)throw Error('Edited sample contains no audio frames.');
 if(sampleSavePending)throw Error('A sample save is already in progress.');
 sampleSavePending=true;
 try{
  const token=recordingToken,filename=(name.trim()||'Sample').replace(/\.wav$/i,'')+'.wav',
   blob=toWav(buffer),file=new File([blob],filename,{type:'audio/wav'}),assetId=await addAsset(file);
  if(token===recordingToken)savedSampleId=assetId;
  let savedName=null,folderError=null;
  if(folderHandle){
   try{
    savedName=await nextFolderFileName(folderHandle,filename);
    const handle=await folderHandle.getFileHandle(savedName,{create:true}),writer=await handle.createWritable();
    await writer.write(blob);await writer.close();
   }catch(error){folderError=error}
  }
  if(!savedName)download(blob,filename);
  if(token===recordingToken){sampleFilename=filename;renderSampleBatch003()}
  notify(folderError?`Folder save failed (${folderError.message}); downloaded ${filename}.`:`${filename} saved to the sample library${savedName?` and folder as ${savedName}`:' and downloaded'}.`);
 }finally{sampleSavePending=false}
}
function masterEqSvg(settings){
 return '<div id="masterEqGraph"></div>';
}
function masterBandControls(settings){
 return settings.eq.bands.map((band,index)=>`<fieldset class="master-band"><legend><label><input type="checkbox" data-master-band="${index}" data-band-enabled ${band.enabled?'checked':''}> Band ${index+1} · ${band.type==='lowshelf'?'Low shelf':band.type==='highshelf'?'High shelf':'Bell'}</label></legend><label>Frequency <input type="range" min="20" max="20000" step="1" value="${band.frequency}" data-master-band="${index}" data-band-param="frequency"><output>${Math.round(band.frequency)} Hz</output></label><label>Gain <input type="range" min="-18" max="18" step=".1" value="${band.gain}" data-master-band="${index}" data-band-param="gain"><output>${band.gain.toFixed(1)} dB</output></label><label>Q <input type="range" min=".1" max="12" step=".1" value="${band.q}" data-master-band="${index}" data-band-param="q"><output>${band.q.toFixed(1)}</output></label></fieldset>`).join('');
}
function drawMasterWaveform(buffer){
 const canvas=$('#masterWaveform');if(!canvas||!buffer)return;
 const ratio=Math.min(devicePixelRatio||1,2),width=canvas.clientWidth||600,height=canvas.clientHeight||110;
 canvas.width=width*ratio;canvas.height=height*ratio;
 const context=canvas.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);context.fillStyle='#111923';context.fillRect(0,0,width,height);context.strokeStyle='#72d5bd';context.lineWidth=1;
 const channels=Array.from({length:buffer.numberOfChannels},(_,index)=>buffer.getChannelData(index)),step=Math.max(1,Math.floor(buffer.length/width));
 for(let x=0;x<width;x++){let peak=0;for(let frame=x*step;frame<Math.min(buffer.length,(x+1)*step);frame++)for(const channel of channels)peak=Math.max(peak,Math.abs(channel[frame]||0));context.beginPath();context.moveTo(x,height/2-peak*height*.46);context.lineTo(x,height/2+peak*height*.46);context.stroke()}
}
function selectedMasterBuffer(){return masteringAB==='A'||masteringPreviewRevision!==masteringRevision?masteringPreview?.original:masteringPreview?.mastered}
function masterMonitorMatrix(mode){
 return stereoMonitorMatrix(mode);
}
function setMasterMonitorMode(mode){
 masterMonitorMode=['stereo','mono','left','right','mid','side'].includes(mode)?mode:'stereo';
 const matrix=masterMonitorMatrix(masterMonitorMode);
 if(masteringPlayback?.monitorGains)for(let output=0;output<2;output++)for(let input=0;input<2;input++)masteringPlayback.monitorGains[output][input].gain.setTargetAtTime(matrix[output][input],engine.ctx.currentTime,.008);
 const warning=$('#masterPhaseWarning'),correlation=masteringPreview?.[masteringAB==='A'?'originalAnalysis':'masteredAnalysis']?.stereo?.correlation;
 if(warning)warning.hidden=!(masterMonitorMode==='mono'&&Number.isFinite(correlation)&&correlation<-.1);
}
function drawMasterSpectrum(state,data=null){
 const canvas=$('#masterSpectrum');
 if(!canvas||!state?.analyser)return;
 const rect=canvas.getBoundingClientRect();
 if(!rect.width||canvas.closest('details')&&!canvas.closest('details').open)return;
 const now=performance.now();
 if(now-masterSpectrumHoldTime<30)return;
 masterSpectrumHoldTime=now;
 const ratio=Math.min(devicePixelRatio||1,2),width=rect.width,height=rect.height||190;
 if(canvas.width!==Math.round(width*ratio)||canvas.height!==Math.round(height*ratio)){canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio)}
 const context=canvas.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,width,height);context.fillStyle='#111923';context.fillRect(0,0,width,height);
 const values=data||state.spectrumData; if(!data)state.analyser.getFloatFrequencyData(values);
 if(!masterSpectrumPeak||masterSpectrumPeak.length!==values.length)masterSpectrumPeak=new Float32Array(values.length).fill(-90);
 const elapsed=Math.max(0,(now-(state.lastSpectrumAt||now))/1000);state.lastSpectrumAt=now;
 for(let index=0;index<values.length;index++){const value=Number.isFinite(values[index])?values[index]:-90;masterSpectrumPeak[index]=Math.max(value,masterSpectrumPeak[index]-elapsed*12)}
 const lowHz=20,highHz=Math.min(20000,engine.ctx.sampleRate/2),maxDb=0,minDb=-90;
 const xAt=frequency=>Math.log(frequency/lowHz)/Math.log(highHz/lowHz)*width,yAt=db=>height-(Math.max(minDb,Math.min(maxDb,db))-minDb)/(maxDb-minDb)*height;
 context.font='10px sans-serif';context.textBaseline='middle';
 for(const db of [-80,-60,-40,-20,0]){const y=yAt(db);context.strokeStyle='#293545';context.beginPath();context.moveTo(32,y);context.lineTo(width,y);context.stroke();context.fillStyle='#9aa9bb';context.fillText(`${db}`,2,y)}
 for(const frequency of [20,100,1000,10000]){
  const x=xAt(frequency);context.strokeStyle='#293545';context.beginPath();context.moveTo(x,0);context.lineTo(x,height-15);context.stroke();context.fillStyle='#9aa9bb';context.fillText(frequency>=1000?`${frequency/1000}k`:`${frequency}`,x+2,height-8);
 }
 context.beginPath();
 for(let x=32;x<width;x++){
  const frequency=lowHz*Math.pow(highHz/lowHz,x/width),bin=Math.min(values.length-1,Math.max(1,Math.round(frequency/engine.ctx.sampleRate*state.analyser.fftSize)));
  const value=Number.isFinite(values[bin])?values[bin]:minDb;
  const y=yAt(value);if(x===32)context.moveTo(x,y);else context.lineTo(x,y);
 }
 context.strokeStyle='#73d9c0';context.lineWidth=1.5;context.stroke();
 context.beginPath();
 for(let x=32;x<width;x++){
  const frequency=lowHz*Math.pow(highHz/lowHz,x/width),bin=Math.min(masterSpectrumPeak.length-1,Math.max(1,Math.round(frequency/engine.ctx.sampleRate*state.analyser.fftSize)));
  const y=yAt(masterSpectrumPeak[bin]);if(x===32)context.moveTo(x,y);else context.lineTo(x,y);
 }
 context.strokeStyle='#e9be62';context.lineWidth=.8;context.stroke();
}
function masteringPosition(){if(!masteringPlayback)return 0;return Math.min(masteringPlayback.buffer.duration,masteringPlayback.offset+engine.ctx.currentTime-masteringPlayback.startedAt)}
function stopMasteringPlayback(reset=true){
 if(!masteringPlayback){if(reset){masteringPausedOffset=0;const cursor=$('#masterCursor');if(cursor)cursor.style.left='0'}return}
 const state=masteringPlayback;masteringPlayback=null;cancelAnimationFrame(state.raf);
 updateTransportButton();
 try{state.gain.gain.cancelScheduledValues(engine.ctx.currentTime);state.gain.gain.setTargetAtTime(0,engine.ctx.currentTime,.004);state.source.stop(engine.ctx.currentTime+.025)}catch{}
 state.cleanupTimer=setTimeout(state.cleanup,40);
 const play=$('#masterPlay');if(play)play.textContent='▶ Play';
 if(reset){masteringPausedOffset=0;const cursor=$('#masterCursor');if(cursor)cursor.style.left='0'}
}
async function playMasteringBuffer(offset=0){
 const buffer=masteringPreview?.original;if(!buffer)return notify('Render the mix before preview playback.');
 if(engine.playing){playhead=engine.position();engine.stop();$('#play').textContent='▶'}
 await engine.init();stopMasteringPlayback(false);
 const ctx=engine.ctx,source=ctx.createBufferSource(),splitter=ctx.createChannelSplitter(2),merger=ctx.createChannelMerger(2),gain=ctx.createGain(),analyser=ctx.createAnalyser(),start=Math.min(Math.max(0,offset),Math.max(0,buffer.duration-.001)),now=ctx.currentTime;
 analyser.fftSize=4096;analyser.smoothingTimeConstant=.72;analyser.minDecibels=-90;analyser.maxDecibels=0;
 const monitorGains=Array.from({length:2},(_,output)=>Array.from({length:2},(_,input)=>ctx.createGain())),matrix=masterMonitorMatrix(masterMonitorMode);
 for(let output=0;output<2;output++)for(let input=0;input<2;input++){const node=monitorGains[output][input];node.gain.value=matrix[output][input];splitter.connect(node,input);node.connect(merger,0,output)}
 const liveGraph=masteringAB==='B'?createMasteringGraph(ctx,project.mastering,splitter):null;
 source.buffer=buffer;source.connect(liveGraph?.input||splitter);merger.connect(gain);gain.connect(analyser).connect(ctx.destination);
 const activeAnalysis=masteringPreview?.[masteringAB==='A'?'originalAnalysis':'masteredAnalysis'],aLufs=masteringPreview?.originalAnalysis?.integratedLufs,bLufs=masteringPreview?.masteredAnalysis?.integratedLufs,matchDb=loudnessMatchGainDb(aLufs,bLufs,activeAnalysis?.integratedLufs,masterLevelMatch&&masteringPreviewRevision===masteringRevision),matchGain=10**(matchDb/20);
 gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(matchGain,now+.012);source.start(now,start);
 const state={source,gain,buffer,offset:start,startedAt:now,raf:0,analyser,spectrumData:new Float32Array(analyser.frequencyBinCount),monitorGains,graph:liveGraph};masteringPlayback=state;$('#masterPlay').textContent='Ⅱ Pause';
 updateTransportButton();
 state.cleanup=()=>{clearTimeout(state.cleanupTimer);if(state.disposed)return;state.disposed=true;liveGraph?.disconnect();for(const node of [source,splitter,merger,gain,analyser,...monitorGains.flat()])node.disconnect()};
 source.onended=()=>{state.cleanup();if(masteringPlayback===state)stopMasteringPlayback()};
 const animate=()=>{if(masteringPlayback!==state)return;const position=masteringPosition(),cursor=$('#masterCursor');if(cursor)cursor.style.left=`${position/buffer.duration*100}%`;drawMasterSpectrum(state);if(performance.now()-(state.lastMeterUpdate||0)>100){state.lastMeterUpdate=performance.now();updateMasterGainReductionMeters()}state.raf=requestAnimationFrame(animate)};animate();
}
async function renderMasteringPreview(){
 const button=$('#renderMasterPreview'),cancel=$('#masterCancelAnalysis'),status=$('#masterRenderStatus'),revision=masteringRevision;if(button)button.disabled=true;if(status)status.textContent='Rendering complete arrangement and mastering chain…';
 try{
  stopMasteringPlayback();await engine.init();
  const original=await engine.render(project,buffers,{bypassMastering:true}),mastered=await engine.render(project,buffers);
  if(revision!==masteringRevision)throw new DOMException('Mastering settings changed during rendering.','AbortError');
  const controller=new AbortController();masteringAnalysisController=controller;if(cancel)cancel.hidden=false;
  const originalAnalysis=await analyzeMasterBufferAsync(original,{signal:controller.signal,onProgress:progress=>{if(status)status.textContent=`Analyzing original mix · ${Math.round(progress*100)}%`}}),masteredAnalysis=await analyzeMasterBufferAsync(mastered,{signal:controller.signal,onProgress:progress=>{if(status)status.textContent=`Analyzing mastered mix · ${Math.round(progress*100)}%`}});
  if(controller.signal.aborted)throw controller.signal.reason;
  masteringAnalysisController=null;
  if(revision!==masteringRevision)throw new DOMException('Mastering settings changed during analysis.','AbortError');
  masteringPreview={original,mastered,originalAnalysis,masteredAnalysis};masteringPreviewRevision=revision;
  const buffer=selectedMasterBuffer();drawMasterWaveform(buffer);updateMasterAnalysis();if(status)status.textContent=`Rendered ${mastered.duration.toFixed(2)} s · ${mastered.sampleRate} Hz · stereo`;
 }catch(error){const cancelled=error?.name==='AbortError';if(status)status.textContent=cancelled?'Loudness analysis cancelled.':`Render failed: ${error.message}`;if(!cancelled)notify(`Mastering render failed: ${error.message}`)}
 finally{masteringAnalysisController=null;if(cancel)cancel.hidden=true;if(button)button.disabled=false}
}
function updateMasterAnalysis(){
 if(masteringPreview)$('#masterCompareState').textContent=masteringAB==='A'?'A · Original mix':masteringPreviewRevision===masteringRevision?'B · Mastered mix':'B · Live settings (analysis pending)';
 if(masteringPreviewRevision!==masteringRevision)return;
 const analysis=masteringPreview?.[masteringAB==='A'?'originalAnalysis':'masteredAnalysis'];if(!analysis)return;
 $('#masterRms').textContent=`${analysis.rmsDbfs.toFixed(1)} dBFS`;
 $('#masterPeak').textContent=`${analysis.samplePeak.toFixed(4)} (${(20*Math.log10(Math.max(1e-12,analysis.samplePeak))).toFixed(1)} dBFS)`;
 $('#masterIntegrated').textContent=Number.isFinite(analysis.integratedLufs)?`${analysis.integratedLufs.toFixed(1)} LUFS`:'—';
 $('#masterShortTerm').textContent=Number.isFinite(analysis.shortTermLufs)?`${analysis.shortTermLufs.toFixed(1)} LUFS`:'—';
 $('#masterMomentary').textContent=Number.isFinite(analysis.momentaryLufs)?`${analysis.momentaryLufs.toFixed(1)} LUFS`:'—';
 $('#masterLra').textContent=Number.isFinite(analysis.lra)?`${analysis.lra.toFixed(1)} LU`:'—';
 $('#masterTruePeak').textContent=`${analysis.truePeakDbtp.toFixed(1)} dBTP (4× estimate)`;
 $('#masterGainReduction').textContent=`${(engine.masteringGraph?.gainReductionDb||0).toFixed(1)} dB`;
 $('#masterBeforeAfter').textContent=`Original: ${masteringPreview.originalAnalysis.integratedLufs.toFixed(1)} LUFS / ${masteringPreview.originalAnalysis.truePeakDbtp.toFixed(1)} dBTP · Mastered: ${masteringPreview.masteredAnalysis.integratedLufs.toFixed(1)} LUFS / ${masteringPreview.masteredAnalysis.truePeakDbtp.toFixed(1)} dBTP`;
 $('#masterCompareState').textContent=masteringAB==='A'?'A · Original mix':'B · Mastered mix';
 const correlation=analysis.stereo?.correlation;
 $('#masterCorrelation').textContent=Number.isFinite(correlation)?correlation.toFixed(2):'—';
 $('#masterBalance').textContent=analysis.stereo?`${analysis.stereo.balanceDb.toFixed(1)} dB L/R`:'Mono source';
 $('#masterMonoLoss').textContent=analysis.stereo?`${analysis.stereo.monoLossDb.toFixed(1)} dB`:'—';
 const phaseWarning=$('#masterPhaseWarning');
 if(phaseWarning){phaseWarning.hidden=!Number.isFinite(correlation)||correlation>=-.1;phaseWarning.textContent='Potential phase cancellation: negative stereo correlation may reduce level or change tone in mono.'}
 const delta=masteringPreview.masteredAnalysis.integratedLufs-masteringPreview.originalAnalysis.integratedLufs;
 $('#masterLevelMatchStatus').textContent=`A/B difference ${Number.isFinite(delta)?`${delta>=0?'+':''}${delta.toFixed(1)} LU`:'unavailable'} · ${masterLevelMatch?'level match attenuates only; no comparison boost':'level match off'}`;
 const mode=$('#masterMonitorMode');if(mode)mode.value=masterMonitorMode;
 updateMasterGainReductionMeters();
 const ceilingExceeded=project.mastering.limiter.enabled&&analysis.truePeakDbtp>project.mastering.limiter.ceiling+.15;
 $('#masterClipWarning').textContent=analysis.clipping?'Clipping detected: one or more samples reach or exceed 0 dBFS. Reduce output or adjust processing before exporting.':`Estimated true peak ${analysis.truePeakDbtp.toFixed(1)} dBTP exceeds the enabled limiter ceiling of ${project.mastering.limiter.ceiling.toFixed(1)} dBTP.`;
 $('#masterClipWarning').hidden=!analysis.clipping&&!ceilingExceeded;
 drawMasterLoudnessHistory(analysis.loudnessHistory);
}
function updateMasterGainReductionMeters(){
 const graph=masteringPlayback?masteringPlayback.graph:engine.masteringGraph;
 const reductions=graph?.multibandGainReduction||[0,0,0];
 if($('#masterGainReduction'))$('#masterGainReduction').textContent=`${(graph?.gainReductionDb||0).toFixed(1)} dB`;
 const summary=$('#masterMultibandGR');
 if(summary)summary.textContent=reductions.map(value=>(Number(value)||0).toFixed(1)).join(' / ')+' dB';
 reductions.forEach((value,index)=>{
  const meter=$(`[data-multiband-meter="${index}"]`),readout=$(`[data-multiband-readout="${index}"]`);
  if(meter)meter.value=Math.max(0,Math.min(24,Number(value)||0));
  if(readout)readout.textContent=`${(Number(value)||0).toFixed(1)} dB gain reduction`;
 });
}
function drawMasterLoudnessHistory(history){
 const canvas=$('#masterLoudnessHistory');if(!canvas)return;
 const width=canvas.clientWidth||320,height=canvas.clientHeight||64,dpr=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d');
 canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
 const values=history.filter(point=>Number.isFinite(point.lufs));if(!values.length)return;
 const min=Math.min(-60,...values.map(point=>point.lufs)),max=Math.max(-6,...values.map(point=>point.lufs)),range=Math.max(1,max-min),barWidth=width/values.length;
 ctx.fillStyle='#73d5be';
 values.forEach((point,index)=>{const barHeight=Math.max(1,(point.lufs-min)/range*(height-4));ctx.fillRect(index*barWidth,height-barHeight,Math.max(1,barWidth-1),barHeight)});
}
function refreshMasterEqGraph(){
 refreshEqEditors();
}
function setMasteringControl(mutator,persist=false){
 const settings=normalizeMasteringSettings(project.mastering);mutator(settings);const next=normalizeMasteringSettings(settings);
 try{masteringPlayback?.graph?.update(next);engine.setMastering(next)}catch(error){notify(`Mastering settings were not applied: ${error.message}`);if(view==='master')renderMaster();return}
 masteringAnalysisController?.abort(new DOMException('Mastering settings changed during analysis.','AbortError'));project.mastering=next;masteringRevision++;masteringPreviewRevision=-1;
 if(masteringPlayback)masteringPlayback.gain.gain.setTargetAtTime(1,engine.ctx.currentTime,.01);
 if($('#masterLevelMatchStatus'))$('#masterLevelMatchStatus').textContent='Level matching pending updated render/analysis.';
 const status=$('#masterRenderStatus');if(status)status.textContent='Settings are live during B preview. Render again for updated waveform, loudness analysis and A/B level matching.';
 for(const id of ['masterRms','masterPeak','masterIntegrated','masterShortTerm','masterMomentary','masterLra','masterTruePeak','masterGainReduction','masterBeforeAfter','masterCorrelation','masterBalance','masterMonoLoss'])if($('#'+id))$('#'+id).textContent='—';
 $('#masterPhaseWarning').hidden=true;
 const history=$('#masterLoudnessHistory');if(history)history.getContext('2d').clearRect(0,0,history.width,history.height);
 updateMasterAnalysis();
 $('#masterClipWarning').hidden=true;refreshMasterEqGraph();const target=$('.master-target');if(target)target.textContent=`Reference target: −14 LUFS (guidance only; no loudness normalization). Limiter ceiling: ${next.limiter.ceiling.toFixed(1)} dBTP.`;if(persist)save();
}
function masterChainOrderHtml(settings){
 const names={eq:'Parametric EQ',saturation:'Saturation',imager:'Stereo width',multiband:'3-band compressor'};
 return`<section class="master-chain-order"><header><strong>Processing order</strong><span>Final limiter is fixed after output gain.</span></header><label><input id="masterChainBypass" type="checkbox" ${settings.chainBypass?'checked':''}> Bypass mastering modules (limiter remains active)</label><ol>${settings.chainOrder.map((name,index)=>`<li><span>${index+1}. ${names[name]}</span><div><button type="button" data-master-move="${index-1}" aria-label="Move ${names[name]} up" ${index===0?'disabled':''}>↑</button><button type="button" data-master-move="${index+1}" aria-label="Move ${names[name]} down" ${index===settings.chainOrder.length-1?'disabled':''}>↓</button></div></li>`).join('')}<li class="master-limiter-fixed"><span>${settings.chainOrder.length+1}. Output gain → True-peak limiter (fixed final stage)</span></li></ol></section>`;
}
function masterMultibandHtml(settings){
 const [low,high]=settings.multiband.crossovers,lowPosition=Math.log(low/20)/Math.log(1000)*100,highPosition=Math.log(high/20)/Math.log(1000)*100;
 const labels=[`Low · 20–${Math.round(low)} Hz`,`Mid · ${Math.round(low)}–${Math.round(high)} Hz`,`High · ${Math.round(high)}–20 kHz`];
 return`<section class="master-module master-multiband"><header><label><input id="masterMultibandEnabled" type="checkbox" ${settings.multiband.enabled?'checked':''}> 3-band compressor · Linkwitz–Riley 4th-order crossovers</label><span>GR: <output id="masterMultibandGR">0.0 / 0.0 / 0.0 dB</output></span></header><div class="multiband-display" role="img" aria-label="Low, mid, and high frequency bands separated by adjustable crossover frequencies"><span style="width:${lowPosition}%">Low</span><span style="width:${highPosition-lowPosition}%">Mid</span><span style="width:${100-highPosition}%">High</span></div><div class="master-filter-controls"><label>Low / mid crossover <input type="range" min="40" max="2000" step="1" value="${low}" data-master-param="multiband.crossovers.0"><output>${Math.round(low)} Hz</output></label><label>Mid / high crossover <input type="range" min="200" max="16000" step="1" value="${high}" data-master-param="multiband.crossovers.1"><output>${Math.round(high)} Hz</output></label></div><div class="multiband-band-grid">${settings.multiband.bands.map((band,index)=>`<fieldset class="multiband-band"><legend>${labels[index]}</legend><label><input type="checkbox" data-multiband-enabled="${index}" ${band.enabled?'checked':''}> Dynamics on</label><label><input type="checkbox" data-multiband-solo="${index}" ${band.solo?'checked':''}> Solo band</label>${[['threshold','Threshold','-60','0','.1',' dB'],['ratio','Ratio','1','20','.1',':1'],['attack','Attack','1','1000','1',' ms'],['release','Release','10','2000','1',' ms'],['knee','Knee','0','24','.1',' dB'],['makeup','Makeup','-24','24','.1',' dB'],['outputGain','Output gain','-24','24','.1',' dB']].map(([key,title,min,max,step,suffix])=>`<label>${title}<input type="range" min="${min}" max="${max}" step="${step}" value="${key==='attack'?band.attack*1000:key==='release'?band.release*1000:band[key]}" data-master-param="multiband.bands.${index}.${key}"><output>${key==='attack'?Math.round(band.attack*1000):key==='release'?Math.round(band.release*1000):key==='ratio'?band[key].toFixed(1):band[key].toFixed(1)}${suffix}</output></label>`).join('')}<progress max="24" value="0" data-multiband-meter="${index}" aria-label="${labels[index]} gain reduction"></progress><output data-multiband-readout="${index}">0.0 dB gain reduction</output></fieldset>`).join('')}</div><p class="hint">Per-band dynamics bypass leaves its frequency band intact; Solo auditions selected band(s). Crossovers use cascaded 2nd-order Butterworth sections (Linkwitz–Riley 4th-order) and reconstruct with summed bands.</p></section>`;
}
function formatExportDuration(seconds){
 const total=Math.max(0,Math.round(seconds)),minutes=Math.floor(total/60),remaining=total%60;
 return`${minutes}:${String(remaining).padStart(2,'0')}`;
}
function renderReleaseEditor(){
 const metadata=normalizeReleaseMetadata(project.releaseMetadata,project),artwork=project.releaseArtwork||{},fields=[
  ['title','Track title',200],['artist','Artist',200],['albumArtist','Album artist',200],['album','Album',200],['genre','Genre',80],
  ['releaseDate','Release date',10],['trackNumber','Track number',16],['discNumber','Disc number',16],['composer','Composer',200],
  ['producer','Producer',200],['copyright','Copyright',200],['comments','Comments',2000],['isrc','ISRC',12],['bpm','BPM',12],['musicalKey','Musical key',12]
 ];
 return`<details class="release-editor" open><summary>Release metadata & artwork</summary><div class="release-editor-grid"><section class="release-metadata"><h3>Track metadata</h3><div class="release-metadata-fields">${fields.map(([key,label,limit])=>`<label class="${key==='comments'?'release-comments':''}">${label}<input data-release-field="${key}" type="${key==='bpm'?'number':'text'}" value="${esc(metadata[key])}" maxlength="${limit}" ${key==='bpm'?'min="1" max="999" step="0.1"':''}></label>`).join('')}</div><p id="releaseValidation" class="hint" role="status">Metadata is stored with this project and embedded in supported audio formats.</p></section><section class="release-artwork"><h3>Album artwork</h3><div class="artwork-preview-wrap">${releaseArtworkUrl?`<img class="artwork-preview-image" src="${releaseArtworkUrl}" alt="Prepared square album cover" style="object-position:${Number(artwork.cropX??50)}% ${Number(artwork.cropY??50)}%;transform:scale(${Number(artwork.zoom??1)})">`:'<div class="artwork-placeholder">No artwork selected</div>'}</div><div class="artwork-controls"><button id="chooseArtwork" type="button">Import JPEG/PNG</button><label>Horizontal crop <input id="artCropX" type="range" min="0" max="100" value="${Number(artwork.cropX??50)}" ${releaseArtworkSourceBlob?'':'disabled'}></label><label>Vertical crop <input id="artCropY" type="range" min="0" max="100" value="${Number(artwork.cropY??50)}" ${releaseArtworkSourceBlob?'':'disabled'}></label><label>Zoom <input id="artZoom" type="range" min="1" max="3" step=".01" value="${Number(artwork.zoom??1)}" ${releaseArtworkSourceBlob?'':'disabled'}></label><label>Resolution <select id="artResolution"><option value="1000" ${Number(artwork.resolution||3000)===1000?'selected':''}>1000 px</option><option value="1500" ${Number(artwork.resolution||3000)===1500?'selected':''}>1500 px</option><option value="3000" ${Number(artwork.resolution||3000)===3000?'selected':''}>3000 px</option></select></label><label>Embedded format <select id="artFormat"><option value="image/jpeg" ${artwork.mime!=='image/png'?'selected':''}>JPEG</option><option value="image/png" ${artwork.mime==='image/png'?'selected':''}>PNG</option></select></label><span>${artwork.name?`${esc(artwork.name)} · ${artwork.width||'—'} × ${artwork.height||'—'} px source`:'Original image is retained for recropping.'}</span></div></section></div><p id="artworkStatus" class="hint" role="status"></p></details><section class="release-package-card"><div><h3>Release package ZIP</h3><p>Package mastered deliverables and matching metadata/artwork; this is separate from the editable .EHS project.</p></div><label><input type="checkbox" data-release-audio="wav" checked> WAV</label><label><input type="checkbox" data-release-audio="mp3" checked> MP3</label><button id="releaseZipStart" class="accent">Export Release Package</button><button id="releaseZipCancel" hidden>Cancel package</button></section>`;
}
function renderExport(){
 const restoreFocus=document.body.classList.contains('mobile-focus-active'),focusStage=mobileFocusStage();
 if(restoreFocus)closeMobileFocus({restoreFocus:false});
 const settings=normalizeExportSettings(project.exportSettings),duration=estimateProjectRender(project,buffers).durationSeconds;
 const memory=estimateExportMemory(duration,settings),warning=exportMemoryWarning(memory),busy=Boolean(exportController||releaseZipController);
 const rateOptions=EXPORT_SAMPLE_RATES[settings.format].map(rate=>`<option value="${rate}" ${rate===settings.sampleRate?'selected':''}>${(rate/1000).toFixed(rate%1000?1:0)} kHz</option>`).join('');
 const metric=exportRun?.analysis,info=exportRun?.info;
 const results=metric?`<div class="export-metrics"><article><span>Duration</span><strong>${formatExportDuration(exportRun.duration)}</strong></article><article><span>Sample rate</span><strong>${(info.sampleRate/1000).toFixed(1)} kHz</strong></article><article><span>${info.bitDepth?`Bit depth · ${info.format==='float'?'float':'PCM'}`:'MP3 bitrate'}</span><strong>${info.bitDepth?`${info.bitDepth}-bit`:info.bitrates.join(' / ')+' kbps'}</strong></article><article><span>Channels</span><strong>${info.channels===2?'Stereo':'Mono'}</strong></article><article><span>Integrated loudness</span><strong>${Number.isFinite(metric.integratedLufs)?`${metric.integratedLufs.toFixed(1)} LUFS`:'−∞ LUFS'}</strong></article><article><span>True peak · estimated</span><strong>${metric.truePeakDbtp.toFixed(1)} dBTP est.</strong></article><article><span>Sample peak</span><strong>${metric.samplePeakDbfs.toFixed(1)} dBFS</strong></article><a id="exportDownload" href="${exportRun.downloadUrl}" download="${esc(exportRun.filename)}">Download ${settings.format.toUpperCase()} again</a>${metric.clipping?'<p class="export-warning">Clipping detected in the decoded export. Lower the mix or adjust mastering before release.</p>':''}${exportRun.durationDifference>.12?'<p class="export-warning">Encoded duration differs from the rendered duration by more than 120 ms. Check player gapless-padding support and the export settings.</p>':''}</div>`:'<p class="hint">Final loudness and peak measurements will be calculated from the encoded file after export.</p>';
 $('#main').innerHTML=`<section class="studio export-studio"><div class="section-title"><h2>Export Studio</h2><p>Render the arrangement once, then resample and encode that same master. Track effects, mixer routing, sidechains and the selected mastering chain are processed by the shared offline renderer.</p></div><div class="export-layout"><section class="export-card"><div class="export-settings-head"><h3>Audio file</h3><label>Mode <select id="exportMode"><option value="basic" ${settings.advanced?'':'selected'}>Basic</option><option value="advanced" ${settings.advanced?'selected':''}>Advanced</option></select></label></div><div class="export-controls"><label>Format<select id="exportFormat" ${busy?'disabled':''}><option value="wav" ${settings.format==='wav'?'selected':''}>WAV</option><option value="mp3" ${settings.format==='mp3'?'selected':''}>MP3</option></select></label>${settings.advanced?`<label>${settings.format==='wav'?'Bit depth':'Bitrate'}<select id="exportQuality" ${busy?'disabled':''} title="${settings.format==='wav'?'Bit depth controls the quantization noise floor; float WAV preserves over-range samples.':'Bitrate is the compressed audio data rate; higher rates generally retain more detail.'}">${settings.format==='wav'?[16,24,32].map(bits=>`<option value="${bits}" ${settings.bitDepth===bits?'selected':''}>${bits===32?'32-bit float':`${bits}-bit PCM`}</option>`).join(''):EXPORT_BITRATES.map(rate=>`<option value="${rate}" ${settings.bitrate===rate?'selected':''}>${rate} kbps</option>`).join('')}</select></label><label>Sample rate<select id="exportRate" ${busy?'disabled':''} title="Sample rate sets the number of audio samples per second. Higher rates create larger files and are not an audible quality guarantee.">${rateOptions}</select></label><label>Channels<select id="exportChannels" ${busy?'disabled':''}><option value="2" ${settings.channels===2?'selected':''}>Stereo</option><option value="1" ${settings.channels===1?'selected':''}>Mono downmix</option></select></label>${settings.format==='wav'&&settings.bitDepth!==32?`<label class="export-check"><input id="exportDither" type="checkbox" ${settings.dither?'checked':''} ${busy?'disabled':''} title="TPDF dither can reduce quantization distortion when reducing to integer PCM. Apply once, at final bit-depth conversion."> TPDF dither</label>`:''}`:''}<label class="export-check"><input id="exportMastering" type="checkbox" ${settings.mastering?'checked':''} ${busy?'disabled':''}> Apply Mastering Studio chain</label></div><div class="export-summary"><span>Expected duration</span><strong>${formatExportDuration(duration)} (including effect tails)</strong><span>Output</span><strong>${settings.channels===2?'Stereo':'Mono'} · ${(settings.sampleRate/1000).toFixed(1)} kHz · ${settings.format==='wav'?settings.bitDepth===32?'32-bit float':`${settings.bitDepth}-bit PCM`:settings.bitrate+' kbps MP3'}</strong></div>${warning?`<p class="${memory.allowed?'export-warning':'export-error'}">${esc(warning)}</p>`:''}<p class="hint">WAV supports 44.1/48/88.2/96 kHz with windowed-sinc resampling. MP3 supports 44.1/48 kHz. TPDF dither is only used for integer WAV and is not applied to float WAV or MP3.</p><div class="export-actions"><button id="exportStart" class="primary" ${busy||!memory.allowed?'disabled':''}>${busy?'Exporting…':'Render & Export'}</button><button id="exportCancel" ${busy?'':'hidden'}>Cancel</button><span id="exportStatus" role="status">${esc(exportRun?.message||'Ready to render and encode.')}</span></div><div class="export-progress"><progress id="exportProgress" max="1" value="0" hidden></progress></div><p class="hint export-license">MP3 is encoded locally with <a href="https://github.com/shijinyu/lamejs" target="_blank" rel="noreferrer">LAMEJS</a>, a separately loaded LGPL-3.0 component. No audio is uploaded.</p></section><section class="export-card"><h3>Encoded file analysis</h3>${results}</section></div></section>`;
 $('.export-layout').insertAdjacentHTML('afterend',renderReleaseEditor());
 const warningNode=$('.export-metrics .export-warning');
 if(warningNode&&metric)warningNode.textContent=metric.sourceClippedSamples
  ?`${metric.sourceClippedSamples} pre-encoding sample(s) reached or exceeded full scale. Integer or MP3 encoding can clip these samples.`
  :metric.truePeakDbtp>0?`Estimated true peak is ${metric.truePeakDbtp.toFixed(1)} dBTP, above full scale. MP3 encoding may add further overs.`
   :'Clipping detected in the decoded export. Lower the mix or adjust mastering before release.';
 wireExportStudio();
 organizeExportStudio($('#main'));
 if(restoreFocus){mountMobileEditors();$('#main .mobile-focus-trigger')?.click();if(focusStage)$('#main .mobile-focus-workflow [data-focus-stage="'+focusStage+'"]')?.click()}
}
function openExportStudio(settings={}){
 project.exportSettings=normalizeExportSettings({...project.exportSettings,...settings});save();
 view='export';render();
}
function setExportStatus(message,progress=null){
 if(exportRun)exportRun.message=message;
 const status=$('#exportStatus'),bar=$('#exportProgress');
 if(status)status.textContent=message;
 if(bar){bar.hidden=progress===null;if(progress!==null)bar.value=Math.max(0,Math.min(1,progress))}
}
function updateExportSettings(patch,{redraw=false}={}){
 project.exportSettings=normalizeExportSettings({...project.exportSettings,...patch});save();
 if(redraw&&view==='export')renderExport();
}
function wireExportStudio(){
 $('#exportMode').onchange=event=>updateExportSettings(event.target.value==='advanced'?{advanced:true}:{advanced:false,bitDepth:24,bitrate:320,sampleRate:44100,channels:2,dither:true},{redraw:true});
 $('#exportFormat').onchange=event=>updateExportSettings({format:event.target.value},{redraw:true});
 $('#exportQuality')?.addEventListener('change',event=>updateExportSettings(project.exportSettings.format==='wav'?{bitDepth:Number(event.target.value)}:{bitrate:Number(event.target.value)},{redraw:true}));
 $('#exportRate')?.addEventListener('change',event=>updateExportSettings({sampleRate:Number(event.target.value)},{redraw:true}));
 $('#exportChannels')?.addEventListener('change',event=>updateExportSettings({channels:Number(event.target.value)},{redraw:true}));
 $('#exportDither')?.addEventListener('change',event=>updateExportSettings({dither:event.target.checked}));
 $('#exportMastering').onchange=event=>updateExportSettings({mastering:event.target.checked});
 $('#exportStart').onclick=runExport;
 $('#exportCancel').onclick=()=>exportController?.abort(new DOMException('Export cancelled by user.','AbortError'));
 $$('[data-release-field]').forEach(input=>input.onchange=()=>{project.releaseMetadata=normalizeReleaseMetadata({...project.releaseMetadata,[input.dataset.releaseField]:input.value},project);save();const errors=validateReleaseMetadata(project.releaseMetadata);$('#releaseValidation').textContent=errors.join(' ')||'Metadata is valid and stored with this project.'});
 $('#chooseArtwork').onclick=()=>$('#artworkFile').click();
 $('#artworkFile').onchange=async event=>{const file=event.target.files?.[0];if(file)await processReleaseArtwork(file);event.target.value=''};
 ['artCropX','artCropY','artZoom','artResolution','artFormat'].forEach(id=>$('#'+id)?.addEventListener('change',()=>processReleaseArtwork(null)));
 $('#releaseZipStart').onclick=runReleasePackage;
 $('#releaseZipCancel').onclick=()=>releaseZipController?.abort(new DOMException('Release package cancelled.','AbortError'));
}
async function processReleaseArtwork(file){
 const status=$('#artworkStatus');if(status)status.textContent='Preparing artwork locally…';
 try{
  const keys=artworkKeys();
  if(file){
   if(!['image/jpeg','image/png'].includes(file.type))throw new Error('Choose a JPEG or PNG image.');
   if(file.size>25*1024*1024)throw new Error('Artwork source images are limited to 25 MiB.');
   releaseArtworkSourceBlob=file;await dbSet(keys.source,file);
  }else if(!releaseArtworkSourceBlob)releaseArtworkSourceBlob=await dbGet(keys.source);
  if(!releaseArtworkSourceBlob)throw new Error('Re-import the original artwork image to adjust its crop.');
  const image=await createImageBitmap(releaseArtworkSourceBlob);
  if(image.width*image.height>80000000){image.close();throw new Error('Artwork exceeds the 80-megapixel processing limit.')}
  const cropX=Number($('#artCropX')?.value??project.releaseArtwork?.cropX??50)/100,cropY=Number($('#artCropY')?.value??project.releaseArtwork?.cropY??50)/100,zoom=Number($('#artZoom')?.value??project.releaseArtwork?.zoom??1),resolution=Number($('#artResolution')?.value??project.releaseArtwork?.resolution??3000),mime=$('#artFormat')?.value||project.releaseArtwork?.mime||'image/jpeg';
  const side=Math.min(image.width,image.height)/Math.max(1,zoom),sx=(image.width-side)*cropX,sy=(image.height-side)*cropY,canvas=document.createElement('canvas');canvas.width=resolution;canvas.height=resolution;
  const context=canvas.getContext('2d',{alpha:mime==='image/png'});if(!context)throw new Error('Could not create an artwork canvas.');
  context.drawImage(image,sx,sy,side,side,0,0,resolution,resolution);
  const width=image.width,height=image.height;image.close();
  const optimized=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Artwork encoding failed.')),mime,mime==='image/jpeg'?.92:undefined));
  if(optimized.size>25*1024*1024)throw new RangeError('Prepared artwork exceeds the 25 MiB image limit; choose JPEG or a lower resolution.');
  const prepared=typeof File==='function'?new File([optimized],`cover.${mime==='image/png'?'png':'jpg'}`,{type:mime}):optimized;
  await dbSet(keys.current,prepared);releaseArtworkBlob=prepared;
  if(releaseArtworkUrl)URL.revokeObjectURL(releaseArtworkUrl);releaseArtworkUrl=URL.createObjectURL(optimized);
  project.releaseArtwork={key:keys.current,sourceKey:keys.source,name:releaseArtworkSourceBlob.name||'cover',mime,width,height,resolution,cropX:cropX*100,cropY:cropY*100,zoom};
  save();const message=`Prepared square ${resolution} × ${resolution} ${mime==='image/png'?'PNG':'JPEG'} cover. Original image retained locally.`;
  if(view==='export'){renderExport();$('#artworkStatus').textContent=message}else if(status)status.textContent=message;
 }catch(error){if(status)status.textContent=`Artwork error: ${error.message}`;notify(`Artwork preparation failed: ${error.message}`)}
}
async function getReleaseArtwork(){
 const blob=releaseArtworkBlob||await dbGet(artworkKeys().current);if(!blob)return null;
 return{bytes:new Uint8Array(await blob.arrayBuffer()),type:blob.type||project.releaseArtwork?.mime||'image/jpeg',name:blob.name||project.releaseArtwork?.name||'cover'};
}
function releaseName(value,extension){
 const base=String(value||project.name||'Untitled').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/,'').slice(0,120)||'Untitled';
 return`${base}${extension}`;
}
async function runReleasePackage(){
 if(exportController||releaseZipController)return;
 const selected=[...$$('[data-release-audio]:checked')].map(input=>input.dataset.releaseAudio);
 if(!selected.length)return notify('Select at least one audio format for the release package.');
 const metadata=normalizeReleaseMetadata(project.releaseMetadata,project),errors=validateReleaseMetadata(metadata);
 if(errors.length){$('#releaseValidation').textContent=errors.join(' ');return notify('Correct release metadata before building the package.')}
 const controller=new AbortController();releaseZipController=controller;exportRun={message:'Preparing release package…'};
 $('#releaseZipStart').disabled=true;$('#releaseZipCancel').hidden=false;
 try{
  const settings=normalizeExportSettings(project.exportSettings);
  setExportStatus('Rendering the arrangement once for selected release formats…');
  await engine.init();const buffer=await engine.render(project,buffers,{bypassMastering:!settings.mastering,signal:controller.signal,onProgress:progress=>setExportStatus(`Rendering release audio · ${Math.round(progress*100)}%`,progress)});
  if(controller.signal.aborted)throw controller.signal.reason;
  const entries={},audioEntries=[];
  for(const format of selected){
   if(controller.signal.aborted)throw controller.signal.reason;
   const exportSettings=format==='wav'
    ?{...settings,format:'wav'}
    :{...settings,format:'mp3',sampleRate:[44100,48000].includes(settings.sampleRate)?settings.sampleRate:44100,bitDepth:24,bitrate:settings.bitrate||320};
   setExportStatus(`Encoding release ${format.toUpperCase()}…`);
   const encoded=await encodeExport(buffer,exportSettings,{signal:controller.signal,onProgress:(stage,progress)=>setExportStatus(`${format.toUpperCase()} ${stage} · ${Math.round(progress*100)}%`,progress)});
   const artwork=await getReleaseArtwork(),blob=format==='mp3'?await addId3v23Metadata(encoded.blob,metadata,artwork):addWavInfoMetadata(new Uint8Array(await encoded.blob.arrayBuffer()),metadata);
   const filename=releaseName(metadata.title,format==='mp3'?'.mp3':'.wav'),path=`audio/${filename}`,data=new Uint8Array(await blob.arrayBuffer());
   entries[path]=data;audioEntries.push({path,format,sampleRate:encoded.info.sampleRate,channels:encoded.info.channels,bitDepth:encoded.info.bitDepth||null,bitrate:encoded.info.bitrates||null,size:data.byteLength});
  }
  const artwork=await getReleaseArtwork();if(artwork)entries[`artwork/cover${artwork.type==='image/png'?'.png':'.jpg'}`]=artwork.bytes;
  const releaseMetadata={...metadata,createdAt:new Date().toISOString(),audio:audioEntries,artwork:artwork?`artwork/cover${artwork.type==='image/png'?'.png':'.jpg'}`:null};
  entries['metadata.json']=new TextEncoder().encode(JSON.stringify(releaseMetadata,null,2));
  entries['release-info.txt']=new TextEncoder().encode(`${metadata.title||project.name}\r\n${metadata.artist?`Artist: ${metadata.artist}\r\n`:''}${metadata.album?`Album: ${metadata.album}\r\n`:''}${metadata.releaseDate?`Release date: ${metadata.releaseDate}\r\n`:''}${metadata.isrc?`ISRC: ${metadata.isrc}\r\n`:''}\r\nGenerated locally by EggHeadStudio DAW.\r\n`);
  setExportStatus('Creating release ZIP…');
  const archive=await createReleaseZip(entries,{signal:controller.signal,onProgress:status=>setExportStatus(status.message)});
  if(controller.signal.aborted)throw controller.signal.reason;
  const filename=releaseName(metadata.album||metadata.title||project.name,'_release.zip');download(archive,filename);
  setExportStatus(`Release package created · ${filename} · ${(archive.size/1024/1024).toFixed(1)} MiB.`);
  notify('Release ZIP created with matching audio metadata and artwork.');
 }catch(error){
  if(error?.name==='AbortError')setExportStatus('Release package cancelled.');
  else{setExportStatus(`Release package failed: ${error.message}`);notify(`Release package failed: ${error.message}`)}
 }finally{
  releaseZipController=null;$('#releaseZipStart')?.removeAttribute('disabled');$('#releaseZipCancel').hidden=true;
 }
}
async function runExport(){
 if(exportController||releaseZipController)return;
 const settings=normalizeExportSettings(project.exportSettings),controller=new AbortController();
 exportController=controller;if(exportDownloadUrl){URL.revokeObjectURL(exportDownloadUrl);exportDownloadUrl=null}exportRun={message:'Preparing export…'};
 const initialMemory=estimateExportMemory(estimateProjectRender(project,buffers).durationSeconds,settings);
 if(initialMemory.warning&&!window.confirm(`${exportMemoryWarning(initialMemory)}\n\nContinue?`)){exportController=null;exportRun.message='Export cancelled before rendering.';renderExport();return}
 if(view==='export')renderExport();
 try{
  const releaseMetadata=normalizeReleaseMetadata(project.releaseMetadata,project),metadataErrors=validateReleaseMetadata(releaseMetadata);
  if(metadataErrors.length)throw new Error(`Invalid release metadata: ${metadataErrors.join(' ')}`);
  await engine.init();
  setExportStatus('Rendering arrangement offline…');
  const buffer=await engine.render(project,buffers,{bypassMastering:!settings.mastering,signal:controller.signal,onProgress:progress=>setExportStatus(`Rendering arrangement · ${Math.round(progress*100)}%`,progress)});
  if(controller.signal.aborted)throw controller.signal.reason;
  const memory=estimateExportMemory(buffer.duration,settings,buffer.sampleRate);
  if(!memory.allowed)throw new RangeError(`This render needs an estimated ${Math.ceil(memory.estimatedPeakBytes/1024/1024)} MiB. Reduce output rate or project duration and export again.`);
  setExportStatus(`Resampling and encoding ${settings.format.toUpperCase()}…`);
  const encoded=await encodeExport(buffer,settings,{signal:controller.signal,onProgress:(stage,progress)=>{
   setExportStatus(`${stage==='resample'?'Resampling':'Encoding'} · ${Math.round(progress*100)}%`,progress)
  }});
  if(controller.signal.aborted)throw controller.signal.reason;
  const artwork=await getReleaseArtwork(),outputBlob=settings.format==='mp3'
   ?await addId3v23Metadata(encoded.blob,releaseMetadata,artwork)
   :addWavInfoMetadata(new Uint8Array(await encoded.blob.arrayBuffer()),releaseMetadata);
  setExportStatus('Decoding the encoded file for verification…');
  const decodeContext=new OfflineAudioContext(encoded.info.channels,Math.max(1,Math.ceil(buffer.duration*encoded.info.sampleRate)),encoded.info.sampleRate);
  const decoded=await decodeContext.decodeAudioData(await outputBlob.arrayBuffer());
  if(controller.signal.aborted)throw controller.signal.reason;
  const analysis=await analyzeMasterBufferAsync(decoded,{signal:controller.signal,onProgress:progress=>setExportStatus(`Analyzing encoded output · ${Math.round(progress*100)}%`,progress)});
  if(controller.signal.aborted)throw controller.signal.reason;
  analysis.sourceClippedSamples=encoded.info.sourceClippedSamples||0;
  analysis.clipping=analysis.clipping||analysis.sourceClippedSamples>0||analysis.truePeakDbtp>0;
  const expectedDuration=buffer.duration,durationDifference=Math.abs(decoded.duration-expectedDuration);
  const analysisSummary={integratedLufs:analysis.integratedLufs,truePeakDbtp:analysis.truePeakDbtp,samplePeakDbfs:analysis.samplePeakDbfs,clipping:analysis.clipping,sourceClippedSamples:analysis.sourceClippedSamples};
  const suffix=settings.format==='mp3'?'.mp3':'.wav',filename=`${project.name.replace(/[^\w-]/g,'_')||'Untitled_Project'}${settings.mastering?'_master':''}${suffix}`;
  exportDownloadUrl=URL.createObjectURL(outputBlob);
  exportRun={message:'Export complete. File decoded and analyzed.',info:encoded.info,analysis:analysisSummary,duration:decoded.duration,durationDifference,expectedDuration,downloadUrl:exportDownloadUrl,filename};
  download(outputBlob,filename);
  setExportStatus(`Export complete · ${filename} · ${analysis.integratedLufs.toFixed(1)} LUFS · ${analysis.truePeakDbtp.toFixed(1)} dBTP estimated.`);
  notify(`${settings.format.toUpperCase()} export verified and downloaded.`);
  if(view==='export')renderExport();
 }catch(error){
  if(error?.name==='AbortError')setExportStatus('Export cancelled. Offline processing stops at its next scheduling boundary; temporary audio graphs and encoding workers are released.');
  else{setExportStatus(`Export failed: ${error.message}`);notify(`Export failed: ${error.message}`)}
 }finally{
  exportController=null;
  if(view==='export')renderExport();
 }
}
function renderMaster(){
 const restoreFocus=document.body.classList.contains('mobile-focus-active'),focusStage=mobileFocusStage();
 if(restoreFocus)closeMobileFocus({restoreFocus:false});
 disposeEqEditors();
 const workflowFocus=document.activeElement?.dataset.workflowMasterMove;
 const settings=normalizeMasteringSettings(project.mastering||engine.masteringSettings),customPresets=(()=>{try{return JSON.parse(localStorage.getItem('pulse-master-presets')||'{}')}catch(error){notify(`Could not read mastering presets: ${error.message}`);return{}}})();
 const presetOptions=[...Object.keys(MASTERING_PRESETS),...Object.keys(customPresets)].map(name=>`<option value="${esc(name)}" ${name===settings.preset?'selected':''}>${esc(name)}</option>`).join('');
 $('#main').innerHTML=`<section class="studio mastering-studio"><div class="section-title"><h2>Mastering Studio</h2><p>Render the arrangement mix, audition A/B, then export the processed result. No mastering processing is applied twice.</p></div><div class="mastering-toolbar"><label>Mode <select id="masterMode"><option value="basic" ${settings.mode==='basic'?'selected':''}>Basic</option><option value="advanced" ${settings.mode==='advanced'?'selected':''}>Advanced</option></select></label><label>Preset <select id="masterPreset">${presetOptions}</select></label><label>Input gain <input type="range" min="-24" max="24" step=".1" value="${settings.inputGainDb}" data-master-param="inputGainDb"><output>${settings.inputGainDb.toFixed(1)} dB</output></label><label>Output gain <input type="range" min="-24" max="24" step=".1" value="${settings.outputGainDb}" data-master-param="outputGainDb"><output>${settings.outputGainDb.toFixed(1)} dB</output></label><button id="saveMasterPreset">Save preset…</button><button id="resetMaster">Reset</button><span class="grow"></span><button id="renderMasterPreview" class="primary">Render mix & preview</button></div><div class="master-wave-panel"><div class="master-wave-heading"><strong>Final arrangement mix</strong><span id="masterCompareState">No rendered mix</span></div><div class="master-wave-wrap"><canvas id="masterWaveform" aria-label="Rendered mix waveform"></canvas><i id="masterCursor"></i></div><div class="master-play-controls"><button id="masterPlay" title="Play selected comparison">▶ Play</button><button id="masterStop" title="Stop preview">■ Stop</button><button id="masterCompare" title="Switch between original mix and processed master">A / B Compare</button><button id="masterExport" class="accent">Export Master WAV · 16-bit</button><span id="masterRenderStatus" role="status">Render to create original and mastered comparison buffers.</span></div></div><div class="master-meters"><article><span>RMS (not LUFS)</span><strong id="masterRms">—</strong></article><article><span>Sample peak</span><strong id="masterPeak">—</strong></article><p id="masterClipWarning" class="master-warning" hidden>Peak reaches or exceeds 0 dBFS. Reduce output or adjust processing before exporting.</p></div><details class="master-advanced" ${settings.mode==='advanced'?'open':''}><summary>Master processing chain</summary><section class="master-module"><header><label><input id="masterEqEnabled" type="checkbox" ${settings.eq.enabled?'checked':''}> Parametric EQ · six bands</label></header>${masterEqSvg(settings)}<div class="master-filter-controls"><label>High-pass <input type="range" min="10" max="1000" step="1" value="${settings.eq.lowCut}" data-master-param="eq.lowCut"><output>${Math.round(settings.eq.lowCut)} Hz</output></label><label>Low-pass <input type="range" min="1000" max="22000" step="1" value="${settings.eq.highCut}" data-master-param="eq.highCut"><output>${Math.round(settings.eq.highCut)} Hz</output></label></div><div class="master-band-grid">${masterBandControls(settings)}</div></section><div class="master-module-grid"><section class="master-module"><header><label><input id="masterSatEnabled" type="checkbox" ${settings.saturation.enabled?'checked':''}> Harmonic saturation</label></header><label>Drive <input type="range" min="1" max="12" step=".1" value="${settings.saturation.drive}" data-master-param="saturation.drive"><output>${settings.saturation.drive.toFixed(1)}×</output></label><label>Wet mix <input type="range" min="0" max="1" step=".01" value="${settings.saturation.mix}" data-master-param="saturation.mix"><output>${Math.round(settings.saturation.mix*100)}%</output></label><p class="hint">Waveshaper oversampling set to 4×; this is harmonic saturation, not a multiband exciter.</p></section><section class="master-module"><header><label><input id="masterImagerEnabled" type="checkbox" ${settings.imager.enabled?'checked':''}> Stereo image</label></header><label>Width <input type="range" min="0" max="1.5" step=".01" value="${settings.imager.width}" data-master-param="imager.width"><output>${Math.round(settings.imager.width*100)}%</output></label><p class="hint">Mid/side width; width 0 provides a mono-compatibility check.</p></section><section class="master-module"><header><label><input id="masterLimiterEnabled" type="checkbox" ${settings.limiter.enabled?'checked':''}> Compressor limiter</label></header><label>Ceiling <input type="range" min="-6" max="0" step=".1" value="${settings.limiter.ceiling}" data-master-param="limiter.ceiling"><output>${settings.limiter.ceiling.toFixed(1)} dBFS</output></label><p class="hint">Sample-peak-oriented compressor stage. Not a verified true-peak/lookahead limiter.</p></section><section class="master-module"><header><strong>Output</strong></header><label>Gain <input type="range" min="-24" max="24" step=".1" value="${settings.outputGainDb}" data-master-param="outputGainDb"><output>${settings.outputGainDb.toFixed(1)} dB</output></label><p class="hint">Export is stereo PCM WAV at 44.1 kHz / 16-bit. No LUFS normalization, 24-bit/float WAV, dither controls, or MP3 encoder yet.</p></section></div></details><p class="hint">Loudness shown here is RMS dBFS, not LUFS. The peak meter is sample peak, not true peak. Presets are starting points, not mastering guarantees.</p></section>`;
 $('#renderMasterPreview').insertAdjacentHTML('afterend','<button id="masterCancelAnalysis" hidden>Cancel analysis</button>');
 $('.master-meters').insertAdjacentHTML('beforeend',`<article><span>Integrated loudness</span><strong id="masterIntegrated">—</strong></article><article class="master-advanced-reading"><span>Short-term loudness · 3 s</span><strong id="masterShortTerm">—</strong></article><article class="master-advanced-reading"><span>Momentary loudness · 400 ms</span><strong id="masterMomentary">—</strong></article><article class="master-advanced-reading"><span>Loudness range</span><strong id="masterLra">—</strong></article><article><span>True peak · 4× interpolation estimate</span><strong id="masterTruePeak">—</strong></article><article class="master-advanced-reading"><span>Limiter gain reduction</span><strong id="masterGainReduction">0.0 dB</strong></article><p class="master-target">Reference target: −14 LUFS (guidance only; no loudness normalization). Limiter ceiling: ${settings.limiter.ceiling.toFixed(1)} dBTP.</p><p id="masterBeforeAfter" class="master-before-after master-advanced-reading">Render a mix to compare before/after measurements.</p><div class="master-history master-advanced-reading"><span>Loudness history · 400 ms / 100 ms hop</span><canvas id="masterLoudnessHistory" aria-label="Integrated loudness history over time"></canvas></div>`);
 $$('.master-advanced-reading').forEach(element=>element.hidden=settings.mode!=='advanced');
 $('.master-advanced summary').insertAdjacentHTML('afterend',masterChainOrderHtml(settings));
 $('.master-module-grid').insertAdjacentHTML('afterbegin',masterMultibandHtml(settings));
 $('.master-wave-panel').insertAdjacentHTML('afterend',`<section class="master-monitor-panel"><header><strong>Analysis & monitoring</strong><span>Monitoring modes affect audition only, never the WAV render.</span></header><label>Analysis source <select id="masterSpectrumSource"><option value="A" ${masteringAB==='A'?'selected':''}>A · Unmastered</option><option value="B" ${masteringAB==='B'?'selected':''}>B · Mastered</option></select></label><canvas id="masterSpectrum" aria-label="Live FFT frequency spectrum, logarithmic scale from 20 Hz to 20 kHz"></canvas><div class="master-stereo-readings"><article>Correlation <strong id="masterCorrelation">—</strong></article><article>Balance <strong id="masterBalance">—</strong></article><article>Mono level change <strong id="masterMonoLoss">—</strong></article></div><p id="masterPhaseWarning" class="master-warning" hidden>Potential phase cancellation: negative stereo correlation may reduce level or change tone in mono.</p><div class="master-monitor-controls"><label>Audition <select id="masterMonitorMode"><option value="stereo">Stereo</option><option value="mono">Mono</option><option value="left">Left channel</option><option value="right">Right channel</option><option value="mid">Mid</option><option value="side">Side</option></select></label><label><input id="masterLevelMatch" type="checkbox" ${masterLevelMatch?'checked':''}> Loudness-match A/B</label><span id="masterLevelMatchStatus" role="status">Render to compare loudness.</span></div></section>`);
 $('#masterMonitorMode').value=masterMonitorMode;
 if(masteringPreview)updateMasterAnalysis();
 const limiterSection=$('#masterLimiterEnabled').closest('.master-module'),limiterLabel=$('#masterLimiterEnabled').parentElement;
 limiterLabel.lastChild.textContent=' Lookahead peak limiter';
 limiterSection.querySelector('.hint').textContent='Linked-stereo AudioWorklet limiter with 4× peak estimation, adjustable lookahead and release. The displayed true peak is an estimate.';
 limiterSection.insertAdjacentHTML('beforeend',`<label>Lookahead <input type="range" min="1" max="20" step=".1" value="${settings.limiter.lookaheadMs}" data-master-param="limiter.lookaheadMs"><output>${settings.limiter.lookaheadMs.toFixed(1)} ms</output></label><label>Release <input type="range" min=".005" max="1" step=".005" value="${settings.limiter.release}" data-master-param="limiter.release"><output>${Math.round(settings.limiter.release*1000)} ms</output></label>`);
 syncMasterControl('limiter.ceiling',settings.limiter.ceiling);
 $('.mastering-studio>p.hint:last-child').textContent='LUFS uses K-weighted BS.1770 gating; true peak is a 4× oversampled estimate. Presets are starting points, not mastering guarantees.';
 $('#masterMode').onchange=event=>{setMasteringControl(current=>current.mode=event.target.value,true);$('.master-advanced').open=event.target.value==='advanced';$$('.master-advanced-reading').forEach(element=>element.hidden=event.target.value!=='advanced')};
 $('#masterPreset').onchange=event=>applyMasterPreset(event.target.value);
 $('#saveMasterPreset').onclick=saveMasterPreset;
 $('#resetMaster').onclick=()=>{setMasteringControl(current=>Object.assign(current,normalizeMasteringSettings(DEFAULT_MASTERING_SETTINGS)),true);renderMaster()};
 $('#renderMasterPreview').onclick=renderMasteringPreview;
 $('#masterCancelAnalysis').onclick=()=>masteringAnalysisController?.abort(new DOMException('Loudness analysis was cancelled.','AbortError'));
 $('#masterPlay').onclick=()=>toggleWorkspacePlayback().catch(error=>notify(`Master preview failed: ${error.message}`));
 $('#masterStop').onclick=()=>stopMasteringPlayback();
 $('#masterCompare').onclick=async()=>{const wasPlaying=Boolean(masteringPlayback),offset=wasPlaying?masteringPosition():masteringPausedOffset;masteringAB=masteringAB==='A'?'B':'A';$('#masterSpectrumSource').value=masteringAB;if(masteringPreview){drawMasterWaveform(selectedMasterBuffer());updateMasterAnalysis();if(!wasPlaying&&masteringPausedOffset&&masteringPreview){const cursor=$('#masterCursor');if(cursor)cursor.style.left=`${masteringPausedOffset/selectedMasterBuffer().duration*100}%`}}if(wasPlaying)await playMasteringBuffer(offset)};
 $('#masterExport').textContent='Export Options';
 $('#masterExport').onclick=()=>openExportStudio({format:'wav',mastering:true});
 for(const [id,path]of [['masterEqEnabled','eq.enabled'],['masterSatEnabled','saturation.enabled'],['masterImagerEnabled','imager.enabled'],['masterMultibandEnabled','multiband.enabled'],['masterLimiterEnabled','limiter.enabled'],['masterChainBypass','chainBypass']])$('#'+id).onchange=event=>setMasteringControl(current=>setMasterPath(current,path,event.target.checked),true);
 $$('[data-master-param]').forEach(input=>{const path=input.dataset.masterParam;input.oninput=()=>{const raw=+input.value,value=/^multiband\.bands\.\d+\.(attack|release)$/.test(path)?raw/1000:raw;setMasteringControl(current=>setMasterPath(current,path,value));syncMasterControl(path,raw)};input.onchange=()=>save()});
 $$('[data-multiband-enabled]').forEach(input=>input.onchange=()=>setMasteringControl(current=>current.multiband.bands[Number(input.dataset.multibandEnabled)].enabled=input.checked,true));
 $$('[data-multiband-solo]').forEach(input=>input.onchange=()=>setMasteringControl(current=>{const index=Number(input.dataset.multibandSolo);current.multiband.bands[index].solo=input.checked},true));
 $$('[data-master-move]').forEach(button=>button.onclick=()=>{const order=[...project.mastering.chainOrder],index=Number(button.closest('li').querySelector('span').textContent.split('.')[0])-1,target=Number(button.dataset.masterMove);if(target<0||target>=order.length)return;[order[index],order[target]]=[order[target],order[index]];setMasteringControl(current=>current.chainOrder=order,true);renderMaster()});
 $('#masterSpectrumSource').onchange=async event=>{const wasPlaying=Boolean(masteringPlayback),offset=wasPlaying?masteringPosition():masteringPausedOffset;masteringAB=event.target.value;if(masteringPreview){drawMasterWaveform(selectedMasterBuffer());updateMasterAnalysis()}if(wasPlaying)await playMasteringBuffer(offset)};
 $('#masterMonitorMode').onchange=event=>setMasterMonitorMode(event.target.value);
 $('#masterLevelMatch').onchange=async event=>{masterLevelMatch=event.target.checked;updateMasterAnalysis();if(masteringPlayback)await playMasteringBuffer(masteringPosition())};
 $$('[data-master-band][data-band-param]').forEach(input=>{const index=Number(input.dataset.masterBand),key=input.dataset.bandParam;input.oninput=()=>{setMasteringControl(current=>current.eq.bands[index][key]=+input.value);input.nextElementSibling.textContent=key==='frequency'?`${Math.round(+input.value)} Hz`:key==='gain'?`${(+input.value).toFixed(1)} dB`:(+input.value).toFixed(1)};input.onchange=()=>save()});
 $$('[data-band-enabled]').forEach(input=>input.onchange=()=>setMasteringControl(current=>current.eq.bands[Number(input.dataset.masterBand)].enabled=input.checked,true));
 if(masteringPreview){drawMasterWaveform(selectedMasterBuffer());updateMasterAnalysis();if(masteringPreviewRevision!==masteringRevision){$('#masterRenderStatus').textContent='Live settings updated. Render again for current waveform, analysis and level matching.';$('#masterLevelMatchStatus').textContent='Level matching pending updated render/analysis.'}}
 if(masteringPlayback)$('#masterPlay').textContent='Ⅱ Pause';
 organizeMasteringStudio($('#main'),settings,workflowFocus);
 Object.defineProperty($('.mastering-studio'),'auditionSession',{get:()=>masteringPlayback});
 eqEditors.push(mountMasterEq($('#main'),engine,()=>normalizeMasteringSettings(project.mastering),setMasteringControl,error=>notify(`EQ visualization failed: ${error.message}`),()=>masteringPlayback?masteringPlayback.graph:engine.masteringGraph));
 if(restoreFocus){mountMobileEditors();$('#main .mobile-focus-trigger')?.click();if(focusStage)$('#main .mobile-focus-workflow [data-focus-stage="'+focusStage+'"]')?.click()}
}
function setMasterPath(settings,path,value){const parts=path.split('.');let target=settings;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value}
function masterControlText(path,value){if(path==='eq.lowCut'||path==='eq.highCut'||path.startsWith('multiband.crossovers.'))return`${Math.round(value)} Hz`;if(path==='saturation.drive')return`${value.toFixed(1)}×`;if(path==='saturation.mix'||path==='imager.width')return`${Math.round(value*100)}%`;if(path==='limiter.ceiling')return`${value.toFixed(1)} dBTP`;if(path==='limiter.lookaheadMs')return`${value.toFixed(1)} ms`;if(path==='limiter.release')return`${Math.round(value*1000)} ms`;if(path.endsWith('.ratio'))return`${value.toFixed(1)}:1`;if(path.endsWith('.attack')||path.endsWith('.release'))return`${Math.round(value)} ms`;if(path.endsWith('.threshold')||path.endsWith('.knee')||path.endsWith('.makeup')||path.endsWith('.outputGain'))return`${value.toFixed(1)} dB`;return`${value.toFixed(1)} dB`}
function syncMasterControl(path,value){
 const update=(path,value)=>$$('[data-master-param]').filter(input=>input.dataset.masterParam===path).forEach(input=>{
  input.value=String(value);
  if(input.parameterControl)input.parameterControl.sync();
  else if(input.nextElementSibling)input.nextElementSibling.textContent=masterControlText(path,value);
 });
 update(path,value);
 if(path.startsWith('multiband.crossovers.')){
  project.mastering.multiband.crossovers.forEach((frequency,index)=>update(`multiband.crossovers.${index}`,frequency));
  const[low,high]=project.mastering.multiband.crossovers,lowPosition=Math.log(low/20)/Math.log(1000)*100,highPosition=Math.log(high/20)/Math.log(1000)*100,segments=$$('.multiband-display span');
  if(segments.length===3){segments[0].style.width=`${lowPosition}%`;segments[1].style.width=`${highPosition-lowPosition}%`;segments[2].style.width=`${100-highPosition}%`;segments[0].textContent=`Low · ${Math.round(low)} Hz`;segments[1].textContent=`Mid · ${Math.round(low)}–${Math.round(high)} Hz`;segments[2].textContent=`High · ${Math.round(high)} Hz`}
 }
}
function applyMasterPreset(name){
 const preset=MASTERING_PRESETS[name]||(()=>{try{return JSON.parse(localStorage.getItem('pulse-master-presets')||'{}')[name]}catch(error){notify(`Could not load mastering preset: ${error.message}`);return null}})();
 if(!preset)return notify(`Mastering preset "${name}" was not found.`);
 const next=normalizeMasteringSettings({...project.mastering,...preset,inputGainDb:preset.inputGainDb??0,preset:name});
 setMasteringControl(current=>Object.assign(current,next),true);renderMaster();
}
function saveMasterPreset(){
 const name=prompt('Name this mastering preset:');if(!name?.trim())return;
 try{const presets=JSON.parse(localStorage.getItem('pulse-master-presets')||'{}');project.mastering.preset=name.trim();presets[name.trim()]=normalizeMasteringSettings(project.mastering);localStorage.setItem('pulse-master-presets',JSON.stringify(presets));engine.setMastering(project.mastering);save();notify(`Saved mastering preset "${name.trim()}".`);renderMaster()}catch(error){notify(`Could not save mastering preset: ${error.message}`)}
}
async function startup(){
 let recoveryError=null,savedProject=null;
 mountPwaUpdates({getSafety:pwaUpdateBlockers});
 try{savedProject=localStorage.getItem('pulse-project');if(savedProject)project=normalizeProjectData(parseProject(savedProject));else normalizeProject()}catch(error){recoveryError=error;if(savedProject)recoverySnapshot={key:`pulse-project-recovery-${Date.now()}`,serialized:savedProject};console.error('Project recovery failed; saved project retained.',error)}
 project.mastering=normalizeMasteringSettings(project.mastering||DEFAULT_MASTERING_SETTINGS);engine.masterSettings={...engine.masterSettings,...project.masterSettings};engine.masteringSettings=normalizeMasteringSettings(project.mastering);shell();await restoreAssets();const keys=artworkKeys();releaseArtworkBlob=await dbGet(keys.current);releaseArtworkSourceBlob=await dbGet(keys.source);releaseArtworkUrl=releaseArtworkBlob?URL.createObjectURL(releaseArtworkBlob):null;if(view==='arrange')render();notify(recoveryError?`Saved project could not be restored: ${recoveryError.message}. Its stored data was not replaced.`:'Ready. Import a folder or record your first sample.');
}startup();
