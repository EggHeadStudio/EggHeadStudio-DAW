import {LookaheadLimiter} from './mastering-dsp.js';

class MasteringLimiterProcessor extends AudioWorkletProcessor{
 constructor(options){
  super();
  const channels=options.processorOptions?.channels||2;
  this.channels=channels;
  this.lookaheadMs=(options.processorOptions?.lookaheadSeconds||.005)*1000;
  this.limiter=new LookaheadLimiter(sampleRate,channels,this.lookaheadMs/1000);
  this.settings={enabled:false,ceilingDbtp:-1,releaseSeconds:.1,...options.processorOptions?.settings,lookaheadMs:this.lookaheadMs};
  this.port.onmessage=event=>{
   if(event.data?.type==='settings'){
    const next=event.data.settings||{};
    if(Number.isFinite(next.lookaheadMs)&&next.lookaheadMs!==this.lookaheadMs){
     this.lookaheadMs=Math.max(1,Math.min(100,next.lookaheadMs));
     this.limiter=new LookaheadLimiter(sampleRate,this.channels,this.lookaheadMs/1000);
     this.limiter.onGainReduction=db=>this.port.postMessage({type:'gain-reduction',db});
    }
    this.settings={...this.settings,...next};
    this.port.postMessage({type:'settings-applied'});
   }
  };
  this.limiter.onGainReduction=db=>this.port.postMessage({type:'gain-reduction',db});
  this.port.postMessage({type:'ready'});
 }
 process(inputs,outputs){
  const input=inputs[0],output=outputs[0];
  if(!output?.length)return true;
  if(!input?.length||!input[0]?.length){for(const channel of output)channel.fill(0);return true}
  this.limiter.process(input,output,this.settings,output[0].length);
  return true;
 }
}

registerProcessor('egghead-lookahead-limiter',MasteringLimiterProcessor);
