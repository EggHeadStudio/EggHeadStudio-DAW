# Batch 004 — Mastering Studio Vertical-Slice Report

## Status

**BATCH 004 FUNCTIONALLY COMPLETE — PHASES 1–6 ACCEPTED LOCALLY**

Phases 1–6 have implementation and local automated/Chromium acceptance evidence. The current Node suite passes 110/110. Independent Phase 2 certification/device checks, physical touch/audio, medium/large project performance and deployment of this unpushed worktree remain release-validation or Batch 005 tasks, not blockers to functional closure.

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

Phase 3 functionally completed multiband dynamics, monitoring, A/B, module order/presets, Worker analysis and shared live/offline routing. Phase 4 export is now functionally complete; Phase 2 independent standards/device checks remain release validation. Batch 004 remains in progress pending Phases 5–6.

## Phase 4 — Export Studio and format pipeline

- Added persistent Basic/Advanced Export Studio settings for WAV/MP3, sample rate, bit depth or bitrate, channel count, optional mastering, and integer-WAV dithering. Returning to Basic mode restores the recommended 24-bit/44.1 kHz stereo WAV or 320 kbps/44.1 kHz stereo MP3 defaults.
- Renders the project once through the existing offline arrangement, effects, mixer, sidechain and mastering path. The resulting same master buffer feeds every encoder, so format conversion does not construct a second audio mix or apply mastering twice.
- WAV output: mono/stereo 16-bit and 24-bit PCM or 32-bit IEEE float; 44.1, 48, 88.2 and 96 kHz. Optional TPDF dither is used only at integer PCM quantization. Float WAV remains unclipped and undithered.
- MP3 output: mono/stereo CBR at 128, 192, 256 or 320 kbps and 44.1 or 48 kHz. The ES-module encoder is locally bundled from `@breezystack/lamejs` 1.2.7 as a separate LGPL-3.0 component with the upstream notice and license included; there is no runtime CDN or backend.
- Both encoders and resampling run in a cancellable Worker with progress messages. WAV conversion uses a 32-tap Blackman-windowed sinc low-pass interpolator. Encoded WAV/MP3 output is inspected, decoded at the requested rate and re-analyzed for loudness, sample peak and estimated true peak before download.
- Export estimates memory before rendering, warns above 192 MiB, blocks estimates above 768 MiB, and uses the existing 10-minute arrangement render limit. Worker-side resample/encode cancellation is verified. Browser `OfflineAudioContext` rendering itself cannot be interrupted; cancellation during that stage discards the completed render.

### Phase 4 automated and browser verification

- Portable Node.js 22.23.4 ran the current complete test suite: **110 passed, 0 failed**. Phase 4's historical boundary was 97/97 and Phase 5's was 109/109. Phase 6 added `tests/production-acceptance.test.js`; changed JavaScript files pass `node --check`.
- Deterministic export tests cover PCM/float WAV headers and sample conversion, optional dither, all four supported WAV sample rates, resampling response/DC preservation, MP3 frame rate/bitrate/channel inspection, settings and memory policy, render duration including sampler note tails, and Worker cancellation. Full regression suite retained earlier DAW, DSP and project-persistence tests.
- Chromium UI exports succeeded for **16-bit/44.1 kHz WAV**, **dithered 24-bit/48 kHz WAV**, **32-bit float/96 kHz WAV**, and **320 kbps/48 kHz MP3**. Export settings survived reload. A Worker cancellation initiated from the encoding progress callback rejected with `AbortError`.
- After the Basic-mode defaults were finalized, Chromium also completed a **320 kbps/44.1 kHz stereo MP3** export from the saved 34-second project. The encoded-file analysis reported **-17.7 LUFS**, **-8.8 dBFS sample peak**, and **-8.8 dBTP estimated**. Advanced bitrate/rate settings persisted through reload, and switching to Basic restored 320 kbps/44.1 kHz defaults.
- A generated four-track arrangement included audio clips, Sampler, Drum Rack, track EQ/compression/delay, sidechain, multiband mastering, saturation, stereo width and limiter. The same 48 kHz stereo render was encoded to WAV and MP3, then decoded by Chromium at 48 kHz. WAV duration was **8.333 s**; MP3 duration was **8.376 s**. Integrated loudness was **-24.44 LUFS** and **-24.43 LUFS** respectively; estimated true peak was approximately **-5.80 dBTP**. These measurements validate this generated project and the format pipeline, not formal mastering compliance.
- A separate muted ghost-trigger fixture measured bass transient RMS **25.64 dB lower** with sidechain active than inactive. This confirms the sidechain feeds the shared export renderer; it is a synthetic routing check, not an all-project parity claim.
- Browser viewport emulation at **360, 390, 430, 768 and 1280 CSS px** found no horizontal overflow. Export mode/format selectors were 42 px high and the primary action was 44–46 px high. This is Chromium emulation, not physical-device verification.
- MP3 frame padding is currently audible/visible as approximately **43–45 ms** of additional decoded duration (1 s fixture decoded to about 1.045 s). The tested LAMEJS output does not provide a recognized Xing/Info gapless trim header; gapless playback/export is not claimed. Phase 5 implements ID3v2.3 MP3 and RIFF LIST/INFO WAV metadata, artwork, and release archives.

