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

export function estimateTruePeak(channels,onProgress){
 if(!Array.isArray(channels)||!channels.length)throw new TypeError('At least one audio channel is required.');
 const length=channels[0].length;
 let peak=0;
 for(let channelIndex=0;channelIndex<channels.length;channelIndex++){
  const channel=channels[channelIndex];
  if(channel.length!==length)throw new RangeError('True-peak channels must have equal lengths.');
  const sample=index=>index<0||index>=length?0:channel[index];
  const progressStep=Math.max(1,Math.floor(length/20));
  for(let frame=0;frame<length;frame++){
   peak=Math.max(peak,interpolatedPeak(sample,frame));
   if(onProgress&&channelIndex===channels.length-1&&frame%progressStep===0)onProgress(frame/length);
  }
 }
 return peak;
}

export function analyzeLoudness(channels,sampleRate,{onProgress}={}){
 if(!Array.isArray(channels)||!channels.length||!Number.isFinite(sampleRate)||sampleRate<8000)throw new TypeError('Audio channels and a valid sample rate are required.');
 const length=channels[0].length,weights=channelWeights(channels.length);
 if(!length||channels.some(channel=>channel.length!==length))throw new TypeError('A non-empty, equal-length audio buffer is required.');
 const shelf=transformBiquadAtSampleRate([1.53512485958697,-2.69169618940638,1.19839281085285,-1.69065929318241,.73248077421585],48000,sampleRate);
 const highpass=transformBiquadAtSampleRate([1,-2,1,-1.99004745483398,.99007225036621],48000,sampleRate);
 const blockFrames=Math.max(1,Math.round(sampleRate*.4)),hopFrames=Math.max(1,Math.round(sampleRate*.1));
 const shortFrames=Math.round(sampleRate*3),shortHop=Math.round(sampleRate*.1),energyRing=new Float64Array(Math.max(blockFrames,shortFrames)),states=channels.map(()=>({shelf:{x1:0,x2:0,y1:0,y2:0},highpass:{x1:0,x2:0,y1:0,y2:0}})),blockEnergies=[],shortTerm=[];
 let rawSquares=0,samplePeak=0,clippedSamples=0,momentarySum=0,shortSum=0;
 const progressStep=Math.max(1,Math.floor(sampleRate/2));
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
  if(onProgress&&frame%progressStep===0)onProgress(frame/length*.8);
 }
 const absolute=blockEnergies.filter(value=>loudnessFromEnergy(value)>=ABSOLUTE_GATE),preliminary=absolute.length?absolute.reduce((sum,value)=>sum+value,0)/absolute.length:0;
 const relativeGate=preliminary?loudnessFromEnergy(preliminary)-10:-Infinity;
 const gated=absolute.filter(value=>loudnessFromEnergy(value)>=relativeGate),integrated=gated.length?loudnessFromEnergy(gated.reduce((sum,value)=>sum+value,0)/gated.length):-Infinity;
 const lraCandidates=shortTerm.filter(value=>value>=ABSOLUTE_GATE&&value>=integrated-20),lra=lraCandidates.length?Math.max(0,percentile(lraCandidates,.95)-percentile(lraCandidates,.1)):null;
 const momentary=blockEnergies.length?loudnessFromEnergy(blockEnergies.at(-1)):-Infinity;
 const shortTermLufs=shortTerm.length?shortTerm.at(-1):-Infinity;
 const rms=Math.sqrt(rawSquares/(length*channels.length)),truePeak=estimateTruePeak(channels,progress=>onProgress?.(.8+progress*.2));
 onProgress?.(1);
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

function biquadCoefficients(type,frequency,sampleRate){
 const omega=2*Math.PI*Math.min(frequency,sampleRate*.45)/sampleRate,cos=Math.cos(omega),alpha=Math.sin(omega)/Math.SQRT2;
 const a0=1+alpha;
 if(type==='lowpass')return{b0:(1-cos)/(2*a0),b1:(1-cos)/a0,b2:(1-cos)/(2*a0),a1:-2*cos/a0,a2:(1-alpha)/a0};
 return{b0:(1+cos)/(2*a0),b1:-(1+cos)/a0,b2:(1+cos)/(2*a0),a1:-2*cos/a0,a2:(1-alpha)/a0};
}

function runBiquad(sample,coefficients,state){
 const value=coefficients.b0*sample+coefficients.b1*state.x1+coefficients.b2*state.x2-coefficients.a1*state.y1-coefficients.a2*state.y2;
 state.x2=state.x1;state.x1=sample;state.y2=state.y1;state.y1=value;
 return value;
}

function runFourthOrder(sample,filter,states){
 let output=sample;
 for(let stage=0;stage<2;stage++)output=runBiquad(output,filter,states[stage]);
 return output;
}

function compressionGainDb(levelDb,band){
 const threshold=band.threshold,ratio=band.ratio,knee=band.knee;
 if(knee>0&&levelDb>threshold-knee/2&&levelDb<threshold+knee/2){
  const distance=levelDb-threshold+knee/2;
  return(1/ratio-1)*distance*distance/(2*knee);
 }
 return levelDb>threshold?threshold+(levelDb-threshold)/ratio-levelDb:0;
}

