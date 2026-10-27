const peakCache=new WeakMap();
const PEAK_BUCKET_FRAMES=256;

export function clampFrame(frame,length){return Math.max(0,Math.min(length,Math.round(frame)))}

export function getWaveformPeaks(buffer){
  let cached=peakCache.get(buffer);
  if(cached)return cached;
  const bucketCount=Math.ceil(buffer.length/PEAK_BUCKET_FRAMES),channels=[];
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
    const data=buffer.getChannelData(channel),minimum=new Float32Array(bucketCount),maximum=new Float32Array(bucketCount);
    for(let bucket=0;bucket<bucketCount;bucket++){
      let low=1,high=-1,end=Math.min(buffer.length,(bucket+1)*PEAK_BUCKET_FRAMES);
      for(let frame=bucket*PEAK_BUCKET_FRAMES;frame<end;frame++){const sample=data[frame]||0;if(sample<low)low=sample;if(sample>high)high=sample}
      minimum[bucket]=low;maximum[bucket]=high;
    }
    channels.push({minimum,maximum});
  }
  cached={bucketSize:PEAK_BUCKET_FRAMES,channels};
  peakCache.set(buffer,cached);
  return cached;
}

export function frameToX(frame,length,width){return length>0?Math.max(0,Math.min(width,frame/length*width)):0}
export function xToFrame(x,length,width){return width>0?clampFrame(x/width*length,length):0}