The export is verified for this project/fixture only; these results do not prove a universal ceiling or standards-compliant mastering.

## Phase 5 — Portable projects and release delivery

- Added schema-versioned `.EHS` ZIP-compatible archives with a project manifest, checksummed project data, deduplicated referenced audio, optional prepared/source artwork and custom mastering presets. When original audio bytes are unavailable, an existing decoded buffer is stored as float32 WAV.
- Added preflight ZIP structure/path/count/size/compression-ratio checks, CRC-32 and SHA-256 verification, image-signature checks, project/asset relationship validation, schema migration and future-version rejection. Media decode and collision handling are staged before batched IndexedDB writes and project replacement.
- Added release metadata validation and project persistence. MP3 export writes ID3v2.3 UTF-16LE text frames, Producer TXXX, comments and front-cover APIC; WAV export adds RIFF LIST/INFO metadata without changing PCM samples. Artwork crop/resize runs locally and preserves the imported source.
- Release ZIP renders the arrangement once, then includes selected mastered WAV/MP3 outputs, release metadata/notes and optional cover art. Audio ZIP media is stored rather than compressed to avoid extreme ratios for silence and compressed source audio; Worker compression remains buffered.
- `EHS_FORMAT_SPEC.md` records archive version 1, entry layout, SHA-256/CRC handling, legacy migration, security/memory limits, supported tags and limitations.

### Phase 5 automated and browser verification

- Portable Node.js 22.23.4 ran all test files: **109 passed, 0 failed**. New coverage includes Unicode ID3v2.3/APIC frames, WAV LIST/INFO sample preservation, archive asset deduplication and float-WAV fallback, CRC/SHA and tampering paths, schema migration, missing media, artwork validation, presets, traversal and ZIP-bomb ratio limits, and Release ZIP entries.
- Chromium imported a versioned `.EHS` project with a generated sample, restored the sample name through IndexedDB and page reload, and successfully saved/reopened a `.EHS` containing project, sample, and artwork source/prepared media.
- Release metadata rejected the invalid date `2025-02-29`; valid metadata persisted. A 32×24 PNG was locally cropped/resized to a 1,000×1,000 JPEG and appeared after reload.
- Chromium produced a 291,082-byte Release ZIP with 5 expected entries. The WAV decoded as stereo 24-bit/44.1 kHz at 8.300 s and contained a RIFF LIST/INFO chunk. The ID3v2.3-tagged stereo MP3 decoded at 44.1 kHz at 8.333 s and included title/year/BPM/art frames. Cover art was present; there were no page errors during this package workflow.
- At 360/390/430/768/1280 CSS px, fresh stylesheet-loaded Chromium emulation found no page-level horizontal overflow. The responsive header needed a small fix found by this check. Physical device tests are not claimed.
- MP3/WAV release output was decoded by Chromium after metadata insertion; there is no independent cross-player metadata interoperability matrix. Browser ZIP creation is not streaming and large projects can require substantially more memory than their final archive size.

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

- Phase 6 local functional acceptance is complete; see [BATCH_004_FINAL_ACCEPTANCE.md](./BATCH_004_FINAL_ACCEPTANCE.md).
- Independent published EBU/ITU loudness/LRA/true-peak reference audio, formal true-peak certification, physical live-output/device testing, and long-duration mobile memory/performance remain release-validation tasks. The 4× true-peak measurement is an estimate, not certification.
- Live sidechain signal level and real-time acoustic loopback were not measured in this browser automation route. The offline ghost-trigger fixture verifies signal routing but does not replace physical-device testing.
- MP3 output is CBR and has about 43–45 ms frame delay/padding in Chromium decode; gapless metadata is not implemented. Offline render cannot be interrupted mid-render, and long-project mobile memory/time remain unmeasured.
- GitHub Actions was inspected but not run remotely; the worktree remains unpushed and the changed revision was not deployed to GitHub Pages.

