# Batch 004 — Mastering Studio Vertical-Slice Report

## Status

**BATCH 004 IN PROGRESS — FUNCTIONAL VERTICAL SLICE**

Phases 1–3 of Batch 004C have implementation and automated/browser evidence in this worktree. Independent Phase 2 certification/device checks remain release validation; Phases 4–6 (extended export, metadata/artwork/release package and full acceptance) are unfinished.

## Implemented

- Replaced the prior master-only controls with a responsive Mastering workspace.
- Added one master graph shared by real-time arrangement playback and offline WAV rendering/export:
  existing arrangement/track graph → legacy master bus → input trim → reorderable mastering EQ/saturation/imager/multiband → output gain → optional linked-stereo lookahead limiter. The limiter remains the final dynamics/safety stage.
- Added six parametric EQ bands (low shelf, four bells, high shelf), high/low-cut controls, an actual biquad response plot, and draggable/touch band points.
- Added a waveshaper saturation module with 4× Web Audio oversampling.
- Added mid/side width processing; width zero folds the stereo signal to mono.
- Added a three-band compressor with adjustable Linkwitz–Riley 4th-order low/mid/high crossovers, per-band threshold/ratio/attack/release/knee/makeup/output gain, independent dynamics bypass, solo and gain-reduction readout.
- Added a live logarithmic FFT spectrum/peak hold, stereo correlation/balance/mono-loss analysis, audition-only stereo/mono/L/R/mid/side monitoring, and loudness-matched A/B level compensation that never touches export.
- Added persistent mastering-module ordering and global module bypass (the final limiter remains active), complete project-chain parameters, and custom local chain presets.
- Moved rendered-buffer loudness/true-peak work off the UI thread to a progress-reporting, cancellable module Worker.
- Replaced the mastering compressor-as-limiter approximation with a shared LookaheadLimiter DSP used by the final mastering AudioWorklet for live playback and offline rendering. Offline render adds and trims the exact lookahead/interpolation latency.
- Added input and output gain in Basic and Advanced modes over the same settings, six built-in parameter presets, locally saved custom presets, and reset.
- Added complete arrangement offline render, A/B buffers, preview playback with cursor, BS.1770-oriented loudness measurements, sample/estimated-true-peak readouts, clipping/ceiling warnings, and stereo 16-bit WAV export.
- Stored mastering controls in the existing project JSON so old project files load with default mastering parameters and new settings survive project reload.
- Added an external track-to-track feed-forward compressor to the existing track-effect chain. A compressor can select a different track as its detector source, choose a pre- or post-fader tap, use a muted/unsoloed source as a ghost trigger, adjust detector gain/high-pass, and retain settings in project JSON and effect presets. The detector input is separate from the destination program input; kick audio is not mixed into the destination track.
- Implemented the sidechain detector/compressor in an AudioWorklet shared by live and offline track graphs. Missing/deleted sources are not connected; deleting a source clears dependent project references. Self-sidechains are ignored, and detector sends do not feed back into the source track.

## DSP and measurement accuracy

- EQ response is computed from the configured biquad transfer functions; the graph is not a decorative curve.
- The saturation is a normalized tanh waveshaper using the browser's 4× waveshaper oversampling mode.
- Stereo width uses mid/side sum/difference processing.
- Loudness analysis uses published BS.1770 K-weighting biquad coefficients at 48 kHz, bilinear rate transformation, ITU channel weights (including zero-weighted LFE), 400 ms windows at 100 ms hops, -70 LUFS absolute/-10 LU relative integrated gating, and 3-second short-term/LRA windows with -70/-20 LU gates and 10th/95th percentiles.
- True peak uses a 4× oversampling estimate with a 16-tap windowed-sinc interpolator. It is labelled as an estimate and is not asserted to be certified EBU/ITU true-peak compliance.
- The lookahead limiter uses stereo-linked peak detection, the same 4× interpolation estimate, configurable lookahead/release, smoothed attack/release gain and a 0.1 dB detector safety margin. Tests verified covered fixtures remained within 0.15 dB of or below ceiling; this is not a universal mathematical guarantee.
- Analysis stores a 3-second energy ring and compact histories instead of full-length filtered float copies. The Worker transfer creates one temporary copy per channel; long-file memory/time on mobile remains unmeasured.
- A/B compares the signal with the new mastering graph bypassed against the mastered signal while retaining existing legacy master-bus processing. Optional matching attenuates only the louder side based on measured integrated LUFS and affects preview gain only. Playback pause/resume and A/B switching retain the rendered position.

## Automated tests

