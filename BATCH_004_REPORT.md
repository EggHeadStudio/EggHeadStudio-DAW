# Batch 004 — Mastering Studio Vertical-Slice Report

## Status

**BATCH 004 IN PROGRESS — FUNCTIONAL VERTICAL SLICE**

This pass prioritized real signal processing and a verifiable master-to-export path. It does not complete the full Batch 004 scope. Missing professional measurements, multiband processing, a verified peak-safe limiter, extended export formats, and additional analysis are listed below.

## Implemented

- Replaced the prior master-only controls with a responsive Mastering workspace.
- Added one master graph shared by real-time arrangement playback and offline WAV rendering/export:
  existing arrangement/track graph → legacy master bus → input trim → mastering EQ → saturation → mid/side width → compressor-based peak control → output gain. Module order is fixed in this slice.
- Added six parametric EQ bands (low shelf, four bells, high shelf), high/low-cut controls, an actual biquad response plot, and draggable/touch band points.
- Added a waveshaper saturation module with 4× Web Audio oversampling.
- Added mid/side width processing; width zero folds the stereo signal to mono.
- Added an adjustable Web Audio dynamics-compressor stage clearly labelled as compressor-based peak control, not a verified true-peak/lookahead limiter.
- Added input and output gain in Basic and Advanced modes over the same settings, six built-in parameter presets, locally saved custom presets, and reset.
- Added complete arrangement offline render, A/B buffers, preview playback with cursor, RMS dBFS and sample-peak readouts, clipping warning, and stereo 16-bit WAV export.
- Stored mastering controls in the existing project JSON so old project files load with default mastering parameters and new settings survive project reload.
- Added an external track-to-track feed-forward compressor to the existing track-effect chain. A compressor can select a different track as its detector source, choose a pre- or post-fader tap, use a muted/unsoloed source as a ghost trigger, adjust detector gain/high-pass, and retain settings in project JSON and effect presets. The detector input is separate from the destination program input; kick audio is not mixed into the destination track.
- Implemented the sidechain detector/compressor in an AudioWorklet shared by live and offline track graphs. Missing/deleted sources are not connected; deleting a source clears dependent project references. Self-sidechains are ignored, and detector sends do not feed back into the source track.

## DSP and measurement accuracy

- EQ response is computed from the configured biquad transfer functions; the graph is not a decorative curve.
- The saturation is a normalized tanh waveshaper using the browser's 4× waveshaper oversampling mode.
- Stereo width uses mid/side sum/difference processing.
- The limiter-labelled setting controls a `DynamicsCompressorNode` (20:1 ratio, configured threshold, short attack/release). Web Audio does not provide a guaranteed lookahead or hard sample ceiling here. It can exceed the selected ceiling and is not called true-peak limiting.
- Metering reports RMS dBFS and sample peak only. No value is labelled LUFS or true peak; no BS.1770/EBU R128 gating or loudness range is implemented.
- A/B compares the signal with the new mastering graph bypassed against the mastered signal while retaining existing legacy master-bus processing. It is not level-matched. Playback pause/resume and A/B switching retain the rendered position.

## Automated tests from the prior Batch 004 pass

- Runtime: Node.js 24.20.0 (prior pass).
- JavaScript syntax checks: `src\app.js`, `src\audio.js`, `src\mastering.js` passed in the prior pass.
- Command: `node --test tests\*.test.js`.
- Result before the current sidechain changes: **51 passed, 0 failed**.
- New deterministic tests cover settings bounds and defaults, six-band EQ response/cuts, graph module wiring/parameters, preset parameter changes, project JSON persistence, and correct RMS/sample-peak analysis.
- Existing project, timeline, arrangement, sample, and audio tests remained passing.
- Added deterministic sidechain DSP, routing, sidechain project persistence and source-deletion tests. These new tests have **not** been run in the current environment because neither `node` nor `npm` is available on PATH. The prior 51/51 result predates this sidechain change and is not a test result for the current worktree. The configured GitHub Actions run is pending.

## Browser and audio verification

Local Chromium testing used the existing generated-audio multi-track acceptance project. The Electronic / EDM preset was selected, the arrangement was rendered into original and processed buffers, and A/B was switched while preview playback was active.

- Real-time arrangement playback with the mastering preset active advanced transport to bar/beat `1.2.1`; stereo track-meter activity was observed and no browser errors occurred.
- Original (new mastering chain bypassed): RMS **-18.7 dBFS**, sample peak **0.9280 (-0.6 dBFS)**.
- Mastered: RMS **-17.8 dBFS**, sample peak **0.9646 (-0.3 dBFS)**.
- Exported WAV header/PCM was inspected directly: RIFF/WAVE PCM, stereo, **44,100 Hz**, **16-bit**, **34.25 seconds**, **6,041,744 bytes**.
- Decoded PCM sample peak: **0.96463**; RMS: **0.12870**. The output was non-silent, below full-scale sample peak, and differed from the A signal.
- Master settings, selected preset, mode, EQ band value and custom preset availability survived reload.
- No browser page or console errors were observed during the final local workflow.

The export is verified for this project/fixture only; these results do not prove a universal ceiling or standards-compliant mastering.

### Batch 004B sidechain verification

- Chromium loaded the new AudioWorklet processor and rendered a deterministic two-track kick/bass fixture through `AudioEngine.render`.
- In the 110 Hz bass / pulsed 60 Hz kick fixture, rendered RMS around the kick transient measured **0.1193 without sidechain** and **0.0479 with sidechain**. During the following release interval, RMS measured **0.1300 without sidechain** and **0.0872 with sidechain**. This confirms measurable ducking and release on the offline graph; it is a focused synthetic test, not a full live/offline equivalence tolerance.
- With the source track muted, the non-ghost result remained neutral (**0.1193 RMS**); enabling Ghost trigger ducked the same bass to **0.0479 RMS**, confirming the trigger path is independent of the source's audible output.
- Browser-emulated real-time analysis could not verify live amplitude: the browser's real-time AnalyserNode returned zero for a separate, directly connected ConstantSourceNode control as well as for the engine fixture. Thus live signal-level reduction remains unverified in this environment, although live scheduling uses the same AudioWorklet processor and the same detector-routing helper.
- The sidechain panel and saved source selection were exercised through the UI. Responsive Chromium emulation at **360, 390, 430, 768 and 1280 CSS pixels** found no page-level horizontal overflow. The original browser project was restored after this UI check. Physical-device behavior was not tested.
- Node tests, remote Actions, live signal-level verification, physical-device behavior and deployment remain pending.

## Mobile viewport checks

Advanced controls were checked in Chromium emulation at **360, 390, 430, 768 and 1280 CSS pixels**. No page-level horizontal overflow occurred. The response graph remained visible, and playback/compare/export buttons measured 46–52 px tall on the three narrow viewports and 42 px at tablet/desktop widths.

These are emulated layout checks, not physical iOS/Android audio or touch tests.

## Known gaps / next development priorities

- New sidechain tests are added but need execution in Node.js or the configured GitHub Actions workflow. Verify real-time detector gain reduction on an audio-capable browser/device; this browser automation environment returned zero from its live AnalyserNode control.
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
- `tests/sidechain.test.js` (new; not run in this environment)
- `tests/project-state.test.js`
- `README.md`
- `IDEA.md`
- `BATCH_004_REPORT.md` (new)
