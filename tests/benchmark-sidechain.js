import {FeedForwardCompressorProcessor} from '../src/sidechain-processor.js';

const timings=[],sampleRate=48000,frames=128,blocks=Math.ceil(30*sampleRate/frames);
let checksum=0;
for(let run=0;run<6;run++){
 const processor=new FeedForwardCompressorProcessor({processorOptions:{sampleRate}});
 processor.port.onmessage({data:{type:'settings',settings:{threshold:-24,ratio:6,knee:12,attack:.005,release:.2,lowCut:35,detectorGain:3}}});
 const program=[new Float32Array(frames).fill(.25),new Float32Array(frames).fill(-.2)];
 const detector=[Float32Array.from({length:frames},(_,frame)=>.3*Math.sin(frame*.2)),new Float32Array(frames)];
 const output=[new Float32Array(frames),new Float32Array(frames)],inputs=[program,detector],outputs=[output];
 const start=performance.now();
 for(let block=0;block<blocks;block++)processor.process(inputs,outputs);
 timings.push(performance.now()-start);checksum=output[0].reduce((sum,value)=>sum+value,0);
}
console.log(JSON.stringify({runtime:process.version,sampleRate,secondsPerRun:30,channels:2,timingsMs:timings,checksum}));