- Runtime: official portable Node.js **22.23.4**, SHA-256 verified against the Node.js distribution checksums.
- JavaScript syntax checks: `src\app.js`, `src\audio.js`, `src\mastering.js`, `src\mastering-dsp.js`, `src\mastering-processor.js`, and `src\sidechain-processor.js` passed.
- Command: `node --test <all tests/*.test.js paths>` (Node test runner; `npm` is not present in the environment).
- Result for the current worktree: **81 passed, 0 failed**.
- New deterministic tests cover published 1 kHz loudness alignment, 44.1/48/96 kHz calibration, silence/gating, stereo/LFE/surround weighting, LRA dynamics, RMS/clipping, 4× inter-sample peaks, limiter ceiling/lookahead/stereo linking/release/broadband transients and project persistence.
- Existing project, timeline, arrangement, sample, and audio tests remained passing.
- Added deterministic sidechain DSP, attack/release, routing, worklet-readiness, sidechain project persistence and source-deletion tests. The full suite was executed successfully using the verified temporary Node runtime. The configured GitHub Actions run is pending.
- Phase 3 tests cover LR4 reconstruction within 1.5% RMS for bypassed bands, solo isolation, >10 dB low-band gain reduction and release recovery, render-quantum determinism, 1 kHz FFT-bin accuracy within 15 Hz, stereo cancellation metrics, A/B gain policy, order/persistence, and the final-limiter graph invariant.

## Browser and audio verification

Local Chromium testing used the existing generated-audio multi-track acceptance project. The Electronic / EDM preset was selected, the arrangement was rendered into original and processed buffers, and A/B was switched while preview playback was active.

- Real-time arrangement playback with the mastering preset active advanced transport to bar/beat `1.2.1`; stereo track-meter activity was observed and no browser errors occurred.
- Original (new mastering chain bypassed): RMS **-18.7 dBFS**, sample peak **0.9280 (-0.6 dBFS)**.
- Mastered: RMS **-17.8 dBFS**, sample peak **0.9646 (-0.3 dBFS)**.
- Exported WAV header/PCM was inspected directly: RIFF/WAVE PCM, stereo, **44,100 Hz**, **16-bit**, **34.25 seconds**, **6,041,744 bytes**.
- Decoded PCM sample peak: **0.96463**; RMS: **0.12870**. The output was non-silent, below full-scale sample peak, and differed from the A signal.
- Master settings, selected preset, mode, EQ band value and custom preset availability survived reload.
- No browser page or console errors were observed during the final local workflow.

### Batch 004C Phase 3 verification

- Chromium `AudioEngine.init()` created both the multiband and lookahead-limiter worklets in the live graph. Offline `AudioEngine.render()` with a generated 100 Hz/3 kHz sample, enabled three-band processing and limiter produced a 44.1 kHz stereo WAV; the WAV decoded to **8.300 s**, and analysis measured **-15.06 LUFS** and **-13.17 dBTP estimated** for that fixture.
- Module settings persisted through project JSON; Browser UI changed crossover to **320 Hz**, enabled multiband processing, reordered the chain, and retained limiter-last. Chromium Worker tests produced **27 monotonic progress updates**, final **100%**, and confirmed abort cancellation.
- A/B preview with matching displayed the measured **4.4 LU** difference and attenuated the louder comparison only. Live spectrum canvas painted during preview; mono audition and stereo metrics were available. Responsive emulation at **360/390/430/768/1280 CSS px** had no horizontal overflow; controls met 40 px minimum aside from hidden controls. This is browser emulation, not physical-device verification.
- No independent EBU LRA/true-peak vectors, physical acoustic output or long-duration mobile memory/performance benchmark were run. True peak remains an estimate; A/B uses the existing legacy master bus on both A/B buffers.

Phase 3 functionally completes multiband dynamics, monitoring, A/B, module order/presets, worker analysis and shared live/offline routing. Phase 2 independent standards/device checks remain release validation. Batch 004 remains in progress pending Phases 4–6.

The export is verified for this project/fixture only; these results do not prove a universal ceiling or standards-compliant mastering.

### Batch 004C Phase 2 DSP acceptance

