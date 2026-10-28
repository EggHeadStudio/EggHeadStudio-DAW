import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildStatic} from '../scripts/build-static.mjs';

test('static deployment versions the entire module, Worker, Worklet, vendor and CSS namespace deterministically',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'ehs-static-test-'));
 try{
  const source=join(temporary,'source'),output=join(temporary,'output');
  await mkdir(join(source,'src'),{recursive:true});await mkdir(join(source,'vendor'),{recursive:true});
  await writeFile(join(source,'index.html'),'<html><head><link href="./src/style.css"></head><script src="./src/app.js"></script></html>');
  const sources={'app.js':"import './audio.js';new Worker(new URL('./worker.js',import.meta.url));",'audio.js':"import '../vendor/dsp.js';",'worker.js':'postMessage(1);','style.css':'body{color:red}'};
  for(const[name,content]of Object.entries(sources))await writeFile(join(source,'src',name),content);
  await writeFile(join(source,'vendor','dsp.js'),'export const quality=4;');
  const first=await buildStatic({source,output}),again=await buildStatic({source,output});
  assert.equal(first.version,again.version);
  const html=await readFile(join(output,'index.html'),'utf8');
  assert.ok(html.includes(`./assets/${first.version}/src/app.js`));
  assert.ok(html.includes(`./assets/${first.version}/src/style.css`));
  assert.ok(html.includes(`name="ehs-build" content="${first.version}"`));
  const url=new URL(`./assets/${first.version}/src/app.js`,'https://example.test/repository/');
  assert.equal(new URL('../vendor/dsp.js',url).pathname,`/repository/assets/${first.version}/vendor/dsp.js`);
  assert.equal(await readFile(join(output,'assets',first.version,'src','worker.js'),'utf8'),sources['worker.js']);
  await writeFile(join(source,'vendor','dsp.js'),'export const quality=8;');
  const changed=await buildStatic({source,output});
  assert.notEqual(changed.version,first.version);
  assert.equal(await readFile(join(output,'assets',first.version,'vendor','dsp.js'),'utf8'),'export const quality=4;');
  assert.deepEqual(JSON.parse(await readFile(join(output,'version.json'),'utf8')),{version:changed.version});
 }finally{await rm(temporary,{recursive:true,force:true})}
});
