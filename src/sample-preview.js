import {createSampleEffectGraph,trackGraphSignature,sampleEffectTailSeconds} from './audio.js';

// Preview owns routing only. The editor remains the source of every parameter.
export class SamplePreview {
  constructor(context,{bpm=120,onEnded=()=>{}}={}){
    this.context=context;this.bpm=bpm;this.onEnded=onEnded;this.state='stopped';this.offset=0;
  }
  get position(){
    if(this.state!=='playing')return this.offset;
    const elapsed=this.offset+this.context.currentTime-this.startedAt;
    return this.loop?elapsed%this.buffer.duration:Math.min(elapsed,this.buffer.duration);
  }
  update(effects,gainDb){
    this.effects=effects;this.gainDb=gainDb;
    if(!this.source)return;
    const track={id:'sample-preview',volume:1,pan:0,fx:{effects:this.original?[]:effects}};
    if(!this.graph||this.graph.signature!==trackGraphSignature(track)){
      const next=createSampleEffectGraph(this.context,track,this.context.destination,this.bpm);
      this.level.disconnect();this.graph?.disconnect();
      this.graph=next;
      this.level.connect(this.graph.input);
    }else this.graph.update(track,false,this.bpm);
    this.level.gain.setTargetAtTime(this.original?1:10**(gainDb/20),this.context.currentTime,.01);
    if(this.endedAt!==null)this.scheduleEnd();
  }
  play(buffer,{effects=[],gainDb=0,loop=false,original=false,offset=0}={}){
    this.stop();this.buffer=buffer;this.loop=loop;this.original=original;this.offset=Math.min(offset,Math.max(0,buffer.duration-.00001));
    const context=this.context,source=context.createBufferSource();this.source=source;
    this.level=context.createGain();this.level.gain.value=original?1:10**(gainDb/20);
    try{
      source.buffer=buffer;source.loop=loop;source.connect(this.level);this.update(effects,gainDb);
      this.startedAt=context.currentTime;this.state='playing';source.start(context.currentTime,this.offset);
    }catch(error){this.stop();throw error}
    source.onended=()=>{
      if(this.source!==source||this.state!=='playing')return;
      this.endedAt=context.currentTime;this.scheduleEnd();
    };
  }
  scheduleEnd(){
    clearTimeout(this.tailTimer);
    if(this.context.state==='closed'){this.stop();this.onEnded();return}
    const remaining=this.endedAt+sampleEffectTailSeconds(this.original?[]:this.effects,this.bpm)-this.context.currentTime;
    if(remaining<=0){this.stop();this.onEnded();return}
    this.tailTimer=setTimeout(()=>this.scheduleEnd(),Math.min(1,remaining)*1000);
  }
  pause(){
    if(this.state!=='playing')return;
    this.offset=this.position;this.release();this.state='paused';
  }
  resume(){
    if(this.state!=='paused')return;
    this.play(this.buffer,{effects:this.effects,gainDb:this.gainDb,loop:this.loop,original:this.original,offset:this.offset});
  }
  release(){
    clearTimeout(this.tailTimer);this.endedAt=null;
    if(this.source){
      this.source.onended=null;
      try{this.source.stop()}catch(error){if(error.name!=='InvalidStateError')throw error}
      this.source.disconnect();this.source=null;
    }
    this.level?.disconnect();this.graph?.disconnect();this.level=null;this.graph=null;
  }
  stop(){this.release();this.state='stopped';this.offset=0;this.loop=false}
}
