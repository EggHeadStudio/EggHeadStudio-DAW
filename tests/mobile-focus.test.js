import test from 'node:test';
import assert from 'node:assert/strict';
import {readFocusPreference,writeFocusPreference} from '../src/mobile-focus.js';
import {drumPadBank,drumPadBankCount,PerformanceInputController} from '../src/mobile-performance.js';

function storage(initial='{}'){
 let value=initial;
 return{
  getItem(){return value},
  setItem(_key,next){value=next},
  value(){return value}
 };
}

function voice(releases){
 return{release(options){releases.push(options)}};
}

test('focus preferences are stored independently by workspace and invalid values are ignored',()=>{
 const values=storage();
 assert.equal(readFocusPreference(values,'keys'),null);
 writeFocusPreference(values,'keys','focus');
 writeFocusPreference(values,'sample','continue');
 assert.equal(readFocusPreference(values,'keys'),'focus');
 assert.equal(readFocusPreference(values,'sample'),'continue');
 assert.equal(readFocusPreference(values,'rack'),null);
 assert.throws(()=>writeFocusPreference(values,'rack','auto'),RangeError);
});

test('corrupt focus preferences do not prevent editor use',()=>{
 assert.equal(readFocusPreference(storage('not json'),'keys'),null);
 assert.equal(readFocusPreference(storage('[]'),'keys'),null);
});

test('performance input keeps simultaneous pointers independent and releases each voice',async()=>{
 const releases=[],changes=[],controller=new PerformanceInputController({
  start:async payload=>voice(releases),
  onChange:(payload,delta)=>changes.push([payload,delta])
 });
 await Promise.all([controller.down(1,60),controller.down(2,64)]);
 assert.equal(controller.active.size,2);
 controller.up(1);
 assert.equal(controller.active.size,1);
 controller.up(2);
 assert.deepEqual(releases,[{cancelled:false},{cancelled:false}]);
 assert.deepEqual(changes,[[60,1],[64,1],[60,-1],[64,-1]]);
});

test('cancelled performance pointers release voices immediately and clear activity',async()=>{
 const releases=[],changes=[],controller=new PerformanceInputController({
  start:async payload=>voice(releases),
  onChange:(payload,delta)=>changes.push([payload,delta])
 });
 await controller.down(7,48);
 controller.up(7,{cancelled:true});
 assert.deepEqual(releases,[{cancelled:true}]);
 assert.deepEqual(changes,[[48,1],[48,-1]]);
});

test('sustain retains released notes, but cancellation and focus exit release them',async()=>{
 const releases=[],changes=[],controller=new PerformanceInputController({
  start:async payload=>voice(releases),
  onChange:(payload,delta)=>changes.push([payload,delta])
 });
 controller.setSustain(true);
 await controller.down(1,60);
 controller.up(1);
 assert.equal(releases.length,0);
 controller.setSustain(false);
 assert.deepEqual(releases,[{cancelled:false}]);
 assert.deepEqual(changes,[[60,1],[60,-1]]);

 controller.setSustain(true);
 await controller.down(2,62);
 controller.up(2,{cancelled:true});
 controller.releaseAll();
 assert.deepEqual(releases,[{cancelled:false},{cancelled:true}]);
 assert.deepEqual(changes,[[60,1],[60,-1],[62,1],[62,-1]]);
});

test('a pointer cancelled before asynchronous voice startup cannot leave a note held',async()=>{
 let resolveVoice;
 const releases=[],changes=[];
 const controller=new PerformanceInputController({
  start:()=>new Promise(resolve=>{resolveVoice=resolve}),
  onChange:(payload,delta)=>changes.push([payload,delta])
 });
 const starting=controller.down(9,65);
 controller.up(9,{cancelled:true});
 resolveVoice(voice(releases));
 assert.equal(await starting,false);
 assert.deepEqual(releases,[{cancelled:true}]);
 assert.deepEqual(changes,[]);
});

test('focus exit releases a pending sustained note after its voice starts',async()=>{
 let resolveVoice;
 const releases=[],controller=new PerformanceInputController({
  start:()=>new Promise(resolve=>{resolveVoice=resolve})
 });
 controller.setSustain(true);
 const starting=controller.down(11,60);
 controller.up(11);
 controller.releaseAll();
 resolveVoice(voice(releases));
 assert.equal(await starting,false);
 assert.deepEqual(releases,[{cancelled:true}]);
});

test('pad banks preserve visible pad objects and map racks of one through 32 pads',()=>{
 for(const size of [1,16,17,32]){
  const pads=Array.from({length:size},(_,index)=>({id:`pad-${index}`}));
  const count=drumPadBankCount(pads);
  assert.equal(count,Math.max(1,Math.ceil(size/16)));
  assert.equal(drumPadBank(pads,0)[0],pads[0]);
  assert.equal(drumPadBank(pads,count-1).at(-1),pads.at(-1));
 }
 const pads=Array.from({length:32},(_,index)=>({id:`pad-${index}`}));
 assert.deepEqual(drumPadBank(pads,1).map(pad=>pad.id),Array.from({length:16},(_,index)=>`pad-${index+16}`));
 assert.throws(()=>drumPadBank(pads,2),RangeError);
});