export class MultibandCompressor{
 constructor(sampleRate,channels=2,settings={}){
  if(!Number.isFinite(sampleRate)||sampleRate<8000||!Number.isInteger(channels)||channels<1||channels>2)throw new RangeError('Multiband compressor requires a valid sample rate and one or two channels.');
  this.sampleRate=sampleRate;this.channels=channels;this.frame=0;this.lastMeterFrame=0;
  this.filterStates=Array.from({length:channels},()=>Array.from({length:4},()=>[{x1:0,x2:0,y1:0,y2:0},{x1:0,x2:0,y1:0,y2:0}]));
  this.bandFrames=Array.from({length:3},()=>new Float64Array(channels));this.channelMix=new Float64Array(channels);
  this.envelopes=Array.from({length:channels},()=>[0,0,0]);this.gainReduction=[0,0,0];
  this.settings={};this.update(settings);
 }
 update(settings={}){
  const crossovers=settings.crossovers||[250,2500],low=Math.max(40,Math.min(this.sampleRate*.2,Number(crossovers[0])||250)),high=Math.max(low*1.25,Math.min(this.sampleRate*.45,Number(crossovers[1])||2500));
  this.crossovers=[low,high];
  this.filters=[biquadCoefficients('lowpass',low,this.sampleRate),biquadCoefficients('highpass',low,this.sampleRate),biquadCoefficients('lowpass',high,this.sampleRate),biquadCoefficients('highpass',high,this.sampleRate)];
  this.settings={enabled:Boolean(settings.enabled),bands:Array.from({length:3},(_,index)=>{
   const band=settings.bands?.[index]||{};
   return{enabled:band.enabled!==false,solo:Boolean(band.solo),threshold:Math.max(-60,Math.min(0,Number(band.threshold??-18))),ratio:Math.max(1,Math.min(20,Number(band.ratio??2))),attack:Math.max(.001,Math.min(1,Number(band.attack??.01))),release:Math.max(.01,Math.min(2,Number(band.release??.15))),knee:Math.max(0,Math.min(24,Number(band.knee??6))),makeup:Math.max(-24,Math.min(24,Number(band.makeup??0))),outputGain:Math.max(-24,Math.min(24,Number(band.outputGain??0)))};
  })};
 }
 process(inputChannels,outputChannels,settings=this.settings,frameCount=inputChannels[0]?.length||0){
  if(settings!==this.settings)this.update(settings);
  if(inputChannels.length!==this.channels||outputChannels.length!==this.channels)throw new RangeError('Multiband channel count changed after initialization.');
  const config=this.settings,active=config.enabled,soloed=config.bands.some(band=>band.solo);
  if(!active){
   for(let channel=0;channel<this.channels;channel++)outputChannels[channel].set(inputChannels[channel].subarray(0,frameCount),0);
   return;
  }
  const coefficients=config.bands.map(band=>({attack:Math.exp(-1/(band.attack*this.sampleRate)),release:Math.exp(-1/(band.release*this.sampleRate))}));
  for(let offset=0;offset<frameCount;offset++,this.frame++){
   this.channelMix.fill(0);
   for(let channel=0;channel<this.channels;channel++){
    const sample=inputChannels[channel][offset]||0,states=this.filterStates[channel];
    const low=runFourthOrder(sample,this.filters[0],states[0]);
    const upper=runFourthOrder(sample,this.filters[1],states[1]);
    const mid=runFourthOrder(upper,this.filters[2],states[2]);
    const high=runFourthOrder(upper,this.filters[3],states[3]);
    this.bandFrames[0][channel]=low;this.bandFrames[1][channel]=mid;this.bandFrames[2][channel]=high;
   }
   for(let bandIndex=0;bandIndex<3;bandIndex++){
    const band=config.bands[bandIndex];let peak=0;
    for(let channel=0;channel<this.channels;channel++)peak=Math.max(peak,Math.abs(this.bandFrames[bandIndex][channel]));
    const envelope=this.envelopes[0][bandIndex],coefficient=peak>envelope?coefficients[bandIndex].attack:coefficients[bandIndex].release,nextEnvelope=peak+(envelope-peak)*coefficient;
    for(let channel=1;channel<this.channels;channel++)this.envelopes[channel][bandIndex]=nextEnvelope;
    this.envelopes[0][bandIndex]=nextEnvelope;
    const targetReduction=band.enabled?compressionGainDb(20*Math.log10(Math.max(1e-12,nextEnvelope)),band):0,currentReduction=this.gainReduction[bandIndex],smooth=targetReduction<currentReduction?coefficients[bandIndex].attack:coefficients[bandIndex].release;
    this.gainReduction[bandIndex]=targetReduction+(currentReduction-targetReduction)*smooth;
    const audible=!soloed||band.solo;
    if(!audible)continue;
    const gain=band.enabled?10**((this.gainReduction[bandIndex]+band.makeup+band.outputGain)/20):1;
    for(let channel=0;channel<this.channels;channel++)this.channelMix[channel]+=this.bandFrames[bandIndex][channel]*gain;
   }
   for(let channel=0;channel<this.channels;channel++)outputChannels[channel][offset]=this.channelMix[channel];
   if(this.frame-this.lastMeterFrame>=Math.round(this.sampleRate*.05)){this.lastMeterFrame=this.frame;this.onGainReduction?.(this.gainReduction.map(value=>-value))}
  }
 }
}