- The analyzer implements K-weighted channel energy, 400 ms/100 ms-hop integrated windows, absolute/relative gates, 3-second short-term and LRA windows, RMS, sample peak, clipping and loudness history.
- The integrated loudness implementation matched the published `pyloudnorm` 1 kHz full-scale test expectation of **-3.0523 LUFS within 0.1 LU** using an equivalent generated sine fixture; the BS.1770 alignment tone at -23 LUFS was within **0.15 LU** at 44.1, 48 and 96 kHz. Synthetic loud/quiet sections exercised LRA, but published LRA audio vectors were not independently decoded here.
- OfflineAudioContext loaded the mastering AudioWorklet. A deterministic impulse at a **-3 dBTP** setting measured **-3.085 dBTP estimated**. `AudioEngine.render()` with a **-2 dBTP** ceiling, followed by WAV encoding and Chromium decoding, measured **-2.099 dBTP estimated**, passed a **+0.15 dB** tolerance, and retained an **8.30 s** render duration after latency trim.
- The 16-tap windowed-sinc 4× peak estimator recovered a generated 0.9-amplitude quarter-rate sine's inter-sample peak within **0.001 amplitude** (after edge fades). It is still an estimate and has no independent standards-certification claim.
- Browser-emulated mastering UI had no horizontal overflow at **360, 390, 430, 768 or 1280 CSS px**. Physical-device touch and real-time audio loopback were not measured in this run.
- Meter analysis is memory-bounded to a 3-second energy ring, but processing is synchronous on the UI thread; the UI indicates rendering/analysis phase, not percentage completion. Long-song interaction performance remains unmeasured.

### Batch 004B sidechain verification

- Chromium loaded the new AudioWorklet processor and rendered a deterministic two-track kick/bass fixture through `AudioEngine.render`.
- In the 110 Hz bass / pulsed 60 Hz kick fixture, rendered RMS around the kick transient measured **0.1193 without sidechain** and **0.0479 with sidechain**. During the following release interval, RMS measured **0.1300 without sidechain** and **0.0872 with sidechain**. This confirms measurable ducking and release on the offline graph; it is a focused synthetic test, not a full live/offline equivalence tolerance.
- With the source track muted, the non-ghost result remained neutral (**0.1193 RMS**); enabling Ghost trigger ducked the same bass to **0.0479 RMS**, confirming the trigger path is independent of the source's audible output.
- An HTTP-served Chromium `AudioEngine.init()` loaded the AudioWorklet module and reported `sidechainReady: true` with no error. The offline render path also loaded and processed that module.
- Browser-emulated real-time analysis could not verify live amplitude: the browser's real-time AnalyserNode returned zero for a separate, directly connected ConstantSourceNode control as well as for the engine fixture. Thus live signal-level reduction remains unverified in this environment, although live scheduling uses the same AudioWorklet processor and the same detector-routing helper.
- The sidechain panel and saved source selection were exercised through the UI. Responsive Chromium emulation at **360, 390, 430, 768 and 1280 CSS pixels** found no page-level horizontal overflow. The original browser project was restored after this UI check. Physical-device behavior was not tested.
- Remote Actions, live signal-level verification, physical-device behavior and deployment remain pending.

## Mobile viewport checks

Advanced controls were checked in Chromium emulation at **360, 390, 430, 768 and 1280 CSS pixels**. No page-level horizontal overflow occurred. The response graph remained visible, and playback/compare/export buttons measured 46–52 px tall on the three narrow viewports and 42 px at tablet/desktop widths.

These are emulated layout checks, not physical iOS/Android audio or touch tests.

## Known gaps / next development priorities

- Live sidechain detector-level behavior still needs verification in an audio-capable browser/device; this browser automation environment returned zero from its live AnalyserNode control. The current 59-test Node suite passed locally.
- Standards-based integrated, short-term, momentary LUFS, LRA, K-weighting, gating and true-peak oversampling/reference validation.
- A real lookahead peak limiter with oversampled inter-sample ceiling verification and gain-reduction metering; current compressor stage does not guarantee its displayed ceiling.
- Three-or-more-band dynamics with crossovers, per-band settings/solo and verified phase behavior.
- Frequency-selective exciter, mono audition/correlation metering, spectrum analyzer and loudness-matched A/B.
- User-controlled safe module reordering, with tests for order-dependent results.
- WAV 24-bit/32-bit-float, selectable sample rates, dithering controls, progress reporting for long renders, and legally suitable MP3 encoding.
- Mobile memory/performance benchmarks and additional browser-engine/physical-device testing.

## GitHub Pages and project compatibility

The new files are static browser JavaScript and require no backend, cloud service, or new dependency. Paths remain relative. Existing projects without a `mastering` property receive defaults; no migration drops their legacy master settings. This local worktree was not pushed or deployed, so the changed code has not been verified on GitHub Pages.

## Files changed

- `src/sidechain-processor.js` (new)
- `src/mastering.js` (new)
- `src/audio.js`
- `src/app.js`
- `src/project-state.js`
- `src/sampler.css`
- `tests/mastering.test.js` (new)
- `tests/sidechain.test.js` (new)
- `tests/project-state.test.js`
- `README.md`
- `IDEA.md`
- `BATCH_004_REPORT.md` (new)
