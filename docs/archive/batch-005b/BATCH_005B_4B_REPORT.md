# Batch 005B.4B - Unified effects, live preview and workspace transport

## Status and scope

**BATCH 005B.4B COMPLETE — READY FOR MOBILE UX**

Acceptance is scoped to the executed Windows Chromium tests below. It is not
physical-device or cross-engine certification. The actual starting Node
baseline was **298/298**; the final suite is **310/310**, with no existing tests
removed or weakened. The earlier uncommitted Batch 005B.4 work is preserved.
No commit, push or deployment was performed.

See the [before/after effect audit](./BATCH_005B_4B_EFFECT_AUDIT.md) for all seven
workspaces, scalar/position control choices, ownership, routing and limitations.
The [005B.4 EQ report](./BATCH_005B_4_REPORT.md) remains the foundation rather than
being replaced by a second EQ implementation.

## Implemented behavior

- **Sample Studio:** prepared edited PCM excludes gain, then plays through a
  smoothed gain node and the existing shared effect processors. Gain,
  EQ/cuts/Q, compressor, delay, reverb, saturation, utility and limiter settings
  update this live graph. Ordinary scalar edits retain source and graph;
  topology changes retain the source but can reset device tails. Original A/B
  and empty/all-bypassed chains remain raw, matching offline sample behavior.
- **Save once:** Save renders current original-editor edits, processing and
  effects once, not the already-processed audition. Prepared-buffer operations
  remain explicitly labelled; their next Preview prepares the new buffer.
- **Tempo:** synced sample delay uses authoritative project BPM for live
  preview and Save, not the engine's last playback tempo. The browser test
  changes 120 to 90 and back while retaining the source. The 90 BPM quarter-note
  delay is numerically checked at `2/3` second.
- **Shared controls:** Sample Studio consumes existing device definitions and
  foldable shells, graphical EQ, local Pre/Post FFT and native reduction data.
  Sampler ADSR/tuning and Drum Rack pad gain/pitch use shared rotary/numeric/
  keyboard/reset controls. Pan, faders, velocity, waveform and timeline
  positions retain meaningful positional controls. Legacy sampler delay shows
  milliseconds while preserving seconds in state.
- **Mastering:** B auditions the prepared pre-master mix through one live
  mastering graph. Scalar changes, presets, reset and module order use the
  existing authoritative settings path. A bypasses mastering. Cached analysis
  and level matching become stale after changes; a new offline preview render
  refreshes them. Song edits conservatively invalidate the prepared mix.
- **Recording:** backing controls update idle backing playback as well as busy
  recording playback. Dry capture, monitoring and existing take-preview
  routing are preserved.
- **Central transport:** one safe Space listener routes to sample preview,
  mastering audition, idle recording backing or the existing song transport.
  Sampler/Drum/Export use the song's independent clips, not a second pattern
  engine. Native/editable controls retain Space; repeat and overlapping starts
  are suppressed. Busy capture/calibration/unsaved-take states are protected.
  Global Play labels follow the active workspace.
- **Lifecycle:** workspace changes release sample/master/library auditions.
  Pause preserves offsets, Stop resets local auditions, and Return to Start
  retains its existing song behavior. Startup/update failures surface visibly.
  Master audition disposal also works when its audio context is suspended.

Track routing remains input -> fader/pan -> legacy filter/delay -> ordered
devices -> master. This batch does not silently move the fader after devices.
No framework, backend, mandatory dependency, separate parameter model, Session
View or destructive project migration was introduced.

## Automated and production validation

| Check | Executed result |
|---|---|
| Full Node regression suite | **310 passed, 0 failed**, 5581.5558 ms |
| New focused preview/transport tests | **12 passed**, including live identity, topology, smoothing, raw bypass, Save gain once, pause/loop, tails, failure cleanup, shortcut safety and BPM propagation |
| JavaScript/module syntax | **122 JS/MJS files** passed `node --check` |
| Text integrity / whitespace | **161 text files** passed strict UTF-8 decoding; `git diff --check` passed |
| Deterministic production builds | Two matching manifests, **62 assets**, version `bbb86a7d97f574f17d60` |
| Native built-subpath smoke | **52 JS/CSS resources**, all under the current versioned `/dist/assets/` path; actual 996.09375 Hz sample playback; live gain retained source/graph; Stop disposed both |

The Node suite was run using the available portable Node v22.23.4 and all
`tests/*.test.js` files. Browser acceptance uses the real UI and native Web
Audio; source/graph diagnostics are read-only getters, not a second audio path.
Existing tests continue to cover scheduling, sidechain, mastering, recording
recovery, independent clips, sample precision, archive faults and export.

