import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,zipSync} from '../vendor/fflate/fflate.js';
import {estimateProjectRender} from '../src/audio.js';
import {createInstrumentClip,migrateInstrumentArrangement,resizeInstrumentClip,sliceInstrumentClip} from '../src/instrument-clips.js';
import {instrumentEvents} from '../src/instrument-playback.js';
import {createPortableProjectArchive,openPortableProjectArchive} from '../src/portable-project.js';
import {createEmptyProject,createProjectTrack,normalizeProjectSchema,parseProject,serializeProject} from '../src/project-state.js';
import {instrumentFixture} from './instrument-fixture.js';

const bytesOf=value=>new TextEncoder().encode(value);

test('legacy project factory and schema-1 JSON behavior remain unchanged',()=>{
  const project=createEmptyProject('Legacy');
  assert.equal(project.schemaVersion,1);
  const parsed=parseProject(serializeProject(project));
  assert.equal(parsed.schemaVersion,1);
  assert.deepEqual(parsed.tracks,[]);
  assert.equal(createProjectTrack({name:'Sampler',color:'#aabbcc',type:'sampler',assetId:'tone',duration:1},'sampler').pattern.notes.length,0);
});

test('typed instrument JSON requires schema 2 and round-trips stable references',()=>{
  const {project}=instrumentFixture();
  const serialized=serializeProject(project),parsed=parseProject(serialized);
  assert.equal(parsed.schemaVersion,2);
  assert.deepEqual(parsed.tracks,project.tracks);
  assert.throws(()=>parseProject(JSON.stringify({...project,schemaVersion:1})),/require project schema 2/);
  assert.throws(()=>parseProject(JSON.stringify({...createEmptyProject(),schemaVersion:2})),/requires typed instrument clips/);
  assert.throws(()=>parseProject('{"schemaVersion":3,"bpm":120,"tracks":[]}'),/Unsupported project schema version/);
  assert.throws(()=>serializeProject({...createEmptyProject(),schemaVersion:-1}),/Unsupported project schema version/);
});

test('typed track creation and normalization are additive to the legacy factory',()=>{
  const legacy=createProjectTrack({name:'Legacy sampler',color:'#aabbcc',type:'sampler',assetId:'tone',duration:1},'legacy');
  const typed=createProjectTrack({name:'Typed sampler',color:'#aabbcc',type:'sampler',assetId:'tone',duration:1},'typed',{instrumentClipModel:true});
  assert.ok(legacy.pattern);
  assert.equal(typed.pattern,undefined);
  assert.deepEqual(typed.patterns,[]);
  const project={schemaVersion:1,bpm:120,tracks:[typed]};
  assert.equal(normalizeProjectSchema(project).schemaVersion,1);
  let serial=0;
  const clip=createInstrumentClip(typed,0,()=>`typed-${++serial}`);
  assert.equal(typed.patterns[0].lengthBeats,4);
  assert.equal(clip.durationBeats,4);
  assert.equal(normalizeProjectSchema(project).schemaVersion,2);
});

test('legacy migration preserves final-note tails and empty-pattern render duration',()=>{
  let serial=0;
  const id=()=>`migrated-${++serial}`;
  const buffers=new Map([['tone',{duration:8}]]);
  const tailProject={bpm:120,patternBeats:16,tracks:[{
    id:'tail',clips:[],sampler:{asset:'tone',rootNote:60,start:0,end:8,mode:'melodic'},
    pattern:{notes:[{beat:14,midi:60,durationBeats:4,velocity:.8}]}
  }]};
  const before=[...instrumentEvents(tailProject.tracks[0],buffers,120,16)];
  migrateInstrumentArrangement(tailProject,id);
  const after=[...instrumentEvents(tailProject.tracks[0],buffers,120,16)];
  assert.equal(tailProject.tracks[0].clips[0].legacyTail,true);
  assert.equal(after[0].at,before[0].at);
  assert.equal(after[0].until,before[0].until);

  const emptyProject={bpm:120,patternBeats:64,tracks:[{
    id:'empty',clips:[],sampler:{asset:'tone',rootNote:60,start:0,end:8,mode:'melodic'},pattern:{notes:[]}
  }]};
  const beforeDuration=estimateProjectRender(emptyProject,buffers).durationSeconds;
  migrateInstrumentArrangement(emptyProject,id);
  assert.equal(emptyProject.tracks[0].clips[0].durationBeats,16);
  assert.equal(estimateProjectRender(emptyProject,buffers).durationSeconds,beforeDuration);
});

