import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync} from '../vendor/fflate/fflate.js';
import {encodeWavAsync,inspectWav} from '../src/export-dsp.js';
import {
 createPortableProjectArchive,createReleaseZip,inspectZipEntries,openPortableProjectArchive
} from '../src/portable-project.js';
import {
 addId3v23Metadata,addWavInfoMetadata,createId3v23Tag,normalizeReleaseMetadata,validateReleaseMetadata
} from '../src/release-metadata.js';
import {createEmptyProject} from '../src/project-state.js';

function bytesOf(text){return new TextEncoder().encode(text)}
function readId3Frames(tag){
 const payloadSize=(tag[6]<<21)|(tag[7]<<14)|(tag[8]<<7)|tag[9],frames=new Map();
 let offset=10;
 while(offset+10<=10+payloadSize){
  if(tag.subarray(offset,offset+4).every(byte=>byte===0))break;
  const id=new TextDecoder().decode(tag.subarray(offset,offset+4)),view=new DataView(tag.buffer,tag.byteOffset+offset+4,4),size=view.getUint32(0,false);
  frames.set(id,tag.subarray(offset+10,offset+10+size));offset+=10+size;
 }
 return frames;
}
function setBlobName(blob,name){Object.defineProperty(blob,'name',{value:name});return blob}
function fixtureProject(){
 const project=createEmptyProject('Portable demo');
 project.modifiedAt='2026-10-27T18:00:00.000Z';project.releaseMetadata={title:'Portable demo',artist:'Ångström'};
 project.exportSettings={format:'mp3',bitrate:256,sampleRate:48000};
 project.mastering={chainOrder:['eq','multiband'],limiter:{enabled:true,ceiling:-1}};
 project.tracks=[{
  id:'track-1',clips:[{id:'clip-1',asset:'audio-a',bar:0,start:0,end:1,rate:1}],pattern:{notes:[{midi:60,beat:0,durationBeats:1}]},
  sampler:{asset:'audio-b',rootNote:60},drumRack:{pads:[{note:36,asset:'audio-a'}]},
  fx:{effects:[{type:'compressor',params:{sidechain:{enabled:true,sourceTrackId:'track-2'}}}]}
 }];
 return project;
}

test('release metadata validates fields and preserves unknown future keys',()=>{
 const project={name:'Track name',bpm:123};
 const metadata=normalizeReleaseMetadata({artist:'Zoë',futureLabel:'kept'},project);
 assert.equal(metadata.title,'Track name');assert.equal(metadata.bpm,123);assert.equal(metadata.futureLabel,'kept');
 assert.deepEqual(validateReleaseMetadata({...metadata,releaseDate:'2025-02-29'}).filter(error=>error.includes('calendar')),['Release date is not a valid calendar date.']);
 assert.ok(validateReleaseMetadata({...metadata,isrc:'INVALID'}).some(error=>error.includes('ISRC')));
 assert.ok(validateReleaseMetadata({...metadata,trackNumber:'0/0'}).some(error=>error.includes('greater than zero')));
 assert.deepEqual(validateReleaseMetadata({...metadata,releaseDate:'2024-02-29',trackNumber:'2/10',discNumber:'1',isrc:'USABC2612345'}),[]);
 assert.equal(normalizeReleaseMetadata(null,{name:'Fallback',bpm:90}).title,'Fallback');
 assert.deepEqual(validateReleaseMetadata(null),['Release metadata must be an object.']);
});

test('ID3v2.3 writes Unicode standard frames, producer TXXX and APIC art',async()=>{
 const artwork={type:'image/png',bytes:Uint8Array.of(0x89,0x50,0x4e,0x47,1,2,3)};
 const metadata={title:'Nuit étoilée',artist:'Björk',albumArtist:'Björk',album:'Été',genre:'Ambient',releaseDate:'2026-10-27',trackNumber:'2/9',discNumber:'1/2',composer:'Zoë',producer:'李',copyright:'© 2026',comments:'Résumé 🎛',bpm:98.5,musicalKey:'F♯m',isrc:'USABC2612345'};
 const tag=createId3v23Tag(metadata,artwork),frames=readId3Frames(tag);
 assert.deepEqual([...tag.subarray(0,5)],[0x49,0x44,0x33,3,0]);
 assert.ok(frames.has('TIT2'));assert.ok(frames.has('TSRC'));assert.ok(frames.has('TXXX'));assert.ok(frames.has('COMM'));assert.ok(frames.has('APIC'));
 const title=frames.get('TIT2');
 assert.equal(title[0],1);assert.equal(new TextDecoder('utf-16le').decode(title.subarray(3)),'Nuit étoilée');
 const apic=frames.get('APIC');assert.equal(apic[0],0);assert.equal(new TextDecoder().decode(apic.subarray(1,10)),'image/png');
 const mp3=await addId3v23Metadata(new Blob([Uint8Array.of(0xff,0xfb,0x90,0x64,1,2)]),metadata,artwork);
 assert.equal(mp3.type,'audio/mpeg');assert.equal((await mp3.arrayBuffer()).byteLength,tag.length+6);
});

