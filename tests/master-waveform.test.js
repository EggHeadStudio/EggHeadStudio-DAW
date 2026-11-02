import test from 'node:test';
import assert from 'node:assert/strict';
import {createMasterWaveformPeaks,cropMasterAudioBuffer,fitMasterRange,masterRangeInSeconds} from '../src/master-waveform.js';
import {playheadHeightToMaster} from '../src/timeline.js';

function buffer(channels,sampleRate){
 const length=channels[0].length;
 return{length,sampleRate,numberOfChannels:channels.length,getChannelData:index=>channels[index]};
}

test('master waveform keeps measured stereo peaks in bounded time bins',()=>{
 const output=buffer([
  Float32Array.from([-.8,-.2,.1,.4,-.3,.7,.2,0]),
  Float32Array.from([.6,.2,-.4,-.1,.5,-.7,.3,.1])
 ],8);
 const peaks=createMasterWaveformPeaks(output,{samplesPerSecond:2});
 assert.equal(peaks.duration,1);
 assert.equal(peaks.channels.length,2);
 const rounded=values=>[...values].map(value=>Number(value.toFixed(1)));
 assert.deepEqual(rounded(peaks.channels[0].minimum),[-.8,-.3]);
 assert.deepEqual(rounded(peaks.channels[0].maximum),[.4,.7]);
 assert.deepEqual(rounded(peaks.channels[1].minimum),[-.4,-.7]);
 assert.deepEqual(rounded(peaks.channels[1].maximum),[.6,.5]);
});

test('master waveform limits peak storage for long rendered projects',()=>{
 const output=buffer([new Float32Array(48000),new Float32Array(48000)],48000);
 const peaks=createMasterWaveformPeaks(output,{samplesPerSecond:1000,maxSamples:128});
 assert.equal(peaks.channels[0].minimum.length,128);
});

test('master waveform rejects invalid audio buffers and resolution',()=>{
 assert.throws(()=>createMasterWaveformPeaks(null),TypeError);
 const output=buffer([new Float32Array([0])],1);
 assert.throws(()=>createMasterWaveformPeaks(output,{samplesPerSecond:0}),RangeError);
});

test('master export ranges enforce a one-beat minimum and convert using tempo',()=>{
 assert.deepEqual(fitMasterRange({startBeat:2,endBeat:2.5},0),{startBeat:2,endBeat:3});
 assert.deepEqual(masterRangeInSeconds({startBeat:4,endBeat:8},120),{start:2,end:4});
 assert.throws(()=>masterRangeInSeconds({startBeat:0,endBeat:.5},120),RangeError);
});

test('master crop returns exactly the selected stereo audio frames and pads beyond the render',()=>{
 const output=buffer([Float32Array.from([0,1,2,3,4,5,6,7]),Float32Array.from([10,11,12,13,14,15,16,17])],4);
 const crop=cropMasterAudioBuffer(output,{startBeat:1,endBeat:3},60,(channels,length,sampleRate)=>buffer(Array.from({length:channels},()=>new Float32Array(length)),sampleRate));
 assert.equal(crop.length,8);
 assert.deepEqual([...crop.getChannelData(0)],[4,5,6,7,0,0,0,0]);
 assert.deepEqual([...crop.getChannelData(1)],[14,15,16,17,0,0,0,0]);
});

test('playhead extent ends at the Master row bottom for any track count',()=>{
 assert.equal(playheadHeightToMaster(318,84,72),330);
 assert.equal(playheadHeightToMaster(566,84,72),578);
 assert.equal(playheadHeightToMaster(40,24,72),0);
 assert.throws(()=>playheadHeightToMaster(-1,84,72),RangeError);
});