test('partial slices and deliberate trims clear migrated legacy tails without changing the source',()=>{
  let serial=0;
  const project={bpm:120,patternBeats:16,tracks:[{
    id:'tail',clips:[],sampler:{asset:'tone',rootNote:60,start:0,end:8,mode:'melodic'},
    pattern:{notes:[{beat:14,midi:60,durationBeats:4,velocity:.8}]}
  }]};
  migrateInstrumentArrangement(project,()=>`trim-${++serial}`);
  const track=project.tracks[0],source=track.clips[0],pattern=track.patterns[0];
  assert.equal(source.legacyTail,true);
  const sliced=sliceInstrumentClip(source,8,15,`slice-${++serial}`);
  assert.equal(source.legacyTail,true);
  assert.equal(sliced.legacyTail,undefined);
  const sourceEvent=[...instrumentEvents(track,new Map([['tone',{duration:8}]]),120,16)][0];
  assert.equal(sourceEvent.until,Infinity);
  const slicedTrack={...track,clips:[sliced]};
  const slicedEvent=[...instrumentEvents(slicedTrack,new Map([['tone',{duration:8}]]),120,16)][0];
  assert.equal(slicedEvent.until,7.5);

  resizeInstrumentClip(source,'end',15,pattern);
  assert.equal(source.legacyTail,undefined);
  const resizedEvent=[...instrumentEvents(track,new Map([['tone',{duration:8}]]),120,16)][0];
  assert.equal(resizedEvent.until,7.5);
});

test('schema-2 EHS archive round-trips typed patterns and all referenced asset metadata',async()=>{
  const {project}=instrumentFixture();
  const assetFiles=new Map([
    ['tone',Object.assign(new Blob([bytesOf('tone')],{type:'audio/wav'}),{name:'tone.wav'})],
    ['hit',Object.assign(new Blob([bytesOf('hit')],{type:'audio/ogg'}),{name:'hit.ogg'})]
  ]);
  const archive=await createPortableProjectArchive(project,{assetFiles});
  const opened=await openPortableProjectArchive(archive,{useWorker:false});
  assert.equal(opened.manifest.formatVersion,1);
  assert.equal(opened.manifest.projectSchemaVersion,2);
  assert.deepEqual(opened.manifest.compatibility.requiredFeatures,['instrumentClips']);
  assert.equal(opened.project.schemaVersion,2);
  assert.deepEqual(opened.project.tracks,project.tracks);
  assert.equal(opened.assetMetadata.get('tone').name,'tone.wav');
  assert.equal(opened.assetMetadata.get('tone').mime,'audio/wav');
  assert.equal(await opened.assetFiles.get('hit').text(),'hit');
});

test('schema-2 portable validation rejects missing assets, broken pattern references and missing feature markers',async()=>{
  const {project}=instrumentFixture();
  const files=new Map([['tone',new Blob([bytesOf('tone')],{type:'audio/wav'})],['hit',new Blob([bytesOf('hit')],{type:'audio/ogg'})]]);
  const broken=structuredClone(project);
  broken.tracks[1].clips[0].patternId='missing-pattern';
  await assert.rejects(createPortableProjectArchive(broken,{assetFiles:files}),/pattern reference/);
  await assert.rejects(createPortableProjectArchive(project,{assetFiles:new Map([['tone',files.get('tone')]])}),/missing audio asset "hit"/);

  const archive=await createPortableProjectArchive(project,{assetFiles:files});
  const entries=unzipSync(new Uint8Array(await archive.arrayBuffer()));
  const manifest=JSON.parse(new TextDecoder().decode(entries['manifest.json']));
  delete manifest.compatibility.requiredFeatures;
  entries['manifest.json']=bytesOf(JSON.stringify(manifest));
  await assert.rejects(openPortableProjectArchive(zipSync(entries),{useWorker:false}),/required instrumentClips compatibility marker/);
});

test('schema-2 clip and note safety validation rejects malformed records before archive creation',async()=>{
  const {project}=instrumentFixture();
  project.tracks[1].patterns[0].notes[0].midi=128;
  const files=new Map([['tone',new Blob([bytesOf('tone')])],['hit',new Blob([bytesOf('hit')])]]);
  await assert.rejects(createPortableProjectArchive(project,{assetFiles:files}),/Invalid instrument note/);
});
