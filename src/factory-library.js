export const FACTORY_SAMPLES=[
  ['kick','Kick','drums',.65],['snare','Snare','drums',.4],
  ['closed-hat','Closed Hat','drums',.13],['open-hat','Open Hat','drums',.7],['clap','Clap','drums',.4],
  ['sub-bass-c2','Sub Bass C2','bass',1.5,36],['saw-bass-c2','Saw Bass C2','bass',1.5,36],
  ['soft-saw-c4','Soft Saw C4','synth',1.5,60],['pluck-c4','Pluck C4','synth',1.2,60]
].map(([key,name,category,duration,rootNote])=>({
  id:`factory-${key}`,name:`${name}.wav`,category,duration,rootNote,factory:true,
  path:`Factory / ${category} / ${name}.wav`,size:44+Math.round(duration*44100)*2,
  url:new URL(`../assets/factory-samples/${category}/${key}.wav`,import.meta.url)
}));

export function registerLazySample(assets,buffers,metadata,readBytes,decode){
  const asset={...metadata};let pending=null;
  asset.load=async()=>{
    if(buffers.has(asset.id))return buffers.get(asset.id);
    if(pending)return pending;
    pending=(async()=>{
      const buffer=await decode(await readBytes());
      asset.duration=buffer.duration;buffers.set(asset.id,buffer);return buffer;
    })();
    try{return await pending}finally{pending=null}
  };
  assets.set(asset.id,asset);return asset;
}

export function registerFactoryLibrary(assets,buffers,decode){
  for(const sample of FACTORY_SAMPLES){
    if(assets.has(sample.id))continue;
    registerLazySample(assets,buffers,sample,async()=>{
      const response=await fetch(sample.url);
      if(!response.ok)throw new Error(`Factory sample ${sample.name} could not load (${response.status}).`);
      return response.arrayBuffer();
    },decode);
  }
}