## GitHub Pages and project compatibility

The application remains static and backend-free, and all application/vendor asset paths are relative for GitHub Pages. The MP3 encoder is vendored locally and loaded as a separate ES module with LGPL-3.0 attribution and license files; no runtime network fetch is required. Export settings persist through existing project metadata. This worktree was not pushed or deployed, so the changed code has not been verified on GitHub Pages.

## Files changed

- `src/sidechain-processor.js` (new)
- `src/mastering.js` (new)
- `src/audio.js`
- `src/app.js`
- `src/project-state.js`
- `src/sampler.css`
- `tests/mastering.test.js` (new)
- `tests/production-acceptance.test.js` (new)
- [BATCH_004_FINAL_ACCEPTANCE.md](./BATCH_004_FINAL_ACCEPTANCE.md) (new)

## Phase 6 — Full production acceptance

The deterministic Node fixture in `tests/production-acceptance.test.js` builds an eight-track project with six generated audio assets, including WAV, MP3, simulated microphone audio and processed audio; two Samplers; a Drum Rack; multiple note/step patterns; track effects; kick-to-bass sidechain; mastering modules; export settings; release metadata; artwork; and a custom preset. The archive round-trip test verifies each referenced asset, content hash, track/instrument/pattern state, sidechain source, artwork and preset.

Chromium used a locally generated eight-track archive and later a nine-track edited version. In the clean-import scenario, the application project localStorage entry and IndexedDB asset store were cleared before reloading and importing; seven unique assets were restored without local sample-library files and the arrangement played without missing-sample markers. A second edited `.EHS` reopened with the BPM change and unchanged SHA-256 values for all seven audio assets. Importing a damaged ZIP left the active project unchanged; dismissing the replacement warning and cancelling New Project also preserved the active project. Creating a new empty project retained the seven sample-library items. Local autosave recovered the project after reload. The microphone take was deterministic simulated audio; no microphone hardware was exercised.

