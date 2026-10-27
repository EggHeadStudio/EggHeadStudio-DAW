const ABSOLUTE_GATE=-70;
const LUFS_OFFSET=-.691;
const TP_PHASES=[.25,.5,.75],TP_FIRST_TAP=-7,TP_RADIUS=8;
const TP_COEFFICIENTS=TP_PHASES.map(phase=>{
 const coefficients=[];
 for(let tap=-7;tap<=8;tap++){
  const distance=phase-tap,window=Math.abs(distance)>=TP_RADIUS?0:.42+.5*Math.cos(Math.PI*distance/TP_RADIUS)+.08*Math.cos(2*Math.PI*distance/TP_RADIUS);
  const sinc=Math.abs(distance)<1e-12?1:Math.sin(Math.PI*distance)/(Math.PI*distance);
  coefficients.push(sinc*window);
 }
 const sum=coefficients.reduce((total,value)=>total+value,0);
 return Float64Array.from(coefficients,value=>value/sum);
});

function transformBiquadAtSampleRate(coefficients,sourceRate,targetRate){
 if(sourceRate===targetRate)return coefficients;
 const [b0,b1,b2,a1,a2]=coefficients,scale=targetRate/sourceRate;
 const numerator=[b0+b1+b2,2*(b0-b2),b0-b1+b2],denominator=[1+a1+a2,2*(1-a2),1-a1+a2];
 const convert=values=>[
  values[0]+values[1]*scale+values[2]*scale*scale,
  2*values[0]-2*values[2]*scale*scale,
  values[0]-values[1]*scale+values[2]*scale*scale
 ];
 const b=convert(numerator),a=convert(denominator);
 return[b[0]/a[0],b[1]/a[0],b[2]/a[0],a[1]/a[0],a[2]/a[0]];
}

function filterSample(input,coefficients,state){
 const [b0,b1,b2,a1,a2]=coefficients,y=b0*input+b1*state.x1+b2*state.x2-a1*state.y1-a2*state.y2;
 state.x2=state.x1;state.x1=input;state.y2=state.y1;state.y1=y;
 return y;
}

function channelWeights(channelCount){
 if(channelCount===1)return[1];
 if(channelCount===2)return[1,1];
 if(channelCount===3)return[1,1,1.41];
 if(channelCount===4)return[1,1,1.41,1.41];
 if(channelCount===5)return[1,1,1,1.41,1.41];
 if(channelCount===6)return[1,1,1,0,1.41,1.41];
 if(channelCount===7)return[1,1,1,0,1.41,1.41,1.41];
 if(channelCount===8)return[1,1,1,0,1.41,1.41,1.41,1.41];
 throw new RangeError(`BS.1770 channel weighting is not defined here for ${channelCount} channels.`);
}

function loudnessFromEnergy(energy){
 return energy>0?LUFS_OFFSET+10*Math.log10(energy):-Infinity;
}

function percentile(values,percent){
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*percent,lower=Math.floor(index),fraction=index-lower;
 return sorted[lower]+(sorted[Math.min(sorted.length-1,lower+1)]-sorted[lower])*fraction;
}

function interpolatedPeak(getSample,frame){
 let peak=Math.abs(getSample(frame));
 for(const coefficients of TP_COEFFICIENTS){
  let value=0;
  for(let tap=0;tap<coefficients.length;tap++)value+=getSample(frame+TP_FIRST_TAP+tap)*coefficients[tap];
  peak=Math.max(peak,Math.abs(value));
 }
 return peak;
}

export function estimateTruePeak(channels){
 if(!Array.isArray(channels)||!channels.length)throw new TypeError('At least one audio channel is required.');
 const length=channels[0].length;
 let peak=0;
 for(const channel of channels){
  if(channel.length!==length)throw new RangeError('True-peak channels must have equal lengths.');
  const sample=index=>index<0||index>=length?0:channel[index];
  for(let frame=0;frame<length;frame++)peak=Math.max(peak,interpolatedPeak(sample,frame));
 }
 return peak;
}