test('WAV LIST/INFO metadata preserves PCM samples and parses aligned chunks',async()=>{
 const original=await encodeWavAsync([Float32Array.from([0,.5,-.5])],44100,{bitDepth:16,dither:false});
 const tagged=addWavInfoMetadata(new Uint8Array(original),{title:'Été',artist:'Björk',bpm:120,musicalKey:'A♭m'});
 const bytes=new Uint8Array(await tagged.arrayBuffer()),info=inspectWav(bytes);
 assert.equal(info.channels,1);assert.equal(info.sampleRate,44100);assert.equal(info.frames,3);assert.equal(bytes.length-8,new DataView(bytes.buffer).getUint32(4,true));
 assert.ok(new TextDecoder().decode(bytes).includes('LIST'));assert.ok(new TextDecoder().decode(bytes).includes('INAM'));assert.ok(new TextDecoder().decode(bytes).includes('Björk'));
 assert.deepEqual([...bytes.subarray(info.dataOffset,info.dataOffset+info.dataBytes)],[...new Uint8Array(original).subarray(44)]);
});

test('EHS archive embeds referenced audio once, manifests checksums, and restores project state',async()=>{
 const project=fixtureProject(),raw=setBlobName(new Blob([bytesOf('lossless sample')],{type:'audio/wav'}),'kick.wav');
 const progress=[];
 const archive=await createPortableProjectArchive(project,{assetFiles:new Map([['audio-a',raw],['audio-b',new Blob([bytesOf('lossless sample')],{type:'audio/wav'})]]),onProgress:value=>progress.push(value.stage)});
 assert.equal(archive.type,'application/vnd.eggheadstudio.project+zip');
 const entries=inspectZipEntries(new Uint8Array(await archive.arrayBuffer()));
 assert.ok(entries.some(entry=>entry.path==='manifest.json'));assert.ok(entries.some(entry=>entry.path==='project.json'));
 assert.ok(entries.filter(entry=>entry.path.startsWith('assets/audio/')).every(entry=>entry.method===0),'Audio is stored without extreme compression ratios.');
 const restored=await openPortableProjectArchive(archive);
 assert.equal(restored.project.name,project.name);assert.equal(restored.project.tracks[0].pattern.notes[0].midi,60);
 assert.equal(restored.project.tracks[0].fx.effects[0].params.sidechain.sourceTrackId,'track-2');
 assert.deepEqual(await restored.assetFiles.get('audio-a').text(),'lossless sample');
 assert.equal(restored.manifest.assets['audio-a'].path,restored.manifest.assets['audio-b'].path);
 assert.ok(progress.includes('assets'));
});

test('EHS packages decoded audio as 32-bit float WAV without downsampling',async()=>{
 const samples=Float32Array.from([.25,-.25,.75]),audio={numberOfChannels:1,sampleRate:48000,getChannelData:()=>samples};
 const project=fixtureProject();project.tracks=[{clips:[{asset:'missing-source',bar:0,start:0,end:.1,rate:1}],pattern:{notes:[]}}];
 const archive=await createPortableProjectArchive(project,{audioBuffers:new Map([['missing-source',audio]])});
 const restored=await openPortableProjectArchive(archive),asset=restored.assetFiles.get('missing-source');
 const info=inspectWav(new Uint8Array(await asset.arrayBuffer()));
 assert.equal(info.format,'float');assert.equal(info.sampleRate,48000);assert.equal(info.channels,1);
});

test('EHS rejects missing source assets, traversal paths, corrupt bytes and future versions',async()=>{
 const project=fixtureProject();
 await assert.rejects(createPortableProjectArchive(project),/missing audio asset/);
 const traversal=zipSync({'../evil.txt':bytesOf('bad')});
 await assert.rejects(openPortableProjectArchive(traversal),/unsafe path|traversal/);
 const good=await createPortableProjectArchive(project,{assetFiles:new Map([['audio-a',new Blob([bytesOf('one')])],['audio-b',new Blob([bytesOf('two')])]])});
 const original=unzipSync(new Uint8Array(await good.arrayBuffer()));
 const firstAudio=Object.keys(original).find(path=>path.startsWith('assets/audio/'));
 original[firstAudio][0]^=0xff;
 await assert.rejects(openPortableProjectArchive(zipSync(original)),/SHA-256/);
 const future=unzipSync(new Uint8Array(await good.arrayBuffer())),manifest=JSON.parse(new TextDecoder().decode(future['manifest.json']));
 manifest.formatVersion=999;future['manifest.json']=bytesOf(JSON.stringify(manifest));
 await assert.rejects(openPortableProjectArchive(zipSync(future)),/Unsupported EHS archive version/);
});

