// Browser-side diagnostic: fresh native graphs, identical PCM, no project mutations.
import {createMasteringGraph,normalizeMasteringSettings} from '../src/mastering.js';
import {renderOfflineWindows} from '../src/offline-scheduler.js';
import {createOrderedAudioBus} from '../src/ordered-audio-bus.js';

export function comparePcm(reference,actual,sampleRate){
  if(reference.length!==actual.length)throw new Error('PCM shape changed.');
  let square=0,maximum=0,first=-1,referencePeak=0,actualPeak=0;
  const windows=Array.from({length:Math.ceil(reference.length/sampleRate)},()=>({maximum:0,square:0,count:0}));
  for(let i=0;i<reference.length;i++){
    const delta=actual[i]-reference[i],absolute=Math.abs(delta),window=windows[Math.floor(i/sampleRate)];
    if(delta!==0&&first<0)first=i;
    maximum=Math.max(maximum,absolute);square+=delta*delta;
    referencePeak=Math.max(referencePeak,Math.abs(reference[i]));actualPeak=Math.max(actualPeak,Math.abs(actual[i]));
    window.maximum=Math.max(window.maximum,absolute);window.square+=delta*delta;window.count++;
  }
  return{maximum,rms:Math.sqrt(square/reference.length),firstDifferingSample:first,peakDifference:actualPeak-referencePeak,
    windows:windows.map(({maximum,square,count})=>({maximum,rms:Math.sqrt(square/count)}))};
}

export function deterministicPcm(ctx,seconds=2){
  const buffer=ctx.createBuffer(2,Math.round(seconds*ctx.sampleRate),ctx.sampleRate);
  let seed=123456789;
  for(let i=0;i<buffer.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const t=i/ctx.sampleRate,noise=(seed/4294967296*2-1)*.025;
    buffer.getChannelData(0)[i]=noise+.08*Math.sin(2*Math.PI*1000*t)+.03*Math.sin(2*Math.PI*(40*t+4000*t*t/seconds))+(i===0?.1:0);
    buffer.getChannelData(1)[i]=noise*.3+.06*Math.sin(2*Math.PI*523.25*t)+(i===127?.1:0);
  }
  return buffer;
}

export async function runMasteringRepeatability({repeats=4,sampleRates=[44100,48000]}={}){
  const results=[];
  for(const sampleRate of sampleRates){
    const base=normalizeMasteringSettings(),variants=[
      ['no-effects',null],
      ['eq-bypassed',{...base,eq:{...base.eq,enabled:false}}],
      ['eq-flat',{...base,eq:{...base.eq,lowCutEnabled:false,highCutEnabled:false}}],
      ['eq-bell',{...base,eq:{...base.eq,lowCutEnabled:false,highCutEnabled:false,bands:base.eq.bands.map((band,index)=>({...band,gain:index===2?6:0}))}}],
      ['eq-multiple',{...base,eq:{...base.eq,lowCutEnabled:false,highCutEnabled:false,bands:base.eq.bands.map((band,index)=>({...band,gain:[2,-3,6,-2,4,1][index]}))}}],
      ['eq-cuts',base],
      ['eq-remaining',{...base,saturation:{enabled:true,drive:1.5,mix:.15},imager:{enabled:true,width:.8}}],
      ['full-chain',{...base,saturation:{enabled:true,drive:1.5,mix:.15},imager:{enabled:true,width:.8},multiband:{...base.multiband,enabled:true},limiter:{...base.limiter,enabled:true}}]
    ];
    for(const [name,settings]of variants){
      let reference,levels;const comparisons=[];
      for(let repeat=0;repeat<repeats;repeat++){
        const ctx=new OfflineAudioContext(6,Math.round(sampleRate*2.2),sampleRate),merger=ctx.createChannelMerger(6),source=ctx.createBufferSource();
        const nodes=[merger,source];source.buffer=deterministicPcm(ctx);
        const tap=(node,offset)=>{
          const splitter=ctx.createChannelSplitter(2);nodes.push(splitter);node.connect(splitter);
          splitter.connect(merger,0,offset);splitter.connect(merger,1,offset+1);
        };
        let graph;
        if(settings){
          if(name==='full-chain'){
            await ctx.audioWorklet.addModule(new URL('../src/mastering-processor.js',import.meta.url));
            ctx.masteringLimiterReady=true;
          }
          const output=ctx.createGain();nodes.push(output);
          graph=createMasteringGraph(ctx,settings,output);source.connect(graph.input);
          tap(output,0);tap(graph.eqTaps.pre,2);tap(graph.eqTaps.post,4);
        }else{tap(source,0);tap(source,2);tap(source,4)}
        merger.connect(ctx.destination);source.start(0);
        try{
          const rendered=await ctx.startRendering(),pcm=Array.from({length:6},(_,channel)=>rendered.getChannelData(channel).slice());
          if(!reference){
            reference=pcm;levels=pcm.map(data=>({rms:Math.sqrt(data.reduce((sum,value)=>sum+value*value,0)/data.length),peak:data.reduce((peak,value)=>Math.max(peak,Math.abs(value)),0)}));
            if(levels.some(channel=>channel.rms<.001||channel.peak>=1))throw new Error(`Silent or clipped ${name} fixture.`);
          }
          else{
            const comparison=pcm.map((data,channel)=>comparePcm(reference[channel],data,sampleRate));
            if(comparison.some(channel=>channel.maximum>1e-4||channel.rms>1e-6))throw new Error(`Fixed-PCM ${name} is not repeatable.`);
            comparisons.push(comparison);
          }
        }finally{graph?.disconnect();nodes.forEach(node=>node.disconnect())}
      }
      results.push({name,sampleRate,channels:['outputL','outputR','preL','preR','postL','postR'],levels,comparisons});
    }
  }
  return results;
}

