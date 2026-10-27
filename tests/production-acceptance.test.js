import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeMp3Async,encodeWavAsync,inspectMp3,inspectWav} from '../src/export-dsp.js';
import {createTrackEffect} from '../src/audio.js';
import {DEFAULT_MASTERING_SETTINGS,normalizeMasteringSettings} from '../src/mastering.js';
import {createPortableProjectArchive,getProjectAssetIds,inspectZipEntries,openPortableProjectArchive} from '../src/portable-project.js';

function tone(frequency,phase=0){
 const samples=new Float32Array(4410);
 for(let index=0;index<samples.length;index++)samples[index]=.2*Math.sin(2*Math.PI*frequency*index/44100+phase);
 return samples;
}

function namedBlob(bytes,name,type){
 const blob=new Blob([bytes],{type});
 Object.defineProperty(blob,'name',{value:name});
 return blob;
}

async function acceptanceProject(){
 const channels={kick:[tone(70),tone(70,.2)],bass:[tone(55),tone(55,.15)],lead:[tone(440),tone(660)],loop:[tone(220),tone(330)],recorded:[tone(330),tone(392)],processed:[tone(880),tone(660)]};
 const assets=new Map();
 for(const[name,samples]of Object.entries(channels)){
  const isMp3=name==='lead',bytes=isMp3?await encodeMp3Async(samples,44100,192):await encodeWavAsync(samples,44100,{bitDepth:24,dither:false});
  const filename=name==='recorded'?'simulated-microphone.wav':name==='processed'?'processed-sample.wav':`${name}.${isMp3?'mp3':'wav'}`;
  assets.set(name,namedBlob(bytes,filename,isMp3?'audio/mpeg':'audio/wav'));
 }
 const track=(id,name,extra={})=>({id,name,volume:.8,pan:0,mute:false,solo:false,clips:[],fx:{effects:[]},pattern:{notes:[]},...extra});
 const kickNotes=[0,2,4,6].map((beat,index)=>({id:`kick-${index}`,midi:36,beat,durationBeats:.25,velocity:.85,pad:0}));
 const kick=track('kick','Drum Rack',{drumRack:{steps:16,pads:Array.from({length:16},(_,index)=>({name:`Pad ${index+1}`,note:36+index,asset:index===0?'kick':index===1?'loop':null,volume:1,pitch:0,pan:0,mute:false}))},pattern:{notes:kickNotes}});
 const compressor=createTrackEffect('compressor');
 compressor.params.sidechain={enabled:true,sourceTrackId:'kick',position:'pre',ghost:true,detectorGain:0,lowCut:35};
 const bass=track('bass','Bass Sampler',{sampler:{asset:'bass',rootNote:36,start:0,end:.1,mode:'melodic'},pattern:{notes:[0,2,4,6].map((beat,index)=>({id:`bass-${index}`,midi:36+index,beat,durationBeats:1,velocity:.8}))},fx:{effects:[compressor]}});
 const lead=track('lead','Lead Sampler',{sampler:{asset:'lead',rootNote:69,start:0,end:.1,mode:'melodic'},pattern:{notes:[{id:'lead-1',midi:69,beat:0,durationBeats:1,velocity:.8},{id:'lead-2',midi:72,beat:2,durationBeats:1,velocity:.7}]}});
 const clip=(id,asset)=>({id,asset,bar:0,start:0,end:.1,rate:1,gain:.5});
 const project={
  id:'production-acceptance',schemaVersion:1,name:'Production Acceptance',bpm:112,patternBeats:64,
  tracks:[
   kick,bass,lead,
   track('wav','Imported WAV',{clips:[clip('wav-clip','loop')]}),
   track('mp3','Imported MP3',{clips:[clip('mp3-clip','lead')]}),
   track('recorded','Simulated Recording',{clips:[clip('recorded-clip','recorded')]}),
   track('processed','Processed Sample',{clips:[clip('processed-clip','processed')]}),
   track('texture','Texture Audio',{clips:[clip('texture-clip','bass')]})
  ],
  mastering:normalizeMasteringSettings({...DEFAULT_MASTERING_SETTINGS,saturation:{...DEFAULT_MASTERING_SETTINGS.saturation,enabled:true},imager:{...DEFAULT_MASTERING_SETTINGS.imager,enabled:true},multiband:{...DEFAULT_MASTERING_SETTINGS.multiband,enabled:true},limiter:{...DEFAULT_MASTERING_SETTINGS.limiter,enabled:true}}),
  exportSettings:{format:'wav',bitDepth:24,sampleRate:44100,channels:2,mastering:true},
  releaseMetadata:{title:'Acceptance Render',artist:'Test Artist',bpm:112},
  releaseArtwork:{key:'production-acceptance:artwork'}
 };
 const artwork=namedBlob(Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]),'cover.png','image/png');
 return{project,assets,artwork};
}

test('eight-track production project archives every referenced audio asset and restores editable state',async()=>{
 const{project,assets,artwork}=await acceptanceProject();
 const masteringPreset={chainOrder:['eq','multiband'],limiter:{enabled:true,ceiling:-1}};
 const archive=await createPortableProjectArchive(project,{assetFiles:assets,artworkFile:artwork,artworkSourceFile:artwork,presets:{'Custom Master':masteringPreset}});
 const zipEntries=inspectZipEntries(new Uint8Array(await archive.arrayBuffer()));
 const restored=await openPortableProjectArchive(archive);
 const referenced=getProjectAssetIds(project);

 assert.equal(project.tracks.length,8);
 assert.deepEqual(referenced,new Set(assets.keys()));
 assert.equal(restored.project.tracks.length,8);
 assert.deepEqual(restored.project,project);
 assert.equal(restored.project.tracks[0].drumRack.pads.filter(pad=>pad.asset).length,2);
 assert.equal(restored.project.tracks[1].fx.effects[0].params.sidechain.sourceTrackId,'kick');
 assert.equal(restored.project.tracks[1].pattern.notes.length,4);
 assert.equal(restored.project.tracks[2].pattern.notes.length,2);
 assert.deepEqual(Object.fromEntries(restored.presetFiles),{'Custom Master':masteringPreset});
 assert.equal(restored.artworkFile.type,'image/png');
 assert.ok(zipEntries.some(entry=>entry.path==='assets/audio/'+restored.manifest.assets.lead.path.split('/').at(-1)));

 for(const id of referenced){
  const actual=new Uint8Array(await restored.assetFiles.get(id).arrayBuffer());
  const expected=new Uint8Array(await assets.get(id).arrayBuffer());
  assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(expected).digest('hex'),`Asset ${id} changed during archive round-trip.`);
 }

 assert.equal(inspectWav(new Uint8Array(await restored.assetFiles.get('kick').arrayBuffer())).channels,2);
 assert.ok(inspectMp3(new Uint8Array(await restored.assetFiles.get('lead').arrayBuffer())).bitrates.includes(192));
});
