import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderedAudioBus} from '../src/ordered-audio-bus.js';

function fixture(){
  const nodes=[],destination={};
  const context={createGain(){
    const node={gain:{value:0},outputs:new Set(),connect(target){this.outputs.add(target)},disconnect(target){if(target)this.outputs.delete(target);else this.outputs.clear()}};
    nodes.push(node);return node;
  }};
  return{bus:createOrderedAudioBus(context,destination),nodes,destination};
}

test('ordered audio bus uses unity pairwise sums in insertion order',()=>{
  const {bus,nodes,destination}=fixture(),inputs=Array.from({length:4},()=>bus.addInput());
  for(let i=0;i<nodes.length;i++){
    assert.equal(inputs[i].input,nodes[i]);assert.equal(nodes[i].gain.value,1);
    assert.deepEqual([...nodes[i].outputs],[nodes[i+1]||destination]);
  }
});

test('retiring voices reuses deterministic slots without altering remaining order',()=>{
  const {bus,nodes,destination}=fixture(),inputs=Array.from({length:4},()=>bus.addInput());
  inputs[1].disconnect();inputs[0].disconnect();inputs[3].disconnect();
  const next=bus.addInput();assert.equal(next.input,nodes[0]);
  inputs[0].disconnect();
  const another=bus.addInput();assert.equal(another.input,nodes[1]);
  assert.equal(nodes.length,4);
  for(let i=0;i<nodes.length;i++)assert.deepEqual([...nodes[i].outputs],[nodes[i+1]||destination]);
  bus.disconnect();assert.ok(nodes.every(node=>!node.outputs.size));
  inputs[2].disconnect();bus.disconnect();
  assert.throws(()=>bus.addInput(),/disposed/);
});

test('subsequent windows retain only the peak slot count and disposal releases every sum',()=>{
  const {bus,nodes,destination}=fixture(),first=bus.addInput();
  first.disconnect();const next=bus.addInput();
  assert.equal(next.input,nodes[0]);assert.equal(nodes.length,1);assert.deepEqual([...next.input.outputs],[destination]);
  next.disconnect();
  for(let window=0;window<100;window++){
    const active=Array.from({length:6},()=>bus.addInput());
    active.forEach(slot=>slot.disconnect());assert.equal(nodes.length,6);
  }
  bus.disconnect();assert.ok(nodes.every(node=>!node.outputs.size));
});