export async function runPolyphonicRepeatability(){
  const results=[];
  for(const ordered of [false,true]){
    let reference;const comparisons=[];
    for(let repeat=0;repeat<6;repeat++){
      const ctx=new OfflineAudioContext(4,44100*4,44100),input=ctx.createGain(),filter=ctx.createBiquadFilter(),merger=ctx.createChannelMerger(4);
      filter.type='highpass';filter.frequency.value=20;filter.Q.value=.707;
      input.connect(filter);
      const tap=(node,offset)=>{
        const split=ctx.createChannelSplitter(2);node.connect(split);split.connect(merger,0,offset);split.connect(merger,1,offset+1);
      };
      tap(input,0);tap(filter,2);merger.connect(ctx.destination);
      const pcm=deterministicPcm(new OfflineAudioContext(2,1,48000),3);
      const bus=ordered?createOrderedAudioBus(ctx,input):null;
      for(let voice=0;voice<8;voice++){
        const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
        source.buffer=pcm;source.playbackRate.value=2**((voice%3)/12);gain.gain.value=.5/(voice+1);
        source.connect(gain).connect(pan);
        pan.connect(bus?bus.addInput().input:input);
        source.start(voice*.125);source.stop(3+voice*.125);
      }
      const rendered=await ctx.startRendering(),pcmOut=Array.from({length:4},(_,ch)=>rendered.getChannelData(ch).slice());
      bus?.disconnect();
      if(!reference)reference=pcmOut;
      else{
        const comparison=pcmOut.map((data,ch)=>comparePcm(reference[ch],data,44100));
        if(ordered&&comparison.some(channel=>channel.maximum!==0))throw new Error('Ordered polyphony changed between renders.');
        comparisons.push(comparison);
      }
    }
    results.push({name:ordered?'ordered-polyphony':'native-polyphony',channels:['preL','preR','postL','postR'],comparisons});
  }
  return results;
}

