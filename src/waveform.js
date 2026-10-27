const peakCache=new WeakMap();
const PEAK_BUCKET_FRAMES=256;

export function clampFrame(frame,length){return Math.max(0,Math.min(length,Math.round(frame)))}

function getChannelPeaks(buffer,channel){
  let cached=peakCache.get(buffer);
  if(!cached){cached={bucketSize:PEAK_BUCKET_FRAMES,channels:[]};peakCache.set(buffer,cached)}
  if(cached.channels[channel])return cached.channels[channel];
  const bucketCount=Math.ceil(buffer.length/PEAK_BUCKET_FRAMES),data=buffer.getChannelData(channel),minimum=new Float32Array(bucketCount),maximum=new Float32Array(bucketCount);
  for(let bucket=0;bucket<bucketCount;bucket++){
    let low=1,high=-1,end=Math.min(buffer.length,(bucket+1)*PEAK_BUCKET_FRAMES);
    for(let frame=bucket*PEAK_BUCKET_FRAMES;frame<end;frame++){const sample=data[frame]||0;if(sample<low)low=sample;if(sample>high)high=sample}
    minimum[bucket]=low;maximum[bucket]=high;
  }
  return cached.channels[channel]={minimum,maximum};
}

export function getWaveformPeaks(buffer){
  for(let channel=0;channel<buffer.numberOfChannels;channel++)getChannelPeaks(buffer,channel);
  return peakCache.get(buffer);
}

export function getWaveformRangePeaks(buffer,channel,start,end){
  const peaks=getChannelPeaks(buffer,channel),data=buffer.getChannelData(channel),bucketSize=PEAK_BUCKET_FRAMES;
  const last=Math.min(buffer.length,Math.max(0,Math.floor(end)));
  let frame=Math.max(0,Math.floor(start)),minimum=1,maximum=-1;
  while(frame<last&&frame%bucketSize){const sample=data[frame]||0;if(sample<minimum)minimum=sample;if(sample>maximum)maximum=sample;frame++}
  const fullBucketEnd=Math.floor(last/bucketSize);
  while(frame/bucketSize<fullBucketEnd){const bucket=frame/bucketSize;minimum=Math.min(minimum,peaks.minimum[bucket]);maximum=Math.max(maximum,peaks.maximum[bucket]);frame+=bucketSize}
  while(frame<last){const sample=data[frame]||0;if(sample<minimum)minimum=sample;if(sample>maximum)maximum=sample;frame++}
  return{minimum,maximum};
}

export function frameToX(frame,length,width){return length>0?Math.max(0,Math.min(width,frame/length*width)):0}
export function xToFrame(x,length,width){return width>0?clampFrame(x/width*length,length):0}
