const FIELD_LIMITS=Object.freeze({
 title:200,artist:200,albumArtist:200,album:200,genre:80,releaseDate:10,
 trackNumber:16,discNumber:16,composer:200,producer:200,copyright:200,
 comments:2000,isrc:12,musicalKey:12
});

export function normalizeReleaseMetadata(metadata={},project={}){
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))metadata={};
 if(!project||typeof project!=='object'||Array.isArray(project))project={};
 return{
  ...metadata,
  title:String(metadata.title||project.name||'').slice(0,FIELD_LIMITS.title),
  artist:String(metadata.artist||'').slice(0,FIELD_LIMITS.artist),
  albumArtist:String(metadata.albumArtist||'').slice(0,FIELD_LIMITS.albumArtist),
  album:String(metadata.album||'').slice(0,FIELD_LIMITS.album),
  genre:String(metadata.genre||'').slice(0,FIELD_LIMITS.genre),
  releaseDate:String(metadata.releaseDate||'').slice(0,FIELD_LIMITS.releaseDate),
  trackNumber:String(metadata.trackNumber||'').slice(0,FIELD_LIMITS.trackNumber),
  discNumber:String(metadata.discNumber||'').slice(0,FIELD_LIMITS.discNumber),
  composer:String(metadata.composer||'').slice(0,FIELD_LIMITS.composer),
  producer:String(metadata.producer||'').slice(0,FIELD_LIMITS.producer),
  copyright:String(metadata.copyright||'').slice(0,FIELD_LIMITS.copyright),
  comments:String(metadata.comments||'').slice(0,FIELD_LIMITS.comments),
  isrc:String(metadata.isrc||'').slice(0,FIELD_LIMITS.isrc).toUpperCase(),
  bpm:Number.isFinite(Number(metadata.bpm))?Number(metadata.bpm):Number(project.bpm)||120,
  musicalKey:String(metadata.musicalKey||'').slice(0,FIELD_LIMITS.musicalKey)
 };
}

export function validateReleaseMetadata(metadata){
 const errors=[];
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return['Release metadata must be an object.'];
 for(const [field,maximum]of Object.entries(FIELD_LIMITS)){
  if(String(metadata[field]||'').length>maximum)errors.push(`${field} must be ${maximum} characters or fewer.`);
 }
 if(metadata.releaseDate&&!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(metadata.releaseDate))errors.push('Release date must be YYYY, YYYY-MM, or YYYY-MM-DD.');
 else if(metadata.releaseDate){
  const date=new Date(`${metadata.releaseDate.length===4?metadata.releaseDate+'-01-01':metadata.releaseDate.length===7?metadata.releaseDate+'-01':metadata.releaseDate}T00:00:00Z`);
  if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,metadata.releaseDate.length)!==metadata.releaseDate)errors.push('Release date is not a valid calendar date.');
 }
 for(const field of ['trackNumber','discNumber']){
  if(metadata[field]){
   if(!/^\d+(?:\/\d+)?$/.test(metadata[field]))errors.push(`${field} must be a positive number or number/total.`);
   else if(String(metadata[field]).split('/').some(value=>Number(value)<1))errors.push(`${field} values must be greater than zero.`);
  }
 }
 if(metadata.isrc&&!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(metadata.isrc))errors.push('ISRC must be 12 characters (CCXXXYYNNNNN).');
 if(metadata.bpm!==undefined&&metadata.bpm!==''&&(!Number.isFinite(Number(metadata.bpm))||Number(metadata.bpm)<1||Number(metadata.bpm)>999))errors.push('BPM must be between 1 and 999.');
 return errors;
}

const textFrames=[
 ['TIT2','title'],['TPE1','artist'],['TPE2','albumArtist'],['TALB','album'],
 ['TCON','genre'],['TYER','releaseYear'],['TRCK','trackNumber'],['TPOS','discNumber'],
 ['TCOM','composer'],['TCOP','copyright'],['TBPM','bpm'],['TKEY','musicalKey'],['TSRC','isrc']
];

function utf16FrameText(value){
 const text=String(value),bytes=new Uint8Array(text.length*2+2);
 bytes[0]=0xff;bytes[1]=0xfe;
 for(let index=0;index<text.length;index++){const code=text.charCodeAt(index);bytes[index*2+2]=code&0xff;bytes[index*2+3]=code>>>8}
 return bytes;
}

function frame(id,payload){
 const result=new Uint8Array(10+payload.length),view=new DataView(result.buffer);
 for(let index=0;index<4;index++)result[index]=id.charCodeAt(index);
 view.setUint32(4,payload.length,false);result.set(payload,10);
 return result;
}