export async function runImportedProjectRepeatability({tapsOnly=false,orderedOnly=false}={}){
  const {AudioEngine}=await import('../src/audio.js'),{getProjectAssetIds}=await import('../src/portable-project.js');
  const project=JSON.parse(localStorage.getItem('pulse-project')),decoder=new OfflineAudioContext(2,1,48000),buffers=new Map();
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pulse-studio-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  try{
    for(const id of getProjectAssetIds(project)){
      const file=await new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
      buffers.set(id,await decoder.decodeAudioData(await file.arrayBuffer()));
    }
  }finally{db.close()}
  const results=[],compare=(a,b)=>Array.from({length:2},(_,ch)=>comparePcm(a.getChannelData(ch),b.getChannelData(ch),a.sampleRate));
  let premix;
  for(const name of tapsOnly||orderedOnly?[]:['full','bypass','eq-disabled']){
    const clone=structuredClone(project);if(name==='eq-disabled')clone.mastering.eq.enabled=false;
    const reference=await new AudioEngine().render(clone,buffers,{bypassMastering:name==='bypass'}),comparisons=[];
    if(name==='bypass')premix=reference;
    for(let i=0;i<3;i++)comparisons.push(compare(reference,await new AudioEngine().render(clone,buffers,{bypassMastering:name==='bypass'})));
    results.push({name,comparisons});
  }
  for(const windowed of tapsOnly||orderedOnly?[]:[false,true]){
    let reference;const comparisons=[];
    for(let i=0;i<4;i++){
      const ctx=new OfflineAudioContext(2,premix.length+1000,44100);
      await ctx.audioWorklet.addModule(new URL('../src/mastering-processor.js',import.meta.url));ctx.masteringLimiterReady=true;
      const graph=createMasteringGraph(ctx,project.mastering,ctx.destination),source=ctx.createBufferSource();
      source.buffer=premix;source.connect(graph.input);source.start(0);
      try{
        const result=windowed?await renderOfflineWindows(ctx,{schedule(){},release(){}}):await ctx.startRendering();
        if(!reference)reference=result;else comparisons.push(compare(reference,result));
      }finally{source.disconnect();graph.disconnect()}
    }
    results.push({name:`fixed-premix-${windowed?'windowed':'continuous'}`,comparisons});
  }
  const NativeContext=globalThis.OfflineAudioContext;
  if(!orderedOnly)globalThis.OfflineAudioContext=function(channels,length,sampleRate){
    const ctx=new NativeContext(20,length,sampleRate),destination=ctx.destination,merger=ctx.createChannelMerger(20),output=ctx.createGain();
    const tap=(node,offset)=>{
      const splitter=ctx.createChannelSplitter(2);node.connect(splitter);splitter.connect(merger,0,offset);splitter.connect(merger,1,offset+1);
    };
    tap(output,0);merger.connect(destination);
    Object.defineProperty(ctx,'destination',{value:output});
    const biquad=ctx.createBiquadFilter.bind(ctx),gain=ctx.createGain.bind(ctx),filters=[];
    ctx.createBiquadFilter=()=>{
      const node=biquad();filters.push(node);if(filters.length>=2&&filters.length<=9)tap(node,4+(filters.length-2)*2);return node;
    };
    ctx.createGain=()=>{
      const node=gain(),connect=node.connect.bind(node);
      node.connect=(target,...ports)=>{if(target===filters[1])tap(node,2);return connect(target,...ports)};return node;
    };
    return ctx;
  };
  if(!orderedOnly)try{
    const reference=await new AudioEngine().render(project,buffers),comparisons=[];
    for(let i=0;i<3;i++){
      const actual=await new AudioEngine().render(project,buffers);
      comparisons.push(Array.from({length:20},(_,ch)=>comparePcm(reference.getChannelData(ch),actual.getChannelData(ch),reference.sampleRate)));
    }
    results.push({name:'project-taps',channels:['outputL','outputR','preL','preR',...Array.from({length:8},(_,i)=>[`filter${i}L`,`filter${i}R`]).flat()],comparisons});
  }finally{globalThis.OfflineAudioContext=NativeContext}
  for(const mode of tapsOnly?[]:orderedOnly?['ordered-master']:['scheduled-master-params','scheduled-all-biquads','fixed-master-channels']){
    globalThis.OfflineAudioContext=function(...args){
      const ctx=new NativeContext(...args),create=ctx.createBiquadFilter.bind(ctx),gain=ctx.createGain.bind(ctx);let count=0,masterEq,sum;
      ctx.createBiquadFilter=()=>{
        const node=create(),index=count++;
        if(index===0)masterEq=node;
        if(mode==='fixed-master-channels'&&index>=1&&index<=8){node.channelCount=2;node.channelCountMode='explicit'}
        if(mode==='scheduled-all-biquads'||mode==='scheduled-master-params'&&index>=1&&index<=8){
          for(const key of ['frequency','gain','Q']){
            const param=node[key],descriptor=Object.getOwnPropertyDescriptor(AudioParam.prototype,'value');
            Object.defineProperty(param,'value',{get(){return descriptor.get.call(param)},set(value){descriptor.set.call(param,value);param.setValueAtTime(value,0)}});
          }
        }
        return node;
      };
      if(mode==='ordered-master')ctx.createGain=()=>{
        const node=gain(),connect=node.connect.bind(node);
        node.connect=(target,...ports)=>{
          if(target!==masterEq)return connect(target,...ports);
          const next=gain();
          if(sum){sum.disconnect(masterEq);sum.connect(next)}
          connect(next);next.connect(masterEq);sum=next;return target;
        };
        return node;
      };
      return ctx;
    };
    try{
      const reference=await new AudioEngine().render(project,buffers),comparisons=[];
      for(let i=0;i<3;i++)comparisons.push(compare(reference,await new AudioEngine().render(project,buffers)));
      results.push({name:mode,comparisons});
    }finally{globalThis.OfflineAudioContext=NativeContext}
  }
  return results;
}
