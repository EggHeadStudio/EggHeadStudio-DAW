import {createInstrumentClip} from '../src/instrument-clips.js';

export function instrumentFixture(){
  let sequence=0;
  const id=()=>`instrument-test-${++sequence}`;
  const audio={id:'audio',name:'Backing',volume:.5,pan:0,clips:[{id:'audio-clip',asset:'tone',bar:0,start:0,end:1,gain:.5}],fx:{effects:[]}};
  const sampler={id:'sampler',name:'Melody',volume:.5,pan:0,clips:[],patterns:[],sampler:{asset:'tone',rootNote:60,start:0,end:1,mode:'melodic',attack:.005,decay:.01,sustain:1,release:.02},fx:{effects:[]}};
  const drums={id:'drums',name:'Drums',volume:.5,pan:0,clips:[],patterns:[],drumRack:{pads:[{note:36,asset:'hit',volume:.5,pitch:0,pan:0}]},fx:{effects:[]}};
  for(const [beat,midi]of [[4,60],[12,72]]){
    const clip=createInstrumentClip(sampler,beat,id,{name:beat===4?'Verse':'Chorus',lengthBeats:4});
    sampler.patterns.find(pattern=>pattern.id===clip.patternId).notes=[{id:id(),beat:0,midi,durationBeats:1,velocity:.8}];
  }
  for(const [beat,onset]of [[4,0],[12,1]]){
    const clip=createInstrumentClip(drums,beat,id,{name:beat===4?'Kick':'Fill',lengthBeats:4});
    drums.patterns.find(pattern=>pattern.id===clip.patternId).notes=[{id:id(),beat:onset,midi:36,durationBeats:.25,velocity:1}];
  }
  return{project:{name:'Instrument acceptance',bpm:120,patternBeats:64,loop:false,tracks:[audio,sampler,drums]},audio,sampler,drums,id};
}

export function instrumentBuffers(context){
  const tone=context.createBuffer(1,context.sampleRate,context.sampleRate),hit=context.createBuffer(1,Math.round(context.sampleRate*.1),context.sampleRate);
  for(let i=0;i<tone.length;i++)tone.getChannelData(0)[i]=.2*Math.sin(2*Math.PI*220*i/context.sampleRate);
  for(let i=0;i<hit.length;i++)hit.getChannelData(0)[i]=.4*Math.cos(2*Math.PI*80*i/context.sampleRate)*Math.exp(-50*i/context.sampleRate);
  return new Map([['tone',tone],['hit',hit]]);
}
