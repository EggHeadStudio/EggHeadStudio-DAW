# Batch 004C — Phases 1–5 Sidechain, Mastering, Export and Release Report

## Current status

**PHASE 5 FUNCTIONALLY COMPLETE — READY FOR PHASE 6**

Phase 1 sidechain stabilization passed 59/59 tests at that boundary. Phase 2 implemented loudness analysis, oversampled peak estimation and a shared lookahead limiter; independent true-peak/LRA reference validation and physical live-output checks remain release-validation tasks. Phase 3 adds multiband dynamics, spectrum and stereo monitoring, loudness-matched A/B, mastering-chain management and Worker-based analysis. Phase 4 adds shared offline rendering, WAV/MP3 encoding, resampling, analysis, progress and cancellation. Phase 5 adds versioned `.EHS` project archives, release metadata/artwork, and Release ZIPs. The current full Node suite passes **109/109**. Phase 6 end-to-end acceptance remains.

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
| Basic/Advanced mastering UI, warnings, before/after | Yes | Chromium Mastering view and 5 responsive viewport widths; progress/cancel exercised with the analysis Worker | **PASS — browser workflow** | Gain-reduction display is live AudioWorklet telemetry, not a rendered offline history. |
| Full Node.js suite at Phase 2 boundary | Yes | Portable Node.js 22.23.4, `node --test` over every `tests/*.test.js` | **PASS — 69/69 at Phase 2 boundary** | Phase 3 boundary passed 81/81; Phase 4 passed 97/97; current Phase 5 suite passes 109/109. Remote Actions remains pending. |
| Browser/device verification | Browser checks only | HTTP-served Chromium worklet, OfflineAudioContext limiter and WAV decode; 360/390/430/768/1280 CSS px | **PARTIAL PASS** | Emulation is not physical iOS/Android or real-time audio loopback testing. Long-project performance is not measured. |

### Phase 2 algorithm and tolerance details

