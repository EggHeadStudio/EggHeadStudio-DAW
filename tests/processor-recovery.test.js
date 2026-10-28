import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioEngine} from '../src/audio.js';

test('processor failure stops voices, disposes failed graphs and surfaces the error before retry',()=>{
 const engine=new AudioEngine(),disposed=[],source={stop(){disposed.push('source-stop')},disconnect(){disposed.push('source-disconnect')}};
 engine.ctx={currentTime:1};engine.playing=true;engine.startedAt=0;engine.offset=0;
 engine.registerSource(source);engine.readMeters=()=>({});
 engine.trackNodes.set('track',{disconnect(){disposed.push('track')}});
 engine.masteringGraph={disconnect(){disposed.push('mastering')}};
 engine.master={disconnect(){disposed.push('output')}};
 const error=new Error('processor failed');let reported;
 engine.onError=value=>{reported=value;assert.equal(engine.sources.length,0);assert.equal(engine.trackNodes.size,0)};
 engine.handleProcessorError(error);
 assert.strictEqual(reported,error);assert.equal(engine.playing,false);
 assert.equal(engine.masteringGraph,null);
 assert.deepEqual(disposed,['source-stop','source-disconnect','track','mastering','output']);
});