export function analyzeStereo(channels){
 if(!Array.isArray(channels)||channels.length<2||channels[0].length!==channels[1].length||!channels[0].length)throw new TypeError('Stereo analysis requires two non-empty, equal-length channels.');
 let leftEnergy=0,rightEnergy=0,cross=0,monoEnergy=0;
 for(let index=0;index<channels[0].length;index++){
  const left=channels[0][index],right=channels[1][index];
  leftEnergy+=left*left;rightEnergy+=right*right;cross+=left*right;
  const mono=(left+right)*.5;monoEnergy+=mono*mono;
 }
 const frames=channels[0].length,leftRms=Math.sqrt(leftEnergy/frames),rightRms=Math.sqrt(rightEnergy/frames),correlation=cross/Math.sqrt(Math.max(1e-20,leftEnergy*rightEnergy));
 return{correlation:Math.max(-1,Math.min(1,correlation)),balanceDb:20*Math.log10(Math.max(1e-10,leftRms)/Math.max(1e-10,rightRms)),leftRms,rightRms,monoRms:Math.sqrt(monoEnergy/frames),monoLossDb:20*Math.log10(Math.max(1e-10,Math.sqrt(monoEnergy/frames))/Math.max(1e-10,Math.sqrt((leftEnergy+rightEnergy)/(2*frames))))};
}

export function loudnessMatchGainDb(aLufs,bLufs,activeLufs,enabled=true){
 if(!enabled||![aLufs,bLufs,activeLufs].every(Number.isFinite))return 0;
 return Math.min(0,Math.min(aLufs,bLufs)-activeLufs);
}

export function stereoMonitorMatrix(mode='stereo'){
 if(mode==='mono'||mode==='mid')return[[.5,.5],[.5,.5]];
 if(mode==='left')return[[1,0],[1,0]];
 if(mode==='right')return[[0,1],[0,1]];
 if(mode==='side')return[[.5,-.5],[-.5,.5]];
 return[[1,0],[0,1]];
}

export function analyzeSpectrum(channels,sampleRate,{fftSize=2048,channel='mix'}={}){
 if(!Array.isArray(channels)||!channels.length||channels.some(data=>data.length<1)||!Number.isFinite(sampleRate))throw new TypeError('Spectrum analysis requires audio channels and a valid sample rate.');
 if(!Number.isInteger(fftSize)||fftSize<256||(fftSize&(fftSize-1))!==0)throw new RangeError('FFT size must be a power of two of at least 256.');
 const real=new Float64Array(fftSize),imag=new Float64Array(fftSize),hop=Math.min(fftSize,channels[0].length),offset=Math.max(0,channels[0].length-hop);
 for(let index=0;index<fftSize;index++){
  const frame=offset+index-(fftSize-hop),window=.5-.5*Math.cos(2*Math.PI*index/(fftSize-1));
  let sample=0,count=0;
  for(let channelIndex=0;channelIndex<channels.length;channelIndex++){
   if(channel==='left'&&channelIndex!==0||channel==='right'&&channelIndex!==1)continue;
   sample+=channels[channelIndex][frame]||0;count++;
  }
  real[index]=count?sample/count*window:0;
 }
 for(let index=1,j=0;index<fftSize;index++){
  let bit=fftSize>>1;
  for(;j&bit;bit>>=1)j^=bit;
  j^=bit;
  if(index<j){[real[index],real[j]]=[real[j],real[index]];[imag[index],imag[j]]=[imag[j],imag[index]]}
 }
 for(let size=2;size<=fftSize;size<<=1){
  const angle=-2*Math.PI/size,stepReal=Math.cos(angle),stepImag=Math.sin(angle);
  for(let start=0;start<fftSize;start+=size){
   let wr=1,wi=0;
   for(let offsetIndex=0;offsetIndex<size/2;offsetIndex++){
    const even=start+offsetIndex,odd=even+size/2,tr=wr*real[odd]-wi*imag[odd],ti=wr*imag[odd]+wi*real[odd];
    real[odd]=real[even]-tr;imag[odd]=imag[even]-ti;real[even]+=tr;imag[even]+=ti;
    const nextWr=wr*stepReal-wi*stepImag;wi=wr*stepImag+wi*stepReal;wr=nextWr;
   }
  }
 }
 const bins=new Float32Array(fftSize/2+1),windowGain=fftSize/4;
 for(let index=0;index<bins.length;index++)bins[index]=20*Math.log10(Math.max(1e-9,Math.hypot(real[index],imag[index])/windowGain));
 return{sampleRate,fftSize,bins};
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