## Sample Studio browser and audio acceptance

The maintained [Sample Studio fixture](../../../tests/cross-workspace-browser.js)
imports a deterministic stereo 1 kHz file, plays a loop, edits actual controls,
measures native graph output and retains source identity through live edits.

| Measurement | Final browser run |
|---|---:|
| Requested -6 dB editor gain | -5.99702208 dB measured |
| Requested +6 dB EQ boost at 1 kHz | +6.01369529 dB measured |
| 100 Hz low-pass on the 1 kHz source | -39.95920227 dB attenuation |
| Compressor threshold/ratio change | +7.59156920 dB output RMS change |
| Saved once-processed WAV RMS | 0.05657597681720708 |
| Saved WAV sample peak | 0.08001953363418579 |
| Saved WAV decoded shape | 192000 frames at 48000 Hz |
| Saved -6 dB gain / +6 dB EQ level error | +0.00114144 dB |

Native DynamicsCompressor has built-in makeup behavior; lowering threshold
does not guarantee lower output RMS. Its real reduction readout and parameter
response are used, not a fabricated gain-reduction animation or an assumed
negative RMS change. Existing DSP is not replaced to force a desired reading.

Synthetic CDP touch passed at **360, 390, 430, 768 and 1280 CSS pixels**:
EQ-point drag, rotary drag, waveform selection, preview controls, native rack
scrolling and numeric entry. All five reported no page-level horizontal
overflow. Numeric gain Undo/Redo, sample Space pause/resume, loop phase, typing
Space, once-only Save and workspace disposal also passed. No page errors.
This is representative shared-control/mobile regression, not completion of the
dedicated Batch 005B.5 phone workspace architecture.

## Cross-workspace and recording acceptance

The [transport fixture](../../../tests/workspace-transport-browser.js) used the saved
sample in both a Sampler and Drum Rack, created a real Piano Roll note and drum
step, and persisted attack 0.02 s, fine tune 10 cents and pad gain 0.7.

- Space passed in Sample, Arrangement, Sampler, Drum Rack, Recording,
  Mastering and Export. Instrument/Export Space uses Arrangement playback.
- Idle recording backing gain became `0.85 * 0.4` without modifying the
  original project fader.
- Space during synthetic microphone capture left recording active and showed
  its explicit safety notification.
- That dry take contained 12193 frames, RMS 0.10603785924351676 and peak
  0.15000000596046448; backing did not leak into capture.
- Master output -6 dB measured **-5.99501264 dB**; master EQ +6 dB measured
  **+5.99969172 dB**. Actual mid-band reduction reached **19.81727857 dB**.
  Scalar edits, order/reset, A bypass, pause offset, source identity and
  stale-analysis handling passed, with no page errors.

An additional fresh-origin recording-monitor fixture toggled input monitoring
ON/OFF during capture, kept capture active, stopped/saved and previewed the
take through an actual -12 dB Utility device:

- Dry take: **31008 frames**, RMS **0.10606728118863343**, peak
  **0.15000000596046448**; the microphone stream track ended after capture.
- Take preview: one live source, RMS **0.015568302239284881**, device gain
  **0.25118863582611084**. Effects were audible on preview, not printed into
  the dry recording.

These are synthetic oscillator/microphone tests, not measurements of physical
microphone latency, hardware loopback or acoustic monitoring.

## Portable project and encoded audio integrity

The [mixed-project fixture](../../../tests/workspace-portable-browser.js) verifies
track/master settings, exact decoded source PCM SHA-256 hashes, clip/pattern/
instrument data, full rendered-channel numerical comparison, restored live
playback and actual downloaded WAV/MP3 decoding. The target origin is checked
for `autosave: null` and zero IndexedDB assets before import.

The final completed run restored an **821030-byte** archive with two exact
source assets. The render was stereo, **1336230 frames at 44100 Hz**, RMS
**0.04373051423433178**, peak **0.28438660502433777**; restored FFT was
**996.09375 Hz**. That restore had **max/RMS error 0**.

The final unchanged-project repeat exhibited native render variability:
maximum error **0.00001996755599975586**, RMS error
**6.411224153667494e-7**. An earlier unchanged repeat measured maximum
**0.000020265579223632812**, RMS **7.34052451573676e-7**.
Therefore universal sample-identical native mixed
rendering is **not** claimed. The separate mixed fixture requires exact source
PCM and settings, maximum rendered error <= `1e-4` (the existing instrument
acceptance bound) and RMS error <= `1e-6`. The old strict EQ portability test
was not weakened or replaced. Its exploratory bit-hash comparison on this
different mixed fixture was investigated rather than misreported as a pass.