Sample Studio loaded a generated one-second, mono 440 Hz sine WAV (decoded by the browser's 48 kHz audio context), selected 0.1–0.9 seconds, applied 20 ms fades, normalized and reversed it, previewed the selection and saved a new sample. The saved sample created another Sampler; a C4 Piano Roll note was added. The imported Drum Rack exposed 16 pads, had two assigned samples, triggered a pad and accepted a new step. Arrangement playback advanced transport and displayed active kick/bass/lead meters; the sidechain reference remained set from bass to kick. No browser page errors were observed in the playback and export scenarios.

The 34.585714-second stereo/44.1 kHz mastered render exported successfully as 16-bit PCM WAV (6,101,110 bytes), 24-bit PCM WAV (9,151,570 bytes), 32-bit float WAV (12,202,030 bytes), and 320 kbps MP3 (1,384,805 bytes). All had 1,525,230 WAV frames or 1,325 MP3 frames, were stereo at 44.1 kHz, and the decoded-file analyzer reported -21.1 LUFS, -7.5 dBFS sample peak and -7.5 dBTP estimated for the same stable project. WAV exports contained LIST/INFO; MP3 contained APIC artwork metadata. MP3 frame duration was 34.612245 seconds, about 26.5 ms longer than the WAV frame duration in this fixture.

The browser Release ZIP was 6,616,772 bytes and contained mastered WAV and MP3, `metadata.json`, `release-info.txt` and cover artwork. The audio entries were stereo/44.1 kHz; WAV was 32-bit float/34.585714 seconds and MP3 was CBR 320 kbps/34.612245 seconds. The matching metadata listed both output properties and the MP3 carried an APIC cover frame. The release builder renders once and encodes both formats from that render; the editable `.EHS` remained a separate archive. Local custom mastering presets were verified in the saved archive; acceptance exposed and fixed omission of inactive custom presets.

Export took 7.4–7.7 seconds for the approximately 34.6-second, eight-track fixture on the described desktop Chromium host. `.EHS` import measured 229 ms; archive save measured 252 ms. Browser `performance.memory` sampling reported 70.2 MiB peak JavaScript heap during export; this excludes Web Audio/native allocations and is not process RSS or a device memory guarantee. On the host, `navigator.hardwareConcurrency` reported 24 and `navigator.deviceMemory` 32; user agent was Electron 43.7.7 / Chromium 150.0.7871.250 on Windows 10/11 x64. These are one fixture/runtime, not a broad performance baseline.

At 360, 390, 430, 768 and 1280 CSS px, Arrangement, Sample Studio, Mastering and Export Studio had no horizontal page overflow. The browser context disabled `hasTouch`; `touchscreen.tap` confirmed that limitation, and the sandbox prevented creating a new touch-enabled context. These layout checks are emulation only, not physical-device or touch-gesture acceptance. The 12-track/3-minute and 24-track/5-minute performance workloads were not run; the current memory estimator reports 230.5 MiB and 341.6 MiB respectively for stereo 24-bit/44.1 kHz output and warns above its 192 MiB threshold. Initial load time, native audio memory, other browsers, GitHub Pages subpath deployment and remote Actions remain unmeasured.

### Phase 6 acceptance matrix

| Area | Result | Evidence / limitation |
|---|---|---|
| Eight-track production project and referenced media | **Functionally verified** | Deterministic Node archive test and Chromium project include WAV/MP3, simulated recording, processed sample, two Samplers, Drum Rack, patterns, effects, sidechain, mastering, metadata, artwork and preset. |
| Sample edit, sampler, piano roll and drum sequence | **Functionally verified** | Chromium editing/save/reuse, note insertion, pad trigger and step editing; microphone input was simulated, not hardware-recorded. |
| Mix, sidechain, mastering and playback | **Functionally verified for generated fixture** | Transport and track meters active; project preserved kick-to-bass sidechain; mastered export completed and decoded. No live acoustic loopback or universal live/offline null comparison. |
| 16/24/float WAV and 320 kbps MP3 | **Functionally verified** | Four browser exports decoded and reported matching loudness/peak; standard in-app inspectors plus Chromium decoding, not an external parser certification. |
| Clean `.EHS` restore, edit and second archive | **Functionally verified** | Main app project and media stores cleared; seven assets restored, edited project reopened, all audio hashes unchanged. |
| Corrupt import, cancel, New Project and autosave | **Functionally verified** | Corrupt ZIP rejected without replacing the active project; replacement cancellation preserved it; empty project retained sample library; reload restored project state. |
| Release ZIP | **Functionally verified** | WAV/MP3, metadata, release notes and cover present; format properties matched metadata. Not cross-player interoperability certification. |
| GitHub Actions | **Configuration inspected** | Workflow runs Node 22 `npm test` on push/PR; remote job not run because no push/PR was made. |
| GitHub Pages | **Not release validated** | Local static server returned HTTP 200 for entry point, CSS, JS, workers, AudioWorklets, LAMEJS and fflate. This is not a deployed Pages/subpath test. |
| Mobile layout | **Functionally verified by emulation** | Four primary views × five widths had no horizontal page overflow. |
| Physical touch, microphone and device output | **Not tested** | Browser context did not enable touch; no physical mobile device or microphone loopback was available. |
| Independent EBU/ITU validation | **Not tested** | No published reference audio files were present in the repository; current true-peak is explicitly an estimate. |
| Medium/large performance and compatibility matrix | **Not tested** | 12-track/3-minute, 24-track/5-minute and other browsers remain Batch 005/release work. |
- `tests/sidechain.test.js` (new)
- `tests/project-state.test.js`
- `src/export-dsp.js` (new)
- `src/export-worker.js` (new)
- `src/export.js` (new)
- `tests/export.test.js` (new)
- `vendor/lamejs/` (bundled encoder, upstream notice and LGPL-3.0 text)
- `vendor/fflate/` (ZIP module and MIT license)
- `src/portable-project.js`, `src/archive-worker.js`, `src/release-metadata.js`
- `tests/release-package.test.js`, `EHS_FORMAT_SPEC.md`, `src/style.css`
- `package.json`, `package-lock.json`
- `README.md`
- `IDEA.md`
- [BATCH_004C_REPORT.md](./BATCH_004C_REPORT.md)
- [BATCH_004_REPORT.md](./BATCH_004_REPORT.md) (new)
