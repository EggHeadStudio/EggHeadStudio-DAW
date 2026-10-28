import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MultibandCompressor} from '../src/mastering-dsp.js';

test('block coefficient caching preserves exact pre-optimization multiband PCM across settings changes',()=>{
 const expected=new Map([[44100,'506326b5bf5c969122f52199be4bd3913bbe2a944ae40e8572eced654ecfb8e2'],[48000,'0eefd6b6b27021016c62b3e1dd108880426e3a4b35aef1eaca638c325fcdcc70'],[96000,'581b1af9a96530aad2561eee845b4dcd6461b8c58694d1db9332306840071275']]);
 for(const [sampleRate,digest]of expected){
  const processor=new MultibandCompressor(sampleRate,2,{enabled:true}),hash=createHash('sha256');
  for(let block=0;block<5;block++){
   processor.update({enabled:true,crossovers:[180,2800],bands:Array.from({length:3},(_,i)=>({threshold:-24+i*3,ratio:4,knee:block===1?0:6,attack:block<2?.005:.02,release:.2,makeup:2,outputGain:-1,solo:block===3&&i===1,enabled:block!==4||i!==2}))});
   const input=[Float32Array.from({length:512},(_,n)=>.3*Math.sin((n+block*512)*.12)),Float32Array.from({length:512},(_,n)=>.2*Math.cos((n+block*512)*.15))],output=[new Float32Array(512),new Float32Array(512)];
   processor.process(input,output);
   for(const data of output)hash.update(new Uint8Array(data.buffer));
  }
  assert.equal(hash.digest('hex'),digest,`sample rate ${sampleRate}`);
 }
});

test('multiband attack and release exponentials are computed six times per block, not per frame',()=>{
 const processor=new MultibandCompressor(44100,2,{enabled:true}),input=[new Float32Array(128).fill(.25),new Float32Array(128).fill(.2)],output=[new Float32Array(128),new Float32Array(128)];
 const exp=Math.exp;let calls=0;
 Math.exp=value=>{calls++;return exp(value)};
 try{processor.process(input,output)}finally{Math.exp=exp}
 assert.equal(calls,6);
});