function concat(parts){
 const result=new Uint8Array(parts.reduce((size,part)=>size+part.length,0));
 let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length}
 return result;
}

function synchsafe(value){
 return Uint8Array.of((value>>21)&0x7f,(value>>14)&0x7f,(value>>7)&0x7f,value&0x7f);
}

function textFrameValue(metadata,field){
 if(field==='releaseYear')return metadata.releaseDate?.slice(0,4)||'';
 if(field==='bpm')return metadata.bpm?String(metadata.bpm):'';
 return metadata[field]||'';
}

export function createId3v23Tag(metadata,artwork){
 const frames=[];
 for(const[id,field]of textFrames){const value=textFrameValue(metadata,field);if(value)frames.push(frame(id,concat([Uint8Array.of(1),utf16FrameText(value)])))}
 if(metadata.producer){
  const description=utf16FrameText('Producer'),value=utf16FrameText(metadata.producer);
  frames.push(frame('TXXX',concat([Uint8Array.of(1),description,Uint8Array.of(0,0),value])));
 }
 if(metadata.comments){
  const language=Uint8Array.of(0x65,0x6e,0x67),description=Uint8Array.of(0xff,0xfe,0,0);
  frames.push(frame('COMM',concat([Uint8Array.of(1),language,description,utf16FrameText(metadata.comments)])));
 }
 if(artwork?.bytes?.length){
  const mime=new TextEncoder().encode(artwork.type==='image/png'?'image/png':'image/jpeg');
  frames.push(frame('APIC',concat([Uint8Array.of(0),mime,Uint8Array.of(0,3,0),artwork.bytes])));
 }
 const payload=concat(frames),header=Uint8Array.of(0x49,0x44,0x33,3,0,0,...synchsafe(payload.length));
 return concat([header,payload]);
}

export async function addId3v23Metadata(mp3,metadata,artwork){
 const audio=new Uint8Array(await mp3.arrayBuffer()),tag=createId3v23Tag(metadata,artwork);
 return new Blob([tag,audio],{type:'audio/mpeg'});
}

const WAV_INFO_FIELDS=Object.freeze({
 title:'INAM',artist:'IART',album:'IPRD',genre:'IGNR',releaseDate:'ICRD',
 trackNumber:'ITRK',composer:'IMUS',producer:'IENG',copyright:'ICOP',comments:'ICMT'
});

export function addWavInfoMetadata(wav,metadata){
 const bytes=wav instanceof Uint8Array?wav:new Uint8Array(wav);
 if(bytes.length<44||String.fromCharCode(...bytes.subarray(0,4))!=='RIFF'||String.fromCharCode(...bytes.subarray(8,12))!=='WAVE')throw new Error('Cannot add metadata to an invalid WAV file.');
 const enc=new TextEncoder(),chunks=[];
 for(const[field,id]of Object.entries(WAV_INFO_FIELDS)){
  const value=String(metadata[field]||'');if(!value)continue;
  const text=enc.encode(value+'\0'),size=text.length,padded=size+(size%2),chunk=new Uint8Array(8+padded),view=new DataView(chunk.buffer);
  chunk.set([...id].map(char=>char.charCodeAt(0)),0);view.setUint32(4,size,true);chunk.set(text,8);chunks.push(chunk);
 }
 if(metadata.bpm)for(const[id,value]of [['IBPM',String(metadata.bpm)],['IKEY',metadata.musicalKey||'']]){
  if(!value)continue;const text=enc.encode(value+'\0'),chunk=new Uint8Array(8+text.length+(text.length%2)),view=new DataView(chunk.buffer);
  chunk.set([...id].map(char=>char.charCodeAt(0)),0);view.setUint32(4,text.length,true);chunk.set(text,8);chunks.push(chunk);
 }
 if(!chunks.length)return new Blob([bytes],{type:'audio/wav'});
 const infoPayload=concat([enc.encode('INFO'),...chunks]),list=new Uint8Array(8+infoPayload.length+(infoPayload.length%2)),listView=new DataView(list.buffer);
 list.set(enc.encode('LIST'),0);listView.setUint32(4,infoPayload.length,true);list.set(infoPayload,8);
 const fmt=bytes.subarray(12,36),dataHeader=bytes.subarray(36,44),samples=bytes.subarray(44);
 const result=concat([bytes.subarray(0,12),fmt,list,dataHeader,samples]),view=new DataView(result.buffer);
 view.setUint32(4,result.length-8,true);
 return new Blob([result],{type:'audio/wav'});
}
