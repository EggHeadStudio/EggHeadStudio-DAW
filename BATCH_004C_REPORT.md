# Batch 004C — Phase 1 Sidechain Stabilization and Phase 2 Mastering Report

## Current status

**BATCH 004C PHASE 2 INCOMPLETE — CRITICAL REQUIREMENTS REMAIN**

Phase 1 sidechain stabilization remains complete (59/59 tests at that boundary). Phase 2 now implements loudness analysis, oversampled peak estimation and a shared lookahead limiter, with the current full suite passing **69/69** and browser OfflineAudioContext/WAV ceiling measurements passing. Phase 2 is not marked complete because true-peak/LRA validation against independent published vectors, physical/live-output equivalence and percentage progress/long-file performance remain unverified. Phases 3–6 were not started.

## Phase 2 acceptance matrix

| Requirement | Implemented | Tested | Result | Remaining limitations |
|---|---|---|---|---|
| K-weighting, channel weights, 400 ms windows, integrated absolute/relative gates | Yes | Published BS.1770 K coefficients; generated 1 kHz reference; mono/stereo and 44.1/48/96 kHz tests | **PARTIAL PASS** | Reference-tone tolerance passes, but official EBU/ITU gate WAV vectors were not decoded independently. Channel layout for multichannel audio is inferred from standard channel order because AudioBuffer has no channel mask. |
| Short-term and momentary loudness | Yes | 3 s short-term / 400 ms momentary windows on deterministic tones | **PASS — generated signal** | Independent published momentary/short-term files were not checked. |
| LRA and gating | Yes | 3 s blocks at 100 ms hop, -70/-20 LU gates, percentile test on loud/quiet segments | **PARTIAL PASS** | No independent published EBU Tech 3342 LRA reference file was decoded. |
| RMS, sample peak, clipping | Yes | Deterministic buffer and silence tests | **PASS** | Clipping is sample-domain; true-peak estimate is reported separately. |
| 4× true-peak estimate | Yes | 16-tap windowed-sinc interpolation; exact generated quarter-rate sine fixture | **PASS — approximation** | Not formally certified against an independent ITU-R BS.1770-4 true-peak vector; UI labels it an estimate. |
| Linked-stereo lookahead limiter, ceiling, release, smooth gain | Yes | Unit tests for lookahead, release, stereo link, ceiling; Chromium OfflineAudioContext impulse measured -3.085 dBTP estimated at -3 dBTP setting | **PASS — tested signals** | 0.1 dB internal guard plus verified 0.15 dB test tolerance; not a universal proof for every pathological waveform or all browser renderers. |
| Shared live/offline DSP and latency compensation | Yes | Same `LookaheadLimiter` implementation in the AudioWorklet; offline mastering render adds/trims measured processor latency | **PARTIAL PASS** | Browser OAC and decoded WAV validated; physical real-time acoustic loopback and exact live-vs-offline null comparison unavailable. |
| Limiter included in offline WAV | Yes | Rendered arrangement at -2 dBTP, encoded with `toWav`, decoded in Chromium, measured -2.099 dBTP estimated; duration preserved at 8.30 s | **PASS — Chromium fixture** | Stereo 16-bit/44.1 kHz remains the only WAV export format. |
| Project settings persistence | Yes | JSON round-trip covers enabled state, ceiling, lookahead and release | **PASS** | No separate UI-driven close/reopen scenario in this phase. |
| Basic/Advanced mastering UI, warnings, before/after | Yes | Chromium Mastering view render and 5 responsive viewport widths | **PARTIAL PASS** | Analysis is synchronous; status shows the analysis stage but no percentage progress. Gain-reduction display is the live AudioWorklet value, not a rendered offline history. |
| Full Node.js suite | Yes | Portable Node.js 22.23.4, `node --test` over every `tests/*.test.js` | **PASS — 69/69** | `npm` unavailable; equivalent complete test-file list executed directly. Remote Actions pending. |
| Browser/device verification | Browser checks only | HTTP-served Chromium worklet, OfflineAudioContext limiter and WAV decode; 360/390/430/768/1280 CSS px | **PARTIAL PASS** | Emulation is not physical iOS/Android or real-time audio loopback testing. Long-project performance is not measured. |

### Phase 2 algorithm and tolerance details