- The integrated loudness reference is the `pyloudnorm` published 1 kHz full-scale test expectation (**-3.0523438444 LUFS**); an equivalent generated 44.1 kHz sine measured within **0.1 LU**. A -23 LUFS alignment signal is within **0.15 LU** at 44.1, 48 and 96 kHz.
- Integrated blocks are 400 ms with 100 ms hops; absolute gate is -70 LUFS and relative gate is -10 LU. Short-term/LRA blocks are 3 s with 100 ms hops; LRA applies -70 LUFS absolute and -20 LU relative gates and the 10th/95th percentiles.
- True peak is a 4×, 16-tap windowed-sinc estimate. Limiter integration uses 0.1 dB internal detector margin; tests accept no more than **+0.15 dB** above the requested ceiling. Chromium fixture outputs were below the ceiling.
- Analysis holds a 3-second energy ring and compact block histories; it does not allocate full-length filtered audio copies. Rendered-buffer analysis now runs in a cancellable progress-reporting Worker and transfers one temporary copy per channel. Long-file performance on physical mobile devices remains unmeasured.
- References: [ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770/en), [EBU Tech 3342](https://tech.ebu.ch/docs/tech/tech3342.pdf), and the [pyloudnorm 1 kHz test expectation](https://github.com/csteinmetz1/pyloudnorm/blob/master/tests/test_loudness.py). The EBU/ITU downloadable gating/LRA/true-peak reference files themselves were not run in this environment.

## Phase 3 acceptance matrix

| Requirement | Implemented | Tested / observed | Result | Remaining limitations |
|---|---|---|---|---|
| Three-band compressor with adjustable LR4 crossovers, per-band dynamics, bypass/solo, output gain and GR | Yes; shared DSP processor is used by mastering graph | Deterministic reconstruction, low-band solo, compression/release, and render-quantum tests | **PASS — automated fixtures** | Reconstruction tolerance is 1.5% RMS for bypassed-band fixture; solo-level deviation tolerance is 4%. No independent analog crossover comparison. |
| Frequency spectrum analyzer with log scale, dB scale, smoothing and peak hold | Yes; active preview feeds Web Audio analyser and Canvas | Chromium preview painted live spectrum; FFT unit fixture locates 1 kHz within 15 Hz | **PASS — browser and unit fixture** | No WebGL; visualization is throttled and hidden/preview-dependent. |
| Stereo correlation/balance, mid-side and L/R/mono audition | Yes; metrics and audition matrices process preview only | Deterministic stereo/cancellation measurements; browser mono audition and stereo metrics | **PASS — automated and browser** | Monitor modes do not alter export. No calibrated hardware measurement. |
| Loudness-matched A/B, position preservation and monitoring-only gain | Yes; measured integrated loudness informs attenuation of louder comparison | Browser displayed 4.4 LU difference; playback continued from comparison position | **PASS — browser workflow** | Matching attenuates only the louder side; the legacy master bus is present on both comparison paths. |
| Mastering modules enable/disable, order, presets and parameter persistence | Yes; EQ/saturation/imager/multiband are reorderable; output gain and limiter are fixed after them | Automated graph-order/persistence tests and browser project/order check | **PASS** | Safety limiter intentionally cannot be moved ahead of reorderable modules. No export-preset import/export file format beyond project/local presets. |
| One mastering path for live, preview, offline rendering and export | Yes; shared DSP definitions and mastering graph; final limiter remains last | Chromium initialized live multiband and limiter worklets; offline generated project rendered and decoded from WAV | **PASS — browser workflow** | No physical live-output null test. True-peak value remains an estimate, not independent certification. |
| Progress, cancellation, responsive layout and efficient analysis | Yes; analysis Worker reports progress and terminates on cancellation; analyzer is preview-driven | Chromium observed 27 monotonic Worker progress updates through 100%, cancellation, and no horizontal overflow at 360/390/430/768/1280 CSS px | **PASS — emulated browser** | No physical iOS/Android, prolonged mobile memory, or long-recording stress test. Worker transfer temporarily copies each audio channel once. |
| Deterministic Phase 3 tests and full regression suite | Yes | Portable Node.js 22.23.4: **81 passed, 0 failed** | **PASS** | Remote GitHub Actions was not run; independent loudness certification remains release validation. |
| WAV export with multiband processing and limiter | Yes | Chromium decoded stereo 44.1 kHz WAV, 8.300 s; fixture measured -15.06 LUFS and -13.17 dBTP estimated | **PASS — test fixture** | This fixture validates routing/decoding, not universal true-peak ceiling or live/offline sample-null equivalence. |

### Phase 3 DSP tolerances and limitations

- The LR4 crossover test permits at most 1.5% RMS reconstruction error for bypassed bands; low-band solo permits 4% level deviation. Compressor tests verify reduction greater than 10 dB for the selected fixture and recovery after release; results are deterministic-fixture checks, not subjective sound-quality certification.
- FFT fixture tolerance is 15 Hz at 1 kHz. A/B matching only attenuates the louder side, preventing comparison gain from introducing clipping; it is confined to preview monitoring.
- Browser measurements for one generated multiband WAV were -15.06 LUFS and -13.17 dBTP estimated. These are fixture observations, not independent reference validation. The project still requires published EBU LRA/true-peak vectors and a physical live-output/device test for release validation.
- The limiter remains the final peak-protection stage. Chain bypass disables reorderable mastering modules but does not bypass the limiter; preview monitor matrices and A/B compensation do not enter export.

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

## Phase 4 — Export Studio acceptance

| Requirement | Implemented | Tested / observed | Result | Remaining limitations |
|---|---|---|---|---|
| Shared render through arrangement, track effects, sidechain, mixer and optional mastering | Same offline project render feeds WAV and MP3 encoders | Generated four-track fixture used clips, Sampler, Drum Rack, EQ, compressor, delay, sidechain, multiband, saturation, width and limiter | **PASS — Chromium fixture** | One synthetic project; not universal live/offline sample-null certification. |
| WAV PCM/float formats and selectable rates | Mono/stereo 16-bit/24-bit PCM or 32-bit float; 44.1/48/88.2/96 kHz | Header/decoded browser checks at 44.1, 48 and 96 kHz; Node test covers all supported WAV rates | **PASS** | RIFF size limit applies; no RF64/BWF/metadata yet. |
| Dithering | Optional TPDF at final 16/24-bit quantization; disabled for float | Deterministic dither and float preservation tests; dithered 24-bit/48 kHz browser export | **PASS** | Dither is not a noise-shaped/mastering dither option. |
| MP3 encoding | Local CBR encoder, mono/stereo, 128/192/256/320 kbps at 44.1/48 kHz | Chromium decoded 320 kbps/48 kHz; frame inspection and rate/bitrate tests | **PASS — generated signal** | LAMEJS 1.2.7 LGPL-3.0 distribution is bundled separately with notices. Output has about 43–45 ms delay/padding; gapless metadata is not emitted/claimed. |
| Resampling and output inspection | 32-tap Blackman-windowed sinc; inspect, decode at requested rate, then analyze encoded signal | DC/alias tests; target-rate browser decode; WAV and MP3 measurements | **PASS — covered rates/fixtures** | Resampling has finite-filter edge behavior; not a mastering-grade sample-rate-conversion comparison. |
| Progress, cancellation, memory guard and persistence | Worker stage progress/cancel; warning above 192 MiB, block above 768 MiB; settings in project JSON | Worker canceled at encode stage with `AbortError`; browser reload retained format/bitrate/rate/Advanced choice | **PASS** | OfflineAudioContext render cannot be interrupted; cancellation during it discards its result. Memory values are conservative estimates, not measured allocations. |
| Full Node regression suite | Export tests added without removing earlier DSP/project tests | Portable Node.js 22.23.4, `npm test` | **PASS — 97/97** | Remote GitHub Actions was not run; this worktree is not pushed. |
| Browser export/mobile layout | Exported WAV 16/44.1, WAV 24/48 with dither, float WAV 32/96, MP3 320/48 | Chromium decoded 4-track 8.333 s WAV and 8.376 s MP3 at 48 kHz; viewport emulation 360/390/430/768/1280 | **PASS — browser/emulated viewports** | Not physical iOS/Android, other-browser, or deployed Pages verification. Export controls measured 42 px minimum. |

The shared 8.333-second stereo render measured **-24.44 LUFS** as WAV and **-24.43 LUFS** as MP3, with approximately **-5.80 dBTP estimated**. A final Basic-mode Chromium export of the saved 34-second project completed as stereo 320 kbps/44.1 kHz MP3; encoded-file analysis reported **-17.7 LUFS**, **-8.8 dBFS sample peak**, and **-8.8 dBTP estimated**. Advanced bitrate/rate settings survived reload, and switching to Basic restored the recommended 320 kbps/44.1 kHz defaults. A separate muted ghost-trigger sidechain fixture reduced bass transient-window RMS by **25.64 dB**. These are generated/browser fixtures and do not certify EBU/ITU compliance. MP3 decoder duration includes frame padding; 1-second output decoded at approximately 1.045 seconds. Phase 5 metadata/artwork/release ZIP behavior is verified below.

## Phase 5 — Portable projects and release packaging

| Requirement | Implemented | Tested / observed | Result | Remaining limitations |
|---|---|---|---|---|
| Versioned `.EHS` archive with referenced sample media | ZIP-compatible archive includes project JSON, manifest, README, referenced clip/Sampler/Drum Rack audio, artwork and selected custom mastering presets. Same-content audio is deduplicated; absent source files fall back to float32 WAV from decoded buffers. | Node round trips cover raw-asset deduplication, float-WAV fallback, empty projects, presets and current schema; Chromium imported one embedded audio asset and saved/reopened it. | **PASS — automated and browser** | Browser ZIP assembly is buffered; large archives coexist with source and output memory. |
| Import safety, checksums and migration | UTF-8/ZIP/path/header validation, size/count/compression-ratio limits, CRC-32 and per-file SHA-256, audio/image signatures, project reference checks, future-schema rejection and legacy schema migration. Import stages decodes before a batch IndexedDB write and active-project swap; ID collisions remap by content hash. | Node tamper, traversal, missing-asset, future-version, compression-ratio and schema-migration cases; Chromium restored the sample and persistent filename through reload. | **PASS — covered cases** | SHA-256 detects modification relative to the manifest; archives are not signed/authenticated. ZIP64/encrypted/multidisk archives are intentionally unsupported. |
| Release metadata and artwork | Project-persisted field validation; ID3v2.3 UTF-16LE text/TXXX/COMM/APIC; RIFF LIST/INFO WAV tags; local JPEG/PNG crop/resize and preserved source image. | Node Unicode/APIC and PCM-preservation tests; Chromium rejected an invalid calendar date, generated a 1,000 px cover from a 32×24 PNG, reloaded artwork settings, and inspected metadata/artwork in output. | **PASS — tested browser workflow** | Not BWF/iXML, RF64, ID3v2.4, embedded WAV art or formal streaming/broadcast metadata certification. |
| Release ZIP | One shared mastered render feeds selected WAV/MP3 encoders. ZIP contains `audio/`, matching `metadata.json`, `release-info.txt` and optional cover art. | Chromium produced a 291,082-byte package with 5 expected entries. WAV decoded as stereo 24-bit/44.1 kHz at 8.300 s with LIST/INFO; tagged stereo MP3 decoded at 44.1 kHz at 8.333 s with ID3 TIT2/TYER/TBPM/APIC; cover was present. | **PASS — generated arrangement fixture** | MP3 retains the encoder's frame padding; one browser/fixture, no independent metadata-player matrix. |
| Responsive release editor and end-to-end UI | Responsive metadata/artwork/package panel integrated into Export Studio; safe local-only processing. | Chromium emulation at 360/390/430/768/1280 CSS px had no page-level horizontal overflow after mobile header fix; no page errors during final package workflow. | **PASS — browser-emulated** | Physical iOS/Android and long-project mobile memory remain untested. |
| Complete Node test suite | Added metadata/archive tests while preserving all previous tests. | Portable Node.js 22.23.4, all `tests/*.test.js`: **109 passed, 0 failed**. | **PASS** | Remote GitHub Actions was not run; worktree is not pushed. |

Archive version 1 and import limits are documented in `EHS_FORMAT_SPEC.md`. It specifies a 256 MiB compressed archive cap, 512 MiB expanded cap, 4,096 entries, 200:1 per-entry compression-ratio cap, 16 MiB project JSON and 2 MiB manifest/preset JSON. Audio payload entries are stored to avoid extreme ratios for silence and compressed source files; worker compression is buffered, not streamed. MP3 metadata is ID3v2.3; WAV metadata is RIFF LIST/INFO only.

## Files changed across Phases 1–5

- `BATCH_004C_REPORT.md`
- `BATCH_004_REPORT.md`
- `IDEA.md`
- `README.md`
- `src/sidechain-processor.js` (new)
- `src/mastering.js` (new)
- `src/mastering-dsp.js` (new)
- `src/mastering-processor.js` (new)
- `src/export-dsp.js` (new)
- `src/export-worker.js` (new)
- `src/export.js` (new)
- `src/app.js`
- `src/audio.js`
- `src/project-state.js`
- `src/sampler.css`
- `tests/sidechain.test.js` (new)
- `tests/mastering.test.js` (new)
- `tests/export.test.js` (new)
- `tests/release-package.test.js` (new)
- `tests/project-state.test.js`
- `package.json`
- `package-lock.json`
- `vendor/lamejs/` (encoder and LGPL-3.0 notices)
- `vendor/fflate/` (ZIP module and MIT license)
- `src/portable-project.js`, `src/archive-worker.js`, `src/release-metadata.js`
- `EHS_FORMAT_SPEC.md`
- `src/style.css`

## Next phase boundary

Phase 5 is functionally complete and ready for Phase 6. Phase 2's independent BS.1770/EBU R128 reference-vector validation, physical live-output checks, GitHub Pages deployment of this worktree, and long-duration mobile performance remain release-validation tasks. Batch 004 still needs Phase 6 end-to-end acceptance. Existing long-term roadmap scope for automation, further effects, sampler improvements, plugin architecture and optional VST bridging remains intact.

No GitHub Pages deployment was performed. Static relative-path compatibility is preserved by the changes, but the updated worktree itself has not been deployment-tested.