The final run's actual exports independently decoded to:

| Output | Decoder frames / rate | RMS | Peak |
|---|---|---:|---:|
| WAV | 1454400 / 48000 Hz | 0.043730153982807246 | 0.2844851016998291 |
| MP3 | 1455751 / 48000 Hz | 0.043711639971806895 | 0.284610778093338 |

**48000 Hz here is the independent decoder context**, not a claim about the
encoded file header. Export UI/encoded-file analysis verified 44.1 kHz,
24-bit stereo PCM for WAV; MP3 includes expected codec padding. No sample rate,
bit depth, DSP quality or .EHS container-version change was introduced.
The clean-origin test is not a separate browser context/profile claim.

## Modified files

- Runtime/lifecycle: [sample-preview.js](../../../src/sample-preview.js),
  [transport-shortcuts.js](../../../src/transport-shortcuts.js),
  [audio.js](../../../src/audio.js), [app.js](../../../src/app.js),
  [sample-editor.js](../../../src/sample-editor.js).
- Shared presentation/bindings: [device-ui.js](../../../src/device-ui.js),
  [eq-workspace.js](../../../src/eq-workspace.js),
  [eq-visualizer.js](../../../src/eq-visualizer.js),
  [sampler-ui.js](../../../src/sampler-ui.js),
  [drum-rack-ui.js](../../../src/drum-rack-ui.js),
  [studio-workflows.js](../../../src/studio-workflows.js),
  [recording-studio.js](../../../src/recording-studio.js),
  [workspace.css](../../../src/workspace.css).
- New acceptance: [sample-preview.test.js](../../../tests/sample-preview.test.js),
  [cross-workspace-browser.js](../../../tests/cross-workspace-browser.js),
  [workspace-transport-browser.js](../../../tests/workspace-transport-browser.js),
  [workspace-portable-browser.js](../../../tests/workspace-portable-browser.js).
- Documentation: this report, [effect audit](./BATCH_005B_4B_EFFECT_AUDIT.md),
  [README](../../../README.md), [IDEA](../../../IDEA.md),
  [format specification](../../../EHS_FORMAT_SPEC.md).

Other dirty EQ files/reports belong to the preserved preceding 005B.4 work.

## Known limitations and Batch 005B.5 handoff

1. Synthetic Windows Chromium/touch/audio only; physical touch devices,
   microphones and non-Chromium engines remain acceptance gates.
2. Prepared-buffer edits require Preview. Automatic source replacement at a
   musical boundary/crossfade is not implemented or falsely labelled live.
3. Bypass/order/add/remove can reset tails; reverb decay regenerates an impulse.
   No universal click-free or zero-allocation topology claim.
4. ADSR/tuning/pad properties affect subsequent voices; shared track filters
   and effects affect active voices. No new isolated pattern-preview engine.
5. Master cached analysis requires rerender. No fake live offline loudness/
   waveform/level-match values; graph FFT and reduction are actual live data.
6. Native mixed renders are compared numerically, not promised universally
   bit-identical. This batch does not add a new long-project performance claim.
7. Batch 005B.5 should build its mobile workspace/navigation architecture on
   these shared devices, accessible numeric alternatives and centralized safe
   transport, then repeat cross-workspace touch/hardware/cross-engine tests.
   Deployment still requires explicit approval.

## Cross-workspace regression checklist

- [x] Arrangement/device effects reuse existing DSP, EQ and ordered routing.
- [x] Sample live gain/EQ/filter/compressor/other supported device updates retain
  the source; tempo sync, Undo/Redo, Save once and cleanup verified.
- [x] Sampler/Piano Roll sample reuse, shared knobs, notes and song transport.
- [x] Drum Rack/Step Sequencer pad settings, sample reuse, steps and transport.
- [x] Recording idle backing mix, protected capture, monitor toggle, dry PCM,
  take preview and microphone-resource cleanup.
- [x] Mastering live EQ/output/dynamics, order/reset, A/B, pause and stale cache.
- [x] Export uses committed project DSP; actual WAV/MP3 decoded and compared.
- [x] Portable .EHS source integrity, instrument/clip/effect settings and playback.
- [x] Five-width synthetic Sample Studio/shared-control touch and no overflow.
- [ ] Physical-device and non-Chromium acceptance; dedicated 005B.5 mobile UX.