- The integrated loudness reference is the `pyloudnorm` published 1 kHz full-scale test expectation (**-3.0523438444 LUFS**); an equivalent generated 44.1 kHz sine measured within **0.1 LU**. A -23 LUFS alignment signal is within **0.15 LU** at 44.1, 48 and 96 kHz.
- Integrated blocks are 400 ms with 100 ms hops; absolute gate is -70 LUFS and relative gate is -10 LU. Short-term/LRA blocks are 3 s with 100 ms hops; LRA applies -70 LUFS absolute and -20 LU relative gates and the 10th/95th percentiles.
- True peak is a 4×, 16-tap windowed-sinc estimate. Limiter integration uses 0.1 dB internal detector margin; tests accept no more than **+0.15 dB** above the requested ceiling. Chromium fixture outputs were below the ceiling.
- Analysis holds a 3-second energy ring and compact block histories; it does not allocate full-length filtered audio copies. The synchronous analysis loop still risks UI stalls on long mixes.
- References: [ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770/en), [EBU Tech 3342](https://tech.ebu.ch/docs/tech/tech3342.pdf), and the [pyloudnorm 1 kHz test expectation](https://github.com/csteinmetz1/pyloudnorm/blob/master/tests/test_loudness.py). The EBU/ITU downloadable gating/LRA/true-peak reference files themselves were not run in this environment.

## Phase 1 sidechain report (historical)

## Environment and test execution

- Runtime: official portable Node.js **22.23.4**, downloaded from `nodejs.org` and SHA-256 verified against its published `SHASUMS256.txt`.
- `npm` is unavailable in this environment. No project dependency was installed or changed.
- Ran every `tests/*.test.js` file directly with Node's test runner.
- JavaScript syntax checks passed for `src/app.js`, `src/audio.js`, and `src/sidechain-processor.js`.
- Current result: **59 tests passed, 0 failed**.
- `.github/workflows/test.yml` is configured for Node.js 22 on pushes to `main` and pull requests. A remote Actions run is pending; this work has not been pushed.

## Phase 1 acceptance matrix (recorded at the phase boundary)

| Phase / requirement | Implemented | Tested | Result | Remaining limitations |
|---|---|---|---|---|
| 1.1 Run all Node tests, including sidechain tests | Yes | Full suite executed with Node 22.23.4 | **PASS — 59/59** | `npm test` itself was not invoked because npm is unavailable; the configured test files were run directly with `node --test`. Remote CI is pending. |
| 1.2 AudioWorklet processor initializes | Yes | HTTP-served Chromium `AudioEngine.init()` reported `sidechainReady: true`, no error; offline rendering also loaded the worklet | **PASS** | Real-time output amplitude could not be measured in this browser automation environment. |
| 1.3 Sidechain attack/release | Yes | Deterministic worklet test and sample measurements | **PASS** | At a 1 kHz test sample rate, constant program output was 0.2294 at frame 5, 0.0899 at frame 50; after detector release it rose to 0.1064 at frame 110 and 0.2649 at frame 199. These synthetic values verify smoothing behavior, not subjective sound quality. |
| 1.4 Pre/post-fader routing | Yes | Graph-routing regression verifies the selected pre/post source bus and detector-only connection | **PASS — topology** | Separate measured offline signal-level comparison for both tap positions remains outstanding. |
| 1.5 Ghost trigger | Yes | Offline 110 Hz bass / pulsed 60 Hz kick fixture, muted source | **PASS** | Transient-window RMS: 0.1193 with the muted source and Ghost off; 0.0479 with Ghost on. |
| 1.6 Mute/solo interactions | Yes | Deterministic routing test covers mute, solo, and destination audibility; offline muted/Ghost case measured | **PASS — routing and mute case** | Physical-device and live output measurement remain outstanding. |
| 1.7 Source-track deletion | Yes | Project-state regression verifies source deletion clears dependent sidechain IDs and does not remove shared samples | **PASS** | Missing source remains neutral until a new source is selected. |
| 1.8 Project persistence | Yes | JSON serialization round-trip includes sidechain fields; browser UI selection was saved and reloaded | **PASS** | Remote project migration scenarios were not tested. |
| 1.9 Live/offline comparison | Shared AudioWorklet processor and sidechain connection helper are used | Offline rendering measured ducking; browser AudioWorklet module initialization checked | **PARTIAL** | Live level was not measurable: the browser's real-time AnalyserNode returned zero for both the DAW fixture and an independent ConstantSourceNode control. This is a limitation of that automation route, not evidence that the sidechain DSP is defective. |
| 1.10 Deterministic kick/bass fixtures | Existing OfflineAudioContext render and processor unit fixtures | Transient and release windows compared with and without sidechain | **PASS — offline** | Add reference tolerance coverage for more sample rates, signal levels, stereo detector signals, and tap positions. |
| 2. Loudness analyzer: LUFS, LRA, RMS, peaks, history, clipping | No new implementation | No reference-vector validation in this phase | **NOT STARTED** | Existing mastering display still reports RMS and sample peak only; no verified BS.1770/EBU R128 measurement or true-peak estimate. |
| 2. True-peak lookahead limiter | No new implementation | No tests in this phase | **NOT STARTED** | Current mastering peak-control stage is still compressor-based and does not guarantee its displayed ceiling. |
| 3. Multiband compressor | No new implementation | No crossover/DSP tests in this phase | **NOT STARTED** | Crossovers, per-band controls, solo/bypass, and gain-reduction meters remain absent. |
| 3. Spectrum/correlation/mono/A-B/module ordering | No new implementation | No tests in this phase | **NOT STARTED** | Existing A/B is not loudness matched; no spectrum/correlation analyzer or safe module reordering. |
| 4. Professional WAV formats, rates, dithering, metadata | No new implementation | No tests in this phase | **NOT STARTED** | Current export remains stereo 16-bit PCM at the renderer's current rate. |
| 4. Genuine MP3 encoder and independent decode | No new implementation | No encoder/decoder tests in this phase | **NOT STARTED** | Encoder suitability and licensing have not been evaluated. |
| 4. Export consistency, sidechain/mastering/tails/progress | Existing offline project rendering handles track routing; current sidechain render is tested | Offline ducking and effect-chain output measured | **PARTIAL** | No unified selectable-format release-export pipeline, progress/cancel UI, or end-to-end final-release verification. |
| 5. Release metadata, ID3/RIFF/BWF tags | No new implementation | No parser validation | **NOT STARTED** | No metadata editor or embedded tag writer. |
| 5. Cover-art editing/embedding | No new implementation | No image workflow tests | **NOT STARTED** | No crop/reposition/resize flow or artwork embedder. |
| 5. Release ZIP | No new implementation | No archive tests | **NOT STARTED** | No package builder or internal consistency verification. |
| 6. Full end-to-end music-to-release workflow | No new implementation | Only the Phase 1 sidechain workflow was exercised | **NOT STARTED** | Mastering, metadata, MP3, artwork, package, and full project reload acceptance are not complete. |
| 6. Responsive checks | Existing sidechain panel layout | Chromium emulation at 360, 390, 430, 768, and 1280 CSS px | **PASS — layout only** | Browser emulation is not physical iOS/Android audio or touch-device validation. |

## Sidechain measurements

For a 110 Hz bass signal with pulsed 60 Hz kick detector, the offline transient-window measurements were:

- No ducking: **0.1193 RMS**
- Sidechain active: **0.0479 RMS**
- Release interval, no ducking: **0.1300 RMS**
- Release interval, sidechain active: **0.0872 RMS**

Muted-source handling behaved as configured: Ghost off remained at **0.1193 RMS**; Ghost on produced **0.0479 RMS**. The pre/post tap selection is covered by routing topology tests, not by a paired signal-level test.

The browser automation environment's real-time analyser returned zeros for an independent ConstantSourceNode control and the DAW live graph. As a result, these checks do not establish live acoustic output or live/offline equivalence. There is no evidence from that analyser result alone of a DSP defect.

### Real-time verification procedure for a browser/device with an audio route

1. Open a secure-context deployment or `http://localhost` on a desktop browser with audio output enabled.
2. Create two audio tracks containing the same deterministic, 2-second kick and bass WAV fixtures used for offline tests.
3. Add a compressor to the bass track; set threshold `-24 dB`, ratio `8:1`, attack `5 ms`, release `200 ms`, knee `0 dB`; select the kick track as a pre-fader source.
4. Play and capture the bass output through an approved loopback capture or an externally recorded line output. Repeat with the sidechain disabled, source muted with Ghost off, then source muted with Ghost on.
5. Compare the same transient and release windows used by the offline test. Confirm kick audio does not appear in the bass program output and that the configured source/tap/solo behavior is respected.
6. Repeat with the post-fader tap and a reduced kick-track fader. Record browser/device, sample rate, measured RMS, and any audio interruption.
7. Compare exported/offline and loopback captures using the same sample alignment and RMS windows. Do not treat UI gain-reduction telemetry alone as proof of output equivalence.

This procedure was not performed on a physical audio device for this report.

## Phase 1 implementation changes

- Added a runtime guard so enabled sidechain routing cannot silently construct against an unregistered AudioWorklet processor.
- Added independent sidechain defaults per compressor instance.
- Added deterministic attack/release, routing, worklet readiness, mute/solo and missing-processor tests; retained project round-trip and deletion coverage.
- Updated the report and roadmap with verified current status. No external service, dependency, commit, push, or deployment was used.

## Files changed for this checkpoint

- `BATCH_004C_REPORT.md` (new)
- `BATCH_004_REPORT.md`
- `IDEA.md`
- `README.md`
- `src/app.js`
- `src/audio.js`
- `tests/sidechain.test.js`

## Next phase boundary

Phase 1 is complete for the automated and offline criteria above. Before declaring Batch 004 complete, proceed in order through Phase 2's reference-validated BS.1770/EBU R128 analyzer and genuine lookahead limiter, then Phase 3 mastering modules, Phase 4 formats/encoding, Phase 5 metadata/artwork/release packaging, and Phase 6 complete acceptance. Existing long-term roadmap scope for automation, further effects, sampler improvements, plugin architecture and optional VST bridging remains intact.

No GitHub Pages deployment was performed. Static relative-path compatibility is preserved by the changes, but the updated worktree itself has not been deployment-tested.
