import test from 'node:test';
import assert from 'node:assert/strict';
import {disposeProcessor} from '../src/mastering.js';
import {FeedForwardCompressorProcessor} from '../src/sidechain-processor.js';

test('disposing a processor removes handlers, sends retirement and closes its port',()=>{
 const actions=[],node={onprocessorerror(){},port:{onmessage(){},postMessage:message=>actions.push(message),close:()=>actions.push('closed')}};
 disposeProcessor(node);
 assert.equal(node.onprocessorerror,null);assert.equal(node.port.onmessage,null);
 assert.deepEqual(actions,[{type:'dispose'},'closed']);
 disposeProcessor({disconnect(){}});
});

test('disposed sidechain Worklets retire instead of retaining an active silent processor',()=>{
 const processor=new FeedForwardCompressorProcessor();
 processor.port.onmessage({data:{type:'dispose'}});
 assert.equal(processor.process([],[]),false);
});

test('both mastering Worklets retire after graph disposal',async()=>{
 const saved={AudioWorkletProcessor:globalThis.AudioWorkletProcessor,registerProcessor:globalThis.registerProcessor,sampleRate:globalThis.sampleRate},classes=new Map();
 globalThis.sampleRate=44100;
 globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage(){}}}};
 globalThis.registerProcessor=(name,processor)=>classes.set(name,processor);
 try{
  await import('../src/mastering-processor.js');
  assert.equal(classes.size,2);
  for(const Processor of classes.values()){
   const processor=new Processor({processorOptions:{channels:2}});
   processor.port.onmessage({data:{type:'dispose'}});
   assert.equal(processor.process([],[]),false);
  }
 }finally{
  for(const[name,value]of Object.entries(saved))if(value===undefined)delete globalThis[name];else globalThis[name]=value;
 }
});
