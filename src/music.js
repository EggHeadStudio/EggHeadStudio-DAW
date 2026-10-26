const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(midi) {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function snapBeats(beat, gridBeats) {
  if (!Number.isFinite(beat) || !Number.isFinite(gridBeats) || gridBeats < 0) {
    throw new RangeError('Beat and grid size must be finite; grid size cannot be negative.');
  }
  if (gridBeats === 0) return Math.max(0, beat);
  return Math.max(0, Math.round(beat / gridBeats) * gridBeats);
}

export function detectPitch(buffer, start = 0, end = buffer.duration) {
  const sampleRate = buffer.sampleRate;
  const channelCount = buffer.numberOfChannels;
  const first = Math.max(0, Math.floor(start * sampleRate));
  const last = Math.min(buffer.length, Math.ceil(end * sampleRate));
  const stride = Math.max(1, Math.floor(sampleRate / 11025));
  const rate = sampleRate / stride;
  const samples = [];

  for (let i = first; i < last; i += stride) {
    let value = 0;
    for (let channel = 0; channel < channelCount; channel++) {
      value += buffer.getChannelData(channel)[i] || 0;
    }
    samples.push(value / channelCount);
  }

  const frameLength = Math.min(samples.length, Math.floor(rate * 0.12));
  if (frameLength < 256) return null;
  const frameStart = Math.floor((samples.length - frameLength) / 2);
  let mean = 0;
  for (let i = 0; i < frameLength; i++) mean += samples[frameStart + i];
  mean /= frameLength;

  let energy = 0;
  for (let i = 0; i < frameLength; i++) {
    const value = samples[frameStart + i] - mean;
    energy += value * value;
  }
  if (energy / frameLength < 1e-7) return null;

  const minLag = Math.max(2, Math.floor(rate / 1200));
  const maxLag = Math.min(Math.floor(rate / 40), Math.floor(frameLength / 2));
  let bestLag = 0;
  let bestCorrelation = 0;
  const correlations = new Float64Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    const length = frameLength - lag;
    for (let i = 0; i < length; i++) {
      const left = samples[frameStart + i] - mean;
      const right = samples[frameStart + i + lag] - mean;
      cross += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const correlation = cross / Math.sqrt(leftEnergy * rightEnergy || 1);
    correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const correlation = correlations[lag];
    if (correlation >= .95 && correlation >= correlations[lag - 1] && correlation > correlations[lag + 1]) {
      bestLag = lag;
      bestCorrelation = correlation;
      break;
    }
  }
  if (bestCorrelation < 0.95 || bestLag === 0) return null;
  const frequency = rate / bestLag;
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return { frequency, midi, name: noteName(midi), confidence: bestCorrelation };
}