export function analyzeLoudness(channels,sampleRate){
 if(!Array.isArray(channels)||!channels.length||!Number.isFinite(sampleRate)||sampleRate<8000)throw new TypeError('Audio channels and a valid sample rate are required.');
 const length=channels[0].length,weights=channelWeights(channels.length);
 if(!length||channels.some(channel=>channel.length!==length))throw new TypeError('A non-empty, equal-length audio buffer is required.');
 const shelf=transformBiquadAtSampleRate([1.53512485958697,-2.69169618940638,1.19839281085285,-1.69065929318241,.73248077421585],48000,sampleRate);
 const highpass=transformBiquadAtSampleRate([1,-2,1,-1.99004745483398,.99007225036621],48000,sampleRate);
 const blockFrames=Math.max(1,Math.round(sampleRate*.4)),hopFrames=Math.max(1,Math.round(sampleRate*.1));
 const shortFrames=Math.round(sampleRate*3),shortHop=Math.round(sampleRate*.1),energyRing=new Float64Array(Math.max(blockFrames,shortFrames)),states=channels.map(()=>({shelf:{x1:0,x2:0,y1:0,y2:0},highpass:{x1:0,x2:0,y1:0,y2:0}})),blockEnergies=[],shortTerm=[];
 let rawSquares=0,samplePeak=0,clippedSamples=0,momentarySum=0,shortSum=0;
 for(let frame=0;frame<length;frame++){
  let weightedEnergy=0;
  for(let index=0;index<channels.length;index++){
   const sample=channels[index][frame]||0,state=states[index],filtered=filterSample(filterSample(sample,shelf,state.shelf),highpass,state.highpass);
   samplePeak=Math.max(samplePeak,Math.abs(sample));if(Math.abs(sample)>=1)clippedSamples++;
   rawSquares+=sample*sample;weightedEnergy+=filtered*filtered*weights[index];
  }
  const ringIndex=frame%energyRing.length;
  if(frame>=blockFrames)momentarySum-=energyRing[(frame-blockFrames)%energyRing.length];
  if(frame>=shortFrames)shortSum-=energyRing[(frame-shortFrames)%energyRing.length];
  energyRing[ringIndex]=weightedEnergy;momentarySum+=weightedEnergy;shortSum+=weightedEnergy;
  const count=frame+1;
  if(count>=blockFrames&&(count-blockFrames)%hopFrames===0)blockEnergies.push(momentarySum/blockFrames);
  if(count>=shortFrames&&(count-shortFrames)%shortHop===0)shortTerm.push(loudnessFromEnergy(shortSum/shortFrames));
 }
 const absolute=blockEnergies.filter(value=>loudnessFromEnergy(value)>=ABSOLUTE_GATE),preliminary=absolute.length?absolute.reduce((sum,value)=>sum+value,0)/absolute.length:0;
 const relativeGate=preliminary?loudnessFromEnergy(preliminary)-10:-Infinity;
 const gated=absolute.filter(value=>loudnessFromEnergy(value)>=relativeGate),integrated=gated.length?loudnessFromEnergy(gated.reduce((sum,value)=>sum+value,0)/gated.length):-Infinity;
 const lraCandidates=shortTerm.filter(value=>value>=ABSOLUTE_GATE&&value>=integrated-20),lra=lraCandidates.length?Math.max(0,percentile(lraCandidates,.95)-percentile(lraCandidates,.1)):null;
 const momentary=blockEnergies.length?loudnessFromEnergy(blockEnergies.at(-1)):-Infinity;
 const shortTermLufs=shortTerm.length?shortTerm.at(-1):-Infinity;
 const rms=Math.sqrt(rawSquares/(length*channels.length)),truePeak=estimateTruePeak(channels);
 return{
  integratedLufs:integrated,momentaryLufs:momentary,shortTermLufs,lra,
  rms,rmsDbfs:20*Math.log10(Math.max(1e-12,rms)),
  samplePeak,truePeak,
  samplePeakDbfs:20*Math.log10(Math.max(1e-12,samplePeak)),
  truePeakDbtp:20*Math.log10(Math.max(1e-12,truePeak)),
  clippedSamples,clipping:clippedSamples>0,
  loudnessHistory:blockEnergies.map((value,index)=>({seconds:(index*hopFrames+blockFrames)/sampleRate,lufs:loudnessFromEnergy(value)})),
  gate:{absoluteLufs:ABSOLUTE_GATE,relativeLufs:relativeGate,integratedBlocks:gated.length}
 };
}

