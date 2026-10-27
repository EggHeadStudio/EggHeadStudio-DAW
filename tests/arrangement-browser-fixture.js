import {toWav} from '../src/audio.js';
import {createPortableProjectArchive} from '../src/portable-project.js';

export async function createArrangementEditingFixture(){
  const context=new OfflineAudioContext(1,1,44100),buffer=context.createBuffer(1,44100*8,44100),data=buffer.getChannelData(0);
  for(let frame=0;frame<data.length;frame++)data[frame]=.2*Math.sin(2*Math.PI*220*frame/44100+.7);
  const audio=toWav(buffer),project={
    id:'arrangement-005a5-acceptance',name:'005A.5 Editing Acceptance',bpm:120,loop:false,loopStart:0,loopEnd:2,patternBeats:16,
    tracks:['Drums','Bass','Synth','Audio'].map((name,index)=>({
      id:`edit-track-${index}`,name,color:['#df8c72','#77bdb2','#9b91dc','#d3b66c'][index],volume:.7,pan:0,mute:false,solo:false,
      clips:[{id:`edit-clip-${index}`,asset:'editing-source',bar:index%2,start:0,end:4,rate:1,gain:1}],pattern:{notes:[]},fx:{effects:[]}
    })),
    mastering:{limiter:{enabled:false},multiband:{enabled:false},saturation:{enabled:false},imager:{enabled:false}}
  };
  const archive=await createPortableProjectArchive(project,{assetFiles:new Map([['editing-source',audio]])});
  return{archive,audio,project};
}
