import test from 'node:test';
import assert from 'node:assert/strict';
import {OFFLINE_WINDOW_SECONDS,renderOfflineWindows} from '../src/offline-scheduler.js';

function context(seconds=12){
 let suspendAt,resolveSuspend,resolveRender,resumed=0;
 const ctx={sampleRate:44100,length:Math.ceil(seconds*44100),currentTime:0,state:'suspended',
  suspend(time){assert.equal(Math.round(time*this.sampleRate)%128,0);assert.ok(time>this.currentTime);suspendAt=time;return new Promise(resolve=>{resolveSuspend=resolve})},
  advance(){queueMicrotask(()=>{if(resolveSuspend){this.currentTime=suspendAt;this.state='suspended';const resolve=resolveSuspend;resolveSuspend=null;resolve()}else{this.state='closed';resolveRender({length:this.length})}})},
  startRendering(){this.state='running';const result=new Promise(resolve=>{resolveRender=resolve});this.advance();return result},
  async resume(){resumed++;this.state='running';this.advance()},get resumed(){return resumed}
 };
 return ctx;
}

test('one continuous offline context schedules quantum-aligned bounded windows and retains the final tail',async()=>{
 const ctx=context(),scheduled=[],released=[],progress=[];
 const result=await renderOfflineWindows(ctx,{schedule:(from,to)=>scheduled.push([from,to]),release:time=>released.push(time),onProgress:value=>progress.push(value)});
 assert.equal(result.length,ctx.length);
 const windows=Math.ceil(ctx.length/(Math.floor(OFFLINE_WINDOW_SECONDS*ctx.sampleRate/128)*128));
 assert.equal(scheduled.length,windows);assert.equal(ctx.resumed,windows-1);assert.equal(released.length,windows-1);
 assert.equal(scheduled[0][0],0);assert.equal(scheduled.at(-1)[1],12);
 for(let index=1;index<scheduled.length;index++)assert.equal(scheduled[index][0],scheduled[index-1][1]);
 assert.equal(progress.at(-1),1);
});

test('cancellation disposes at the next suspension, then closes the context without scheduling more voices',async()=>{
 const ctx=context(180),controller=new AbortController();let windows=0,disposed=false;
 const resume=ctx.resume.bind(ctx);ctx.resume=()=>{assert.equal(disposed,true);return resume()};
 await assert.rejects(renderOfflineWindows(ctx,{signal:controller.signal,schedule(){windows++;controller.abort()},release(){},dispose(){disposed=true}}),{name:'AbortError'});
 assert.equal(windows,1);assert.equal(ctx.resumed,1);assert.equal(ctx.state,'closed');
});

test('pre-cancelled rendering does not construct voices or start the renderer',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(renderOfflineWindows(context(),{signal:controller.signal,schedule(){assert.fail('scheduled after cancel')},release(){}}),{name:'AbortError'});
});

test('offline processor failure retires the graph before draining the context and still rejects',async()=>{
 const ctx=context();let disposed=false;
 const failure=Promise.reject(new Error('processor failure'));
 await assert.rejects(renderOfflineWindows(ctx,{failure,schedule(){},release(){},dispose(){disposed=true}}),/processor failure/);
 assert.equal(disposed,true);assert.equal(ctx.state,'closed');
});

test('short renders need no suspension and report complete once',async()=>{
 const ctx=context(.5),progress=[],scheduled=[];
 await renderOfflineWindows(ctx,{schedule:(from,to)=>scheduled.push([from,to]),release(){assert.fail('unnecessary release')},onProgress:value=>progress.push(value)});
 assert.deepEqual(scheduled,[[0,.5]]);assert.deepEqual(progress,[1]);
});

test('a short native render failure rejects without leaving an unhandled derived promise',async()=>{
 const ctx=context(.5),error=new Error('Native renderer failed.');let disposed=false;
 ctx.startRendering=()=>{ctx.state='closed';return Promise.reject(error)};
 await assert.rejects(renderOfflineWindows(ctx,{schedule(){},release(){},dispose(){disposed=true}}),value=>value===error);
 assert.equal(disposed,true);
});

for(const seconds of [180,300])test(`${seconds}-second offline scheduling has bounded, gapless windows without restarting DSP`,async()=>{
 const ctx=context(seconds);let until=0,count=0;
 await renderOfflineWindows(ctx,{schedule(from,to){assert.equal(from,until);assert.ok(to-from<=OFFLINE_WINDOW_SECONDS);until=to;count++},release(){}});
 assert.equal(until,seconds);assert.equal(count,ctx.resumed+1);
});