export class LookaheadLimiter{
 constructor(sampleRate,channels=2,lookaheadSeconds=.005){
  if(!Number.isFinite(sampleRate)||sampleRate<8000||!Number.isInteger(channels)||channels<1||channels>2)throw new RangeError('Limiter requires a valid sample rate and one or two channels.');
  this.sampleRate=sampleRate;this.channels=channels;this.lookaheadFrames=Math.max(1,Math.round(Math.max(.001,Math.min(.1,lookaheadSeconds))*sampleRate));this.interpolationFuture=TP_RADIUS;
  this.attackCoefficient=Math.exp(Math.log(.001)/this.lookaheadFrames);
  this.delayFrames=this.lookaheadFrames+this.interpolationFuture;this.ringLength=this.delayFrames+8;
  this.rings=Array.from({length:channels},()=>new Float32Array(this.ringLength));
  this.detectorFrames=this.lookaheadFrames+1;this.queueCapacity=this.detectorFrames+4;this.queueIndices=new Int32Array(this.queueCapacity);this.queueValues=new Float32Array(this.queueCapacity);this.queueHead=0;this.queueLength=0;
  this.frame=0;this.gain=1;this.gainReductionDb=0;this.lastMeterFrame=0;
 }
 process(inputChannels,outputChannels,settings={},frameCount=inputChannels[0]?.length||0){
  if(inputChannels.length!==this.channels||outputChannels.length!==this.channels)throw new RangeError('Limiter channel count changed after initialization.');
  const ceiling=10**((Math.max(-12,Math.min(0,Number(settings.ceilingDbtp??-1)))-.1)/20),release=Math.max(.005,Math.min(2,Number(settings.releaseSeconds??.1))),releaseCoefficient=Math.exp(-1/(release*this.sampleRate)),enabled=settings.enabled!==false;
  for(let offset=0;offset<frameCount;offset++,this.frame++){
   for(let channel=0;channel<this.channels;channel++)this.rings[channel][this.frame%this.ringLength]=inputChannels[channel][offset]||0;
   const center=this.frame-this.interpolationFuture;
   if(center>=0){
    let peak=0;
    for(let channel=0;channel<this.channels;channel++){
     const ring=this.rings[channel],sample=index=>index<0?0:ring[index%this.ringLength];
     peak=Math.max(peak,interpolatedPeak(sample,center));
    }
    while(this.queueLength){
     const tail=(this.queueHead+this.queueLength-1)%this.queueCapacity;
     if(this.queueValues[tail]>peak)break;
     this.queueLength--;
    }
    const tail=(this.queueHead+this.queueLength)%this.queueCapacity;
    this.queueIndices[tail]=center;this.queueValues[tail]=peak;this.queueLength++;
   }
   const outputFrame=this.frame-this.delayFrames;
   while(this.queueLength&&this.queueIndices[this.queueHead]<outputFrame){this.queueHead=(this.queueHead+1)%this.queueCapacity;this.queueLength--}
   const detected=this.queueLength?this.queueValues[this.queueHead]:0,target=enabled&&detected>ceiling?ceiling/detected:1;
   this.gain=target<this.gain?target+(this.gain-target)*this.attackCoefficient:this.gain+(1-this.gain)*(1-releaseCoefficient);
   this.gainReductionDb=Math.max(0,-20*Math.log10(Math.max(1e-12,this.gain)));
   for(let channel=0;channel<this.channels;channel++){
    const delayed=outputFrame<0?0:this.rings[channel][outputFrame%this.ringLength];
    outputChannels[channel][offset]=delayed*this.gain;
   }
   if(this.frame-this.lastMeterFrame>=Math.round(this.sampleRate*.05)){this.lastMeterFrame=this.frame;this.onGainReduction?.(this.gainReductionDb)}
  }
 }
}