test('EHS checksums project files and migrates legacy project schemas',async()=>{
 const legacy=fixtureProject();legacy.schemaVersion=0;
 const archive=await createPortableProjectArchive(legacy,{assetFiles:new Map([['audio-a',new Blob([bytesOf('one')])],['audio-b',new Blob([bytesOf('two')])]])});
 const unpacked=unzipSync(new Uint8Array(await archive.arrayBuffer())),opened=await openPortableProjectArchive(archive);
 assert.equal(opened.project.schemaVersion,1);
 unpacked['project.json']=bytesOf(new TextDecoder().decode(unpacked['project.json']).replace('Portable demo','Xortable demo'));
 await assert.rejects(openPortableProjectArchive(zipSync(unpacked)),/SHA-256 verification failed for project.json/);
});

test('EHS rejects a damaged stored-media ZIP checksum before accepting assets',async()=>{
 const project=fixtureProject(),archive=await createPortableProjectArchive(project,{assetFiles:new Map([['audio-a',new Blob([bytesOf('one')])],['audio-b',new Blob([bytesOf('two')])]])});
 const bytes=new Uint8Array(await archive.arrayBuffer()),view=new DataView(bytes.buffer),decoder=new TextDecoder();let offset=0,damaged=false;
 while(offset+30<=bytes.length){
  if(view.getUint32(offset,true)===0x04034b50){
   const nameLength=view.getUint16(offset+26,true),extraLength=view.getUint16(offset+28,true),path=decoder.decode(bytes.subarray(offset+30,offset+30+nameLength)),dataStart=offset+30+nameLength+extraLength;
   if(path.startsWith('assets/audio/')){bytes[dataStart]^=0x40;damaged=true;break}
   offset=dataStart+view.getUint32(offset+18,true);
  }else offset++;
 }
 assert.equal(damaged,true);
 await assert.rejects(openPortableProjectArchive(bytes),/checksum verification failed|could not be decoded/i);
});

test('EHS accepts projects without samples and validates artwork file signatures',async()=>{
 const project=createEmptyProject('No samples');
 const empty=await createPortableProjectArchive(project),opened=await openPortableProjectArchive(empty);
 assert.equal(opened.assetFiles.size,0);
 const artwork=setBlobName(new Blob([Uint8Array.of(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)],{type:'image/png'}),'cover.png');
 const archive=await createPortableProjectArchive(project,{artworkFile:artwork,artworkSourceFile:artwork});
 assert.equal((await openPortableProjectArchive(archive)).artworkFile.type,'image/png');
 const corrupt=unzipSync(new Uint8Array(await archive.arrayBuffer()));
 const artPath=Object.keys(corrupt).find(path=>path.startsWith('assets/artwork/')&&!path.includes('/original-'));
 corrupt[artPath][0]=0;
 await assert.rejects(openPortableProjectArchive(zipSync(corrupt)),/SHA-256 verification failed/);
});

test('EHS archives round-trip custom mastering presets',async()=>{
 const project=createEmptyProject('Preset archive');
 const presets={'Warm bus':{chainOrder:['eq','saturation'],limiter:{enabled:true,ceiling:-1}},'Bright master':{eq:{enabled:true}}};
 const archive=await createPortableProjectArchive(project,{presets}),opened=await openPortableProjectArchive(archive);
 assert.deepEqual(Object.fromEntries(opened.presetFiles),presets);
});

test('ZIP bomb ratios and excessive uncompressed sizes are rejected before extraction',async()=>{
 const bomb=zipSync({'assets/audio/zeros.bin':new Uint8Array(2*1024*1024)});
 await assert.rejects(openPortableProjectArchive(bomb),/compression ratio/);
});

test('release ZIP contains selected audio, metadata, notes and artwork',async()=>{
 const files={
  'audio/song.wav':Uint8Array.of(1,2),'metadata.json':bytesOf('{"title":"Song"}'),
  'release-info.txt':bytesOf('Song'),'artwork/cover.jpg':Uint8Array.of(0xff,0xd8,0xff)
 };
 const zip=await createReleaseZip(files),entries=inspectZipEntries(new Uint8Array(await zip.arrayBuffer()));
 assert.deepEqual(entries.map(entry=>entry.path).sort(),Object.keys(files).sort());
 const unzipped=unzipSync(new Uint8Array(await zip.arrayBuffer()));
 assert.deepEqual([...unzipped['audio/song.wav']],[1,2]);
 assert.throws(()=>createReleaseZip({'metadata.json':bytesOf('{}')}),/requires metadata.json and release-info.txt/);
});
