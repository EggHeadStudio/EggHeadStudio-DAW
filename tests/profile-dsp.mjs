import {LookaheadLimiter,MultibandCompressor,analyzeLoudness,estimateTruePeak} from '../src/mastering-dsp.js';
import {normalizeMasteringSettings} from '../src/mastering.js';
import {FeedForwardCompressorProcessor} from '../src/sidechain-processor.js';
import {resampleChannel} from '../src/export-dsp.js';
const sampleRate=44100,seconds=30,frames=128,blocks=Math.ceil(seconds*sampleRate/frames);
const input=Array.from({length:2},(_,channel)=>Float32Array.from({length:frames},(_,frame)=>.3*Math.sin(frame*(channel+1)*.13)));
const output=input.map(channel=>new Float32Array(channel.length)),settings=normalizeMasteringSettings({multiband:{enabled:true}});
const components={
 limiter:()=>{const processor=new LookaheadLimiter(sampleRate);return()=>processor.process(input,output,{enabled:true})},
 multiband:()=>{const processor=new MultibandCompressor(sampleRate,2,settings.multiband);return()=>processor.process(input,output)},
 sidechain:()=>{const processor=new FeedForwardCompressorProcessor({processorOptions:{sampleRate}});return()=>processor.process([input,input],[output])}
};
for(const[name,create]of Object.entries(components)){
 const ms=[];
 for(let run=0;run<3;run++){const process=create(),at=performance.now();for(let block=0;block<blocks;block++)process();ms.push(performance.now()-at)}
 console.log(JSON.stringify({name,sampleRate,seconds,ms}));
}
const channels=Array.from({length:2},(_,channel)=>Float32Array.from({length:sampleRate*seconds},(_,frame)=>.3*Math.sin(frame*(channel+1)*.13)));
for(const[name,process]of Object.entries({truePeak:()=>estimateTruePeak(channels),loudnessIncludingTruePeak:()=>analyzeLoudness(channels,sampleRate)})){
 const at=performance.now();process();console.log(JSON.stringify({name,sampleRate,seconds,ms:performance.now()-at}));
}
const resampleStarted=performance.now(),resampled=channels.map(channel=>resampleChannel(channel,sampleRate,48000));
console.log(JSON.stringify({name:'resample-32-tap-stereo',sourceRate:sampleRate,targetRate:48000,seconds,frames:resampled[0].length,ms:performance.now()-resampleStarted}));
