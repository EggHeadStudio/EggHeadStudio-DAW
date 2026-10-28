import test from 'node:test';
import assert from 'node:assert/strict';
import {saveProjectSnapshot} from '../src/project-storage.js';

function storage(){
 const values=new Map([['pulse-project','previous']]);
 return{values,setItem(key,value){if(this.fail===key)throw new DOMException('Injected storage failure','QuotaExceededError');values.set(key,value)}};
}
test('autosave replaces one complete snapshot and preserves the previous snapshot on quota failure',()=>{
 const store=storage();store.fail='pulse-project';
 assert.throws(()=>saveProjectSnapshot(store,'next'),{name:'QuotaExceededError'});
 assert.equal(store.values.get('pulse-project'),'previous');
 store.fail=null;saveProjectSnapshot(store,'next');
 assert.equal(store.values.get('pulse-project'),'next');
});
test('a corrupt recovered snapshot is backed up before any later edit can replace it',()=>{
 const store=storage(),recovery={key:'pulse-project-recovery-1',serialized:'{corrupt'};
 store.fail=recovery.key;
 assert.throws(()=>saveProjectSnapshot(store,'next',recovery));
 assert.equal(store.values.get('pulse-project'),'previous');
 store.fail='pulse-project';
 assert.throws(()=>saveProjectSnapshot(store,'next',recovery));
 assert.equal(store.values.get(recovery.key),'{corrupt');
 store.fail=null;saveProjectSnapshot(store,'next',recovery);
 assert.equal(store.values.get(recovery.key),'{corrupt');
 assert.equal(store.values.get('pulse-project'),'next');
});
