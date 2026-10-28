export const EQ_TYPES=['peaking','lowshelf','highshelf'];
const clamp=(value,min,max,fallback)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));

export function frequencyLimit(sampleRate){
  if(!Number.isFinite(sampleRate)||sampleRate<8000)throw new RangeError('A valid audio sample rate is required.');
  return Math.min(20000,sampleRate/2*.999);
}
export function frequencyToUnit(frequency,sampleRate=48000){
  return Math.log(Math.max(20,Math.min(frequencyLimit(sampleRate),frequency))/20)/Math.log(frequencyLimit(sampleRate)/20);
}
export function unitToFrequency(unit,sampleRate=48000){
  return 20*(frequencyLimit(sampleRate)/20)**Math.max(0,Math.min(1,unit));
}
export const gainToUnit=(gain,range=24)=>(range-Math.max(-range,Math.min(range,gain)))/(2*range);
export const unitToGain=(unit,range=24)=>range*(1-2*Math.max(0,Math.min(1,unit)));
export function dragEqBand(band,dx,dy,{sampleRate=48000,range=24,fine=false}={}){
  const scale=fine?.1:1;
  return{frequency:unitToFrequency(frequencyToUnit(band.frequency,sampleRate)+dx*scale,sampleRate),
    gain:unitToGain(gainToUnit(band.gain,range)+dy*scale,range)};
}

export function trackEqFilters(params={},sampleRate=48000){
  const maximum=Math.min(20000,sampleRate/2),defaults=[120,500,2500,10000];
  const source=params.bands||[{frequency:params.frequency??1000,gain:params.gain??0,q:params.q??1},{frequency:500,gain:0,q:1},{frequency:2500,gain:0,q:1},{frequency:10000,gain:0,q:1}];
  const bands=defaults.map((frequency,index)=>{
    const band=source[index]||{};
    return{key:`band-${index}`,type:EQ_TYPES.includes(band.type)?band.type:'peaking',frequency:clamp(band.frequency,20,maximum,frequency),
      gain:band.enabled===false?0:clamp(band.gain,-24,24,0),q:clamp(band.q,.1,18,1),enabled:band.enabled!==false};
  });
  return[{key:'lowCut',type:params.lowCutEnabled===false?'peaking':'highpass',frequency:clamp(params.lowCut,20,maximum,20),gain:0,q:1,enabled:params.lowCutEnabled!==false},
    ...bands,{key:'highCut',type:params.highCutEnabled===false?'peaking':'lowpass',frequency:clamp(params.highCut,20,maximum,maximum),gain:0,q:1,enabled:params.highCutEnabled!==false}];
}
export function masterEqFilters(settings,sampleRate=48000){
  const eq=settings.eq,maximum=sampleRate/2;
  return[{key:'lowCut',type:eq.lowCutEnabled===false?'peaking':'highpass',frequency:Math.min(maximum,eq.lowCut),gain:0,q:.707,enabled:eq.lowCutEnabled!==false},
    ...eq.bands.map((band,index)=>({...band,key:`band-${index}`,gain:band.enabled?band.gain:0})),
    {key:'highCut',type:eq.highCutEnabled===false?'peaking':'lowpass',frequency:Math.min(maximum,eq.highCut),gain:0,q:.707,enabled:eq.highCutEnabled!==false}];
}

export function composeMagnitudes(responses,target){
  target.fill(0);
  for(const response of responses)for(let i=0;i<target.length;i++)target[i]+=20*Math.log10(Math.max(1e-20,response[i]));
  return target;
}

// Unconnected native filters use the browser's exact Biquad response, including
// its high/low-pass Q convention. They never enter the audible signal graph.
export function createEqResponse(context,count=256){
  const filters=Array.from({length:8},()=>context.createBiquadFilter()),frequencies=Float32Array.from({length:count},(_,i)=>unitToFrequency(i/(count-1),context.sampleRate));
  const magnitudes=filters.map(()=>new Float32Array(count)),phase=new Float32Array(count),db=new Float32Array(count);
  return{frequencies,db,update(descriptors,bypassed=false){
    if(bypassed){db.fill(0);return db}
    descriptors.forEach((band,index)=>{
      const filter=filters[index];filter.type=band.type;filter.frequency.value=band.frequency;filter.gain.value=band.gain;filter.Q.value=band.q;
      filter.getFrequencyResponse(frequencies,magnitudes[index],phase);
    });
    return composeMagnitudes(magnitudes.slice(0,descriptors.length),db);
  },dispose(){filters.forEach(filter=>filter.disconnect())}};
}
