import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from '../vendor/fflate/fflate.js';
import {buildLibraryTree,createSampleLibrary,findLibraryDuplicate,libraryFolderForAsset,moveLibraryAsset,moveLibraryFolder,normalizeLibraryPath,registerLibraryAsset,removeLibraryFolder,renameLibraryFolder,unpackSamplePack} from '../src/sample-library.js';

test('sample library metadata retains folder identity independently from asset IDs',()=>{
  const library=createSampleLibrary();registerLibraryAsset(library,'asset-a',{folder:'Drums/Room'});
  registerLibraryAsset(library,'asset-b',{folder:'Drums/Room'});
  library.assets['asset-a'].sha256='abc';library.assets['asset-b'].sha256='abc';
  const reloaded=createSampleLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(libraryFolderForAsset({id:'asset-a',name:'one.wav'},reloaded),'Drums/Room');
  assert.equal(libraryFolderForAsset({factory:true,path:'Factory / drums / Kick.wav'},reloaded),'drums');
  assert.equal(findLibraryDuplicate(reloaded,'abc'),'asset-a');
  assert.deepEqual(buildLibraryTree([{id:'asset-a',name:'one.wav'}],reloaded).User.children.Drums.children.Room.assets.map(asset=>asset.id),['asset-a']);
});

test('sample folders can be moved, renamed and removed without deleting asset references',()=>{
  const library=createSampleLibrary();registerLibraryAsset(library,'asset-a',{folder:'Kits/Room'});
  library.folders.push('Other');
  library.selected='Kits/Room';library.expanded['Kits/Room']=true;
  assert.equal(renameLibraryFolder(library,'Kits/Room','Hall'),'Kits/Hall');
  assert.equal(moveLibraryFolder(library,'Kits/Hall','Other'),'Other/Hall');
  assert.equal(library.assets['asset-a'].folder,'Other/Hall');
  moveLibraryAsset(library,'asset-a','');
  assert.equal(removeLibraryFolder(library,'Other/Hall'),'Other');
  assert.equal(library.assets['asset-a'].folder,'');
  assert.equal(normalizeLibraryPath('Other\\Hall'),'Other/Hall');
  assert.throws(()=>normalizeLibraryPath('../escape'),/Unsafe/);
});

test('ZIP sample packs retain nested paths, verify CRC and reject unsafe or oversized archives',async()=>{
  const archive=zipSync({'Drums/Kick.wav':new Uint8Array([0,1,2]),'Drums/Room/Snare.wav':new Uint8Array([3,4,5])});
  const imported=await unpackSamplePack(new Blob([archive],{type:'application/zip'}));
  assert.deepEqual(imported.map(entry=>[entry.folder,entry.file.name]),[['Drums','Kick.wav'],['Drums/Room','Snare.wav']]);
  const unsafe=zipSync({'../Escape.wav':new Uint8Array([0])});
  await assert.rejects(unpackSamplePack(new Blob([unsafe])),/unsafe|traversal/i);
  const compressed=zipSync({'Loops/Long.wav':new Uint8Array(32000)});
  await assert.rejects(unpackSamplePack(new Blob([compressed])),/compression ratio/i);
  const corrupted=archive.slice(),directoryOffset=corrupted.findIndex((value,index)=>value===0x50&&corrupted[index+1]===0x4b&&corrupted[index+2]===0x01&&corrupted[index+3]===0x02);
  corrupted[directoryOffset+16]^=0xff;
  await assert.rejects(unpackSamplePack(new Blob([corrupted])),/checksums|CRC/i);
});
