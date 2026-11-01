export const FACTORY_SAMPLE_RATE=44100;
export const FACTORY_SAMPLES=[
  {id:'factory-kick',name:'Kick.wav',category:'drums',duration:.65},
  {id:'factory-snare',name:'Snare.wav',category:'drums',duration:.4},
  {id:'factory-closed-hat',name:'Closed Hat.wav',category:'drums',duration:.13},
  {id:'factory-open-hat',name:'Open Hat.wav',category:'drums',duration:.7},
  {id:'factory-clap',name:'Clap.wav',category:'drums',duration:.4},
  {id:'factory-sub-bass-c2',name:'Sub Bass C2.wav',category:'bass',duration:1.5,rootNote:36},
  {id:'factory-saw-bass-c2',name:'Saw Bass C2.wav',category:'bass',duration:1.5,rootNote:36},
  {id:'factory-soft-saw-c4',name:'Soft Saw C4.wav',category:'synth',duration:1.5,rootNote:60},
  {id:'factory-pluck-c4',name:'Pluck C4.wav',category:'synth',duration:1.2,rootNote:60}
];

export function generateFactoryPcm(sample){
  const rate=FACTORY_SAMPLE_RATE,data=new Float64Array(Math.round(sample.duration*rate));
  let seed=0x5eeda11,phase=0,previousNoise=0,low=0;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1};
  for(let i=0;i<data.length;i++){
    const t=i/rate,n=noise(),high=n-previousNoise;previousNoise=n;
    const attack=Math.min(1,t/.004),release=Math.min(1,(sample.duration-t)/.04);
    let value;
    if(sample.id==='factory-kick'){
      phase+=2*Math.PI*(48+130*Math.exp(-t*35))/rate;
      value=Math.sin(phase)*Math.exp(-t*9)+high*.12*Math.exp(-t*180);
    }else if(sample.id==='factory-snare'){
      value=(high*.35+Math.sin(2*Math.PI*185*t)*.3)*Math.exp(-t*16);
    }else if(sample.id.includes('hat')){
      value=(high*.3+Math.sin(2*Math.PI*7300*t)*.12)*Math.exp(-t*(sample.id.includes('closed')?48:9));
    }else if(sample.id==='factory-clap'){
      const bursts=[0,.013,.027].reduce((sum,start)=>sum+(t>=start?Math.exp(-(t-start)*65):0),0);
      value=high*.22*(bursts+Math.exp(-t*17)*.4);
    }else{
      const frequency=440*2**((sample.rootNote-69)/12);
      if(sample.id.includes('sub'))value=Math.sin(2*Math.PI*frequency*t);
      else{
        value=0;
        for(let harmonic=1;harmonic<=12;harmonic++)value+=Math.sin(2*Math.PI*frequency*harmonic*t)/harmonic*Math.exp(-harmonic/5);
        const cutoff=sample.id.includes('pluck')?700+3000*Math.exp(-t*12):sample.category==='bass'?1000:2800;
        const alpha=1-Math.exp(-2*Math.PI*cutoff/rate);low+=alpha*(value-low);value=low;
      }
      value*=sample.id.includes('pluck')?Math.exp(-t*7):Math.min(1,t/.025)*(.72+.28*Math.exp(-t*4));
    }
    data[i]=value*attack*release;
  }
  const mean=data.reduce((sum,value)=>sum+value,0)/data.length;
  let peak=0;
  for(let i=0;i<data.length;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]))}
  return Float32Array.from(data,value=>value/peak*10**(-3/20));
}

export function factoryWav(sample){
  const pcm=generateFactoryPcm(sample),bytes=new Uint8Array(44+pcm.length*2),view=new DataView(bytes.buffer);
  const text=(offset,value)=>[...value].forEach((character,index)=>view.setUint8(offset+index,character.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,FACTORY_SAMPLE_RATE,true);
  view.setUint32(28,FACTORY_SAMPLE_RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++)view.setInt16(44+i*2,Math.round(pcm[i]*32767),true);
  return bytes;
}
