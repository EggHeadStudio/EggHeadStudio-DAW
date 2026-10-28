const ProcessorBase=globalThis.AudioWorkletProcessor||class{};
export class FeedForwardCompressorProcessor extends ProcessorBase {
 constructor({processorOptions={}}={}){
  super();
  this.sampleRate=Number(processorOptions.sampleRate)||48000;
  this.settings={threshold:-24,ratio:4,knee:12,attack:.01,release:.2,detectorGain:0,lowCut:0};
  this.gainDb=0;
  this.detectorState=[{x:0,y:0},{x:0,y:0}];
  if(!this.port)this.port={onmessage:null,postMessage:()=>{}};
  this.port.onmessage=event=>{
   if(event.data?.type==='dispose'){this.disposed=true;return}
   if(event.data?.type==='settings')this.settings={...this.settings,...event.data.settings};
  };
 }
 reductionFor(levelDb){
  const {threshold,ratio,knee}=this.settings,over=levelDb-threshold;
  if(knee>0&&over>-knee/2&&over<knee/2){
   const curved=over+knee/2;
   return (1-1/ratio)*curved*curved/(2*knee);
  }
  return over>0?over*(1-1/ratio):0;
 }
 process(inputs,outputs){
  if(this.disposed)return false;
  const program=inputs[0]||[],detector=inputs[1]||[],output=outputs[0]||[];
  if(!program.length||!output.length)return true;
  const frames=output[0].length,detectorGain=10**(this.settings.detectorGain/20),lowCut=Math.max(0,Number(this.settings.lowCut)||0),alpha=lowCut?Math.exp(-2*Math.PI*lowCut/this.sampleRate):0;
  const attackCoefficient=Math.exp(-1/(Math.max(.001,Number(this.settings.attack)||.01)*this.sampleRate));
  const releaseCoefficient=Math.exp(-1/(Math.max(.01,Number(this.settings.release)||.2)*this.sampleRate));
  let peakReduction=0;
  for(let frame=0;frame<frames;frame++){
   let detectorLevel=0;
   for(let channel=0;channel<Math.max(1,detector.length);channel++){
    const state=this.detectorState[channel]||{x:0,y:0},sample=(detector[channel]?.[frame]||0)*detectorGain;
    let filtered=sample;
    if(lowCut){filtered=alpha*(state.y+sample-state.x);state.x=sample;state.y=filtered}
    this.detectorState[channel]=state;
    detectorLevel=Math.max(detectorLevel,Math.abs(filtered));
   }
   const levelDb=20*Math.log10(Math.max(1e-8,detectorLevel));
   const targetDb=-this.reductionFor(levelDb);
   const coefficient=targetDb<this.gainDb?attackCoefficient:releaseCoefficient;
   this.gainDb=targetDb+(this.gainDb-targetDb)*coefficient;
   peakReduction=Math.max(peakReduction,-this.gainDb);
   const gain=10**(this.gainDb/20);
   for(let channel=0;channel<output.length;channel++)output[channel][frame]=(program[channel]?.[frame]||0)*gain;
  }
  this.frames=(this.frames||0)+frames;
  if(this.frames>=this.sampleRate/10){this.port.postMessage({type:'reduction',db:peakReduction});this.frames=0}
  return true;
 }
}

if(typeof registerProcessor==='function')registerProcessor('feed-forward-compressor',FeedForwardCompressorProcessor);
