# Batch 005A.6C Report — Instrument Workflow & Recording Studio

## Status
**BATCH 005A.6C INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN** (core workflow works; see Limitations).

## Instrument workflow
- Track dialog selects only name, color and type (Audio Track / Sampler Instrument / Drum Rack). Instruments start empty.
- Sampler: Sample Source panel (searchable picker with Preview/Select, drag-drop, Replace, Clear, Open in Sample Studio) plus existing root/ADSR/filter controls.
- Drum Rack: compact 4×4 grid; per-pad Add/Replace Sample, Remove, Preview, Reset, name/volume/pitch/pan/mute; empty pads do not trigger.
- Track effects and a sample browser are embedded in both instrument editors. **Pad-level effect chains are not implemented.**
- Patterns: **+ Pattern** on instrument track headers (1/2/4/8 bars or custom beats). Editors work without clips and show a hint.
- Toolbar Sampler/Drum Rack/Pattern buttons were replaced by a single **+ Add Track** at the bottom of the Arrangement.
- Schema falls back to 1 when the last typed clip is deleted.

## Recording Studio
- AudioWorklet PCM capture on the AudioContext frame clock (not MediaRecorder timestamps); mic constraints disable echo cancellation, noise suppression and AGC; 5-minute take limit.
- Arm, start position, count-in (1/2/4 bars), metronome, offset (±2000 ms), default-OFF monitoring, live waveform/peak meter, session-only backing selection (project mute/solo not mutated).
- Placement = start position − offset − (base + output latency + mastering lookahead). Input latency is **not measured** (stored 0).
- Takes are float32 WAV assets on ordinary Audio-track clips with additive `clip.recording`/`clip.mute`; activate mutes alternates in the group. Preview, trim, fade, gain, move, delete, open in Arrangement/Sample Studio.
- Interruption (tab hidden, context state change, device disconnect, limit) saves buffered audio; failed saves keep a retry state; leaving page is guarded while recording.

## Tests (actually executed)
- Node suite: **211/211 pass** (204 previous + 7 new in `tests/recording-model.test.js`; `tests/instrument-workflow.test.js` has 6).
- `node --check` passed for all changed JS; `git diff --check` clean (only CRLF notices).
- Browser (integrated Chromium, `instrument-6c-ui2.localhost` fresh origin):
  - Phase 1–5 acceptance: no horizontal overflow at 360/390/430/768/1280; reload persistence; utility −6 dB gave 0.50118720 vs 0.50118723 expected.
  - Recording: **synthetic 440 Hz oscillator** injected as the microphone (not hardware). Record → ~6.4 s take saved at 0 s (trim 0.055 s latency compensation), peak meter 30%.
  - `.EHS` save (1.3 MiB) → New Project → Open `.EHS`: take, trim and position restored, "3 audio assets verified".
  - WAV export: 8.3 s, stereo, decoded RMS 0.129 (0–1 s), 0.1325 (2–5 s), 0.060 (6–8 s, take ends ~6.4 s); −15.3 LUFS, −11.3 dBTP est.
  - Recording Studio at 5 widths: no document overflow; nav tabs scroll horizontally by design.

## Limitations / remaining
- Not implemented: punch in/out, simultaneous multi-input recording, input-latency auto-calibration, comping, pad-level effects.
- Not verified: physical microphone, Bluetooth/mobile hardware, real touch devices, other browsers, MP3 of recording, literal clean-profile import of a recording archive (in-page round trip kept local IndexedDB), recording loopback latency accuracy, deployed GitHub Pages.
- Four screenshots mentioned in the request were not attached.
- Fractional-rate (1.25×) restart discrepancy (~0.0016) unchanged.

## Next (005A.7)
Loopback latency measurement, punch recording, real-device mic/touch tests, clean-profile recording round trip, performance/memory finalization and chunked archives.
