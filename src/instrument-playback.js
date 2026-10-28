import {isInstrumentClip,legacyPatternLength,patternForClip} from './instrument-clips.js';

export function instrumentVoice(track,note,buffers,bpm){
  const sampler=track.sampler,pad=track.drumRack?.pads.find(pad=>pad.note===note.midi);
  const buffer=buffers.get(pad?.asset||(track.drumRack?null:sampler?.asset));
  if(!buffer||pad?.mute)return null;
  const oneShot=Boolean(pad)||sampler.mode==='oneShot';
  const rate=pad?2**((pad.pitch||0)/12):oneShot?1:2**(((note.midi??sampler.rootNote??60)-(sampler.rootNote??60)+(sampler.transpose||0)+(sampler.fineTune||0)/100)/12);
  const start=pad?0:Math.max(0,sampler.start||0),end=pad?buffer.duration:Math.min(buffer.duration,sampler.end||buffer.duration),region=end-start;
  if(region<=0)return null;
  const looping=!pad&&sampler.mode==='loop',duration=oneShot?region/rate:Math.min(looping?Infinity:region/rate,Math.max(.02,(note.durationBeats||.25)*60/bpm));
  return{buffer,start,end,region,rate,looping,oneShot,duration,pan:pad?.pan||0,level:Math.max(0,Math.min(1,note.velocity??.85))*(pad?.volume??1)};
}

export function* instrumentEvents(track,buffers,bpm,programBeats,fromBeat=0,toBeat=programBeats,defaultBeats=64){
  if(!track.sampler&&!track.drumRack)return;
  const clips=Array.isArray(track.patterns)?(track.clips||[]).filter(isInstrumentClip):[{
    bar:0,durationBeats:programBeats,offsetBeats:0,loop:true,legacy:true,
    pattern:{notes:track.pattern?.notes||[],lengthBeats:legacyPatternLength(track,defaultBeats)}
  }];
  const secondsPerBeat=60/bpm;
  for(const clip of clips){
    const pattern=clip.pattern||patternForClip(track,clip);
    if(!pattern)throw new Error(`Missing pattern for instrument clip ${clip.id}.`);
    const start=clip.bar*4,end=start+clip.durationBeats,offset=clip.offsetBeats||0,length=pattern.lengthBeats;
    if(start>=toBeat||(!clip.legacy&&end<=fromBeat))continue;
    for(const note of pattern.notes){
      const voice=instrumentVoice(track,note,buffers,bpm);
      if(!voice)continue;
      const tail=voice.duration/secondsPerBeat;
      const first=clip.loop?Math.max(0,Math.floor((Math.max(start,fromBeat)-start+offset-note.beat-tail)/length)):0;
      const last=clip.loop?Math.ceil((Math.min(end,toBeat)-start+offset-note.beat)/length):1;
      for(let cycle=first;cycle<last;cycle++){
        const at=start+cycle*length+note.beat-offset,until=clip.legacy||clip.legacyTail?Infinity:end;
        if(at>=end||at>=toBeat||at+tail<=Math.max(start,fromBeat)||at>=until)continue;
        yield{note,voice,sampler:track.sampler,at:at*secondsPerBeat,visibleFrom:Math.max(start,at)*secondsPerBeat,until:until*secondsPerBeat,gain:clip.gain??1,clipId:clip.id};
      }
    }
  }
}

export function scheduleInstrumentEvent(ctx,input,event,from,to,contextStart,initial,stopAt=Infinity){
  if((event.visibleFrom<from&&!initial)||event.visibleFrom>=to)return null;
  const voice=event.voice,skip=Math.max(0,Math.max(from,event.visibleFrom)-event.at),remaining=Math.min(voice.duration-skip,event.until-Math.max(from,event.visibleFrom),stopAt-Math.max(from,event.visibleFrom));
  if(remaining<=0)return null;
  const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner(),when=contextStart+Math.max(0,event.visibleFrom-from);
  source.buffer=voice.buffer;source.playbackRate.value=voice.rate;pan.pan.value=voice.pan;
  source.loop=voice.looping;if(voice.looping){source.loopStart=voice.start;source.loopEnd=voice.end}
  source.connect(gain).connect(pan).connect(input);
  const level=voice.level*event.gain,sampler=event.sampler||{};
  if(voice.oneShot)gain.gain.value=level;
  else{
    const duration=voice.duration,attack=Math.min(sampler.attack||.005,duration*.4),decay=Math.min(sampler.decay||.1,Math.max(0,duration-attack)*.4),sustain=Math.max(0,Math.min(1,sampler.sustain??.8)),release=Math.min(sampler.release||.03,duration*.4),releaseStart=Math.max(attack+decay,duration-release);
    const value=time=>time<attack?level*time/attack:time<attack+decay?level*(1-(1-sustain)*(time-attack)/decay):time<releaseStart?level*sustain:level*sustain*Math.max(0,(duration-time)/(duration-releaseStart));
    gain.gain.setValueAtTime(value(skip),when);
    for(const point of [attack,attack+decay,releaseStart,duration])if(point>skip&&point<skip+remaining)gain.gain.linearRampToValueAtTime(value(point),when+point-skip);
    gain.gain.linearRampToValueAtTime(value(skip+remaining),when+remaining);
  }
  source.start(when,voice.start+(voice.looping?(skip*voice.rate)%voice.region:skip*voice.rate));source.stop(when+remaining);
  return{source,nodes:[gain,pan]};
}
