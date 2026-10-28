export function createEqAnalyzer(context,tap,{fftSize=4096,smoothing=.75}={}){
  if(!tap)return null;
  const analyser=context.createAnalyser(),sink=context.createGain();
  analyser.fftSize=fftSize;analyser.smoothingTimeConstant=smoothing;analyser.minDecibels=-100;analyser.maxDecibels=0;
  sink.gain.value=0;tap.connect(analyser);analyser.connect(sink);sink.connect(context.destination);
  let disposed=false,data=new Float32Array(analyser.frequencyBinCount);
  return{analyser,get data(){return data},configure(size,smooth){
    analyser.fftSize=size;analyser.smoothingTimeConstant=smooth;
    if(data.length!==analyser.frequencyBinCount)data=new Float32Array(analyser.frequencyBinCount);
  },read(){if(disposed)throw new Error('EQ analyzer has been disposed.');analyser.getFloatFrequencyData(data);return data},
  dispose(){
    if(disposed)return;disposed=true;
    // A retired track graph may already have disconnected all outgoing edges.
    try{tap.disconnect(analyser)}catch(error){if(error.name!=='InvalidAccessError')throw error}
    analyser.disconnect();sink.disconnect();
  }};
}
