import {createMasteringGraph,normalizeMasteringSettings} from '../src/mastering.js';

export async function profileNativeStages({seconds=30}={}){
 const settings=normalizeMasteringSettings({saturation:{enabled:true},imager:{enabled:true},multiband:{enabled:true},limiter:{enabled:true}});
 const buffer=new AudioBuffer({numberOfChannels:2,length:Math.round(44100*seconds),sampleRate:44100});
 for(let ch=0;ch<2;ch++)for(let frame=0;frame<buffer.length;frame++)buffer.getChannelData(ch)[frame]=.3*Math.sin(frame*(ch+1)*.13);
 const results=[];
 for(const stage of ['native-pass','eq','saturation-4x-shaper','imager','multiband','limiter','sidechain']){
  const ctx=new OfflineAudioContext(2,buffer.length,44100),source=ctx.createBufferSource();source.buffer=buffer;
  const at=performance.now();let graph,node;
  if(['multiband','limiter','sidechain'].includes(stage)){
   const sidechain=stage==='sidechain';
   await ctx.audioWorklet.addModule(new URL(sidechain?'../src/sidechain-processor.js':'../src/mastering-processor.js',import.meta.url));
   const name=sidechain?'feed-forward-compressor':stage==='multiband'?'egghead-mastering-multiband':'egghead-lookahead-limiter';
   node=new AudioWorkletNode(ctx,name,{numberOfInputs:sidechain?2:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{sampleRate:44100,channels:2,settings:stage==='multiband'?settings.multiband:{enabled:true,ceilingDbtp:-1,releaseSeconds:.1}}});
   source.connect(node);if(sidechain)source.connect(node,0,1);node.connect(ctx.destination);
  }else if(stage==='native-pass')source.connect(ctx.destination);
  else{
   graph=createMasteringGraph(ctx,{...settings,multiband:{enabled:false},limiter:{enabled:false}},ctx.destination);
   let input,output;
   if(stage==='eq'){input=graph.eqFilters[0];output=graph.eqFilters.at(-1)}
   if(stage==='saturation-4x-shaper')input=output=graph.nodes.find(item=>item instanceof WaveShaperNode);
   if(stage==='imager'){input=graph.nodes.find(item=>item instanceof ChannelSplitterNode);output=graph.nodes.find(item=>item instanceof ChannelMergerNode)}
   output.disconnect();source.connect(input);output.connect(ctx.destination);
  }
  source.start();const graphMs=performance.now()-at,start=performance.now();
  await ctx.startRendering();results.push({stage,seconds,graphMs,renderMs:performance.now()-start});
  source.disconnect();graph?.disconnect();if(node){node.port.postMessage({type:'dispose'});node.port.close();node.disconnect()}
 }
 return results;
}
