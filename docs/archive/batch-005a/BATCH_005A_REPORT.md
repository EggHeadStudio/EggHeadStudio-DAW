# Batch 005A: Performance and memory optimization checkpoint

**BATCH 005A INCOMPLETE — CRITICAL PERFORMANCE ISSUES REMAIN**

This is a coherent, tested optimization checkpoint, not full production-performance acceptance. Batch 004's functionality is retained. No commit, push or deployment was performed. No dependencies were added, audio precision reduced, archive limits increased or `.EHS` format version changed.

## 1. Scope and environment

The focused audit covered archive validation/import/export, audio staging, waveform drawing, preview-voice cleanup, sidechain smoothing and selected scheduling/mastering/storage paths. It was not a complete audit of every application module.

Measurements used Windows x64, an Intel Core i7-12850HX (16 cores / 24 logical processors), VS Code 1.142.0 / Electron 43.7.7 / Chromium 150.0.7871.250, and local static HTTP. The browser reported 24 logical CPUs and `deviceMemory: 32`. Tests used portable Node.js 22.23.4. This is one desktop host, not mobile or cross-browser evidence.

The integrated browser reported `document.visibilityState === 'hidden'`, even after bringing its page forward. Timer throttling and shared-host contention limit end-to-end conclusions. Browser module caching also retained an earlier implementation during initial exploration; final controlled waveform checks disabled caching and confirmed the imported implementation. Those stale-module results are excluded.

## 2. Deterministic workloads

[tests/performance-fixture.js](../../../tests/performance-fixture.js) defines:

| Workload | Tracks | Program duration | Song-length stereo PCM |
|---|---:|---:|---:|
| Small | 4 | 30 s | 10,584,000 bytes |
| Medium | 12 | 180 s | 63,504,000 bytes |
| Large | 24 | 300 s | 105,840,000 bytes |

All sources use 44.1 kHz stereo float32 PCM. Each workload has four distinct synthetic assets: one song-length source and three one-second sources. Tracks repeat audio / Sampler / Sampler / Drum Rack groups, with arrangement clips, note patterns, EQ, delay and kick-to-bass external sidechain. Export mastering includes EQ, multiband dynamics, saturation, imaging and the lookahead limiter. Fixtures do not simulate the storage diversity of dozens of independent long recordings.

The final harness prepares source WAV files with the production encoding Worker and explicitly applies the project mastering chain before measuring live scheduling. Earlier scheduling measurements used the engine's default monitoring chain; they are not a controlled full-mastering live-performance comparison.

## 3. Bottlenecks and implemented changes

| Path | Finding | Implemented change |
|---|---|---|
| `.EHS` import | Synchronous ZIP expansion, CRC and validation blocked the page | Run preflight, unpacking, CRC/SHA and reference validation in a module Worker; pass an immutable Blob and return verified Blobs/metadata |
| Import cancellation | Validation/staging had no user cancellation | Cancel button, Worker termination, staging abort checks and an explicit non-cancellable final transaction boundary |
| Repeated audio IDs/imports | Identical media could be decoded repeatedly | Share immutable packaged Blobs; reuse decoded buffers by verified SHA within import and for matching local buffers known to have been decoded from those packaged bytes |
| Decode staging | Full asset copied immediately before decoding | Consume the staging ArrayBuffer directly |
| General waveform rendering | Every redraw rescanned source PCM | Reuse the existing WeakMap peak cache, lazily build only requested channels, combine full buckets with exact partial-edge scans |
| Sampler/pad audition | Preview sources/gain/pan were outside transport cleanup | Register preview nodes in the existing source registry for natural-end and stop cleanup |
| Sidechain compressor | Attack/release exponentials recalculated per sample | Compute both coefficients once per processing block; retain the same per-sample recurrence |

Worker failures are surfaced, not silently retried on the page. Browsers without Workers retain the existing fallback validator. Its synchronous unpacking remains blocking and cannot be cancelled mid-step.

### Remaining audited risks

- Arrangement playback still schedules the entire song up front, creating many nodes. Lookahead scheduling has not been implemented.
- Strong sample/library references have no bounded, reference-aware eviction strategy.
- Archive compression/decompression is still buffered. Moving work to a Worker is not streaming and does not establish lower total memory.
- Mastering multiband processing still has per-frame temporary arrays/coefficient work, and limiter interpolation has per-frame accessor allocation. These paths were not changed without broader audio-output oracles.
- Storage recovery still needs dedicated work: `restoreAssets()` suppresses decode failures; local autosave writes have no complete quota/interruption recovery policy. These are code-review findings, not executed device/quota-failure acceptance.
- Arrangement/Piano Roll virtualization, mobile lifecycle behavior and long-project interaction profiling remain open.

## 4. Controlled before/after measurements

### Archive validation/import responsiveness

Both paths opened the same large fixture archive, sequentially in one page: **106,907,690 bytes**, **106,993,334 bytes of manifest payload**, four distinct assets. Baseline means the retained main-thread validator; optimized means the Worker validator. This measures archive opening, not application audio decoding and final project commit.

| Metric | Baseline | Worker | Improvement |
|---|---:|---:|---:|
| Open/verify time | 5,990.8 ms | 6,512.7 ms | **-8.71%** (slower) |
| Worst 10 ms heartbeat delay | 5,347.1 ms | 14.9 ms | **99.72% less blocking** |
| Sampled page JS heap peak | 338,100,621 bytes | 338,134,948 bytes | No reduction demonstrated |

Worker startup/message overhead trades some total time for page responsiveness. Page JS heap excludes Worker heap, native Web Audio buffers and process RSS. Sequential measurements can retain earlier objects. No total-memory reduction or near-limit safety claim follows from this table. Source-asset packaging was subsequently moved into the encoding Worker; optional manifest fields/ZIP size may differ slightly when reproducing with the final harness.

### Exact waveform drawing

Same 1000 x 180 CSS-pixel canvas, channel-zero PCM and `willReadFrequently` context; six draws per implementation. The first draw is cold, and the reported warm statistic is the median of the remaining five. Baseline is the previous exact PCM scan reproduced in the benchmark, not an approximate thumbnail.

| Source | Baseline cold | Cached cold | Baseline warm median | Cached warm median | Warm improvement | Differing pixel bytes |
|---|---:|---:|---:|---:|---:|---:|
| 30 s | 25.0 ms | 16.5 ms | 10.5 ms | 1.7 ms | 83.81% | 0 |
| 180 s | 67.4 ms | 38.9 ms | 55.6 ms | 2.2 ms | 96.04% | 0 |
| 300 s | 79.7 ms | 63.9 ms | 78.0 ms | 2.6 ms | 96.67% | 0 |

Raw baseline / cached draw times, in milliseconds:

- Small: `[25,13.6,12.2,10.5,9,10.1]` / `[16.5,5.4,2.2,1.7,1.7,1.5]`.
- Medium: `[67.4,55.6,180.4,189,51.4,47.9]` / `[38.9,4.5,3.9,2.2,2,1.9]`.
- Large: `[79.7,75.5,78,77.2,78.9,89.8]` / `[63.9,2.1,2.7,2.6,3.7,2.1]`.

The cache adds two float32 extrema per 256 source frames for each requested channel: approximately 0.78% of that channel's PCM size, or 0.39% of total stereo PCM when only channel zero is cached. It does not duplicate PCM. Cache keys are weak, but releasing an unused buffer still depends on other application references. Cold construction still scans the requested channel and can block.

### Sidechain CPU microbenchmark

[tests/benchmark-sidechain.js](../../../tests/benchmark-sidechain.js) processes 30 seconds of stereo 48 kHz audio six times. Both versions ended with checksum **7.017781529575586**.

| Metric | Baseline | Optimized | Interpretation |
|---|---:|---:|---|
| Last-five-run median | 466.8228 ms | 445.0291 ms | Observed 4.67% reduction; inconclusive under JIT/shared-host variability |

Raw times: baseline `[577.5157,552.4809,466.8228,503.0687,397.9314,373.0126]`; optimized `[519.4891,503.5305,407.4657,445.0291,480.2095,403.3803]`. The stronger result is the regression proof that smoothing is sample-exact and exponential evaluation is per block, not a hardware-independent speed promise.

## 5. End-to-end benchmark observations

The small fixture rendered **1,370,775 frames / 31.083333 seconds**, including effect tails. The following runs are observations, not a controlled causal speedup claim: source-file preparation and browser-cache conditions evolved during harness stabilization.

| Small workload metric | Initial baseline | Cache-disabled optimized observation |
|---|---:|---:|
| Synthetic PCM preparation | 170.0 ms | 297.7 ms |
| Archive creation | 326.4 ms | 350.5 ms |
| Archive opening | 1,077.3 ms | 935.3 ms |
| Offline full-chain render | 15,081.9 ms | 11,171.8 ms |
| 24-bit WAV encoding | 1,907.0 ms | 1,459.2 ms |
| Sampled page JS heap peak | 46,503,643 bytes | 47,353,787 bytes |
| Sample peak | 0.06040988117456436 | 0.06041036546230316 |

The initial small archive was **11,646,456 bytes**, carrying **11,642,576 audio bytes**. Initial scheduling created 183 sources. No page/native/Worker memory improvement is established by these heap observations.

The optimized render's two channel SHA-256 values were `b30e77e6c4391ce5d606c00fe0c6e7b5661897b6346723d161fed0820ded926b`. The baseline PCM was not retained. Aggregate weighted checksums differed (-4.360514452306802 versus -5.917187797663125); therefore **whole-chain bit identity and sample-aligned error are not established**. The absolute peak difference is about 0.0000004843, but peak agreement alone is not an audio-equivalence test.

### Medium/large completion limits

- Medium and large waveform comparisons completed, as did the approximately 102 MiB large-archive validator comparison.
- The final 24-track/5-minute **non-export** run completed: PCM preparation 4,754.0 ms; archive creation 4,565.2 ms; archive opening 8,695.9 ms; archive 106,907,665 bytes; restored audio 106,898,576 bytes; audio initialization 187.5 ms; playback scheduling **2,624.9 ms / 10,980 sources**. Sampled page JS heap peaked at 218,838,841 bytes; worst heartbeat delay was 1,166.9 ms and the longest observed task was 5,261 ms. This confirms substantial preparation/scheduling blocking remains. Playback was stopped immediately after scheduling, so sustained stability is not verified.
- The final 12-track/3-minute **non-export** run also completed: PCM preparation 3,203.0 ms; archive creation 2,816.7 ms; archive opening 5,482.9 ms; archive 64,568,428 bytes; restored audio 64,562,576 bytes; audio initialization 212.7 ms; playback scheduling **858.0 ms / 3,294 sources**. Sampled page JS heap peaked at 134,125,924 bytes; the longest observed task was 3,545 ms. The timer heartbeat reported 10,994.9 ms, which is not an exact CPU-stall measurement in this hidden-page environment.
- Several earlier long runs were cancelled while diagnosing stale modules and hidden-page main-thread fixture-encoding timers; they are excluded from performance-success claims.
- After switching fixture asset encoding to a Worker, the medium full-chain attempt still remained at `render` when stopped by reloading the page at **315,473.6 ms since page navigation**. This is not a measured completed render duration or an exact render-stage timeout.
- A complete medium export baseline, large full-chain export, sustained playback stability and native memory bounds are **not verified**. No OOM was proven; do not describe the interrupted attempt as a confirmed browser memory-limit failure.
- A warm local reload reported DOMContentLoaded at 247.5 ms. Cold startup, network-load performance and physical-device latency were not measured.

The next step is a foreground standalone-browser profile with a retained deterministic PCM reference, per-stage timestamps, CPU/allocation capture and page/Worker/native memory accounting. Isolate offline Worklet/DSP cost before changing scheduling or mastering algorithms.

## 6. Audio-quality and compatibility evidence

The full Node suite passes **119/119**, retaining all 110 existing tests and adding nine regressions in [tests/performance.test.js](../../../tests/performance.test.js):

1. Exact cached range extrema, edge buckets, over-full-scale data, empty ranges and cache identity.
2. Lazy requested-channel construction.
3. Preview source/gain/pan disconnection on natural end and transport stop.
4. Sample-exact sidechain output against the previous recurrence at 1 / 44,100 / 48,000 / 96,000 Hz, including settings changes and detector filtering.
5. Per-block rather than per-sample exponential evaluation.
6. Pre-aborted and mid-validation fallback cancellation.
7. Deduplicated audio IDs sharing one immutable Blob.
8. Worker immutable input, progress, success, abort and error cleanup.
9. All three fixture durations/track counts, sidechain references and limiter configuration.

Chromium exercised the real application's import handler with generated File objects:

- Two asset IDs with identical audio caused **one decode**; reopening the same archive caused **zero additional decodes**.
- Cancellation UI appeared, replacement actions were disabled, and cancellation preserved the active serialized project exactly.
- A corrupt archive showed `Invalid ZIP archive: end record not found`; the active serialized project remained exactly unchanged.
- Real Worker archive opening and the controlled waveform comparisons completed.

These are scripted desktop-browser tests, not physical file-picker, microphone, mobile-touch or deployed-site acceptance. Existing Node DSP/export/metadata/archive tests passed, but the entire Batch 004 browser production/export matrix was not repeated for this checkpoint. No new formal LUFS/LRA/true-peak certification is claimed.

`.EHS` remains version 1. ZIP paths, CRC/SHA verification, manifest references, missing assets and size limits retain existing validation. Audio is staged before the IndexedDB asset transaction and project replacement; cancellation is disabled at that commit boundary. Limits remain 256 MiB compressed / 512 MiB expanded / 4,096 entries with the existing ratio, JSON and artwork bounds. A new complete clean-context production-project round trip was not repeated here; existing automated archive regressions passed.

Cross-import decoded-buffer reuse requires both a matching stored-file SHA and recorded decode provenance. A freshly edited in-memory buffer can have more precision than its saved WAV; it is not assumed equivalent merely because its asset ID points to the same file. Such untracked buffers are decoded once from the package before entering the reuse cache.

## 7. Memory, safety and unresolved acceptance

| Area | Checkpoint outcome | Remaining acceptance |
|---|---|---|
| Page responsiveness during archive verification | Measured substantial improvement | Foreground/mobile and near-limit profiles |
| Duplicate decoding/Blobs | Verified reuse | Bounded cache, library/project reference tracking and eviction |
| ZIP memory | Still buffered; limits unchanged | Streaming/chunked input/output and safe peak-memory accounting |
| Audio/voice lifecycle | Preview cleanup regression passes | Long playback, rapid editing, suspension/resume and voice-count stress |
| Scheduling/UI | Not redesigned | Lookahead scheduling, virtualization, interaction and timing baselines |
| Exports | Small full-chain render/encode completed | Controlled sample-aligned full-chain comparison, medium/large WAV/MP3 and Release ZIP performance |
| Persistence/recovery | Pre-commit cancel/corrupt-import safety verified | Quota, blocked storage, interruption, autosave recovery and actionable restore errors |
| Mobile | No new physical-device evidence | iOS/Android memory, touch, background lifecycle and latency |

No sample-rate or bit-depth degradation was introduced. No shared sample library was cleared to make tests pass. Benchmark fixtures use synthetic local assets. Memory thresholds were not raised. Near-limit archive processing remains a production risk rather than a claimed safe capacity.

## 8. Reproduction

1. Run `npm test` with Node.js 22, or use the portable Node executable with `--test tests/*.test.js`.
2. Run `node tests/benchmark-sidechain.js` for the CPU fixture. Repeat without other workloads before drawing timing conclusions.
3. Serve the repository statically over localhost or HTTPS. Do not open it using `file:`.
4. In a separate test-browser profile, disable cache and import `./tests/performance-fixture.js` from the application origin:

   ```js
   const benchmark = await import('./tests/performance-fixture.js');
   benchmark.compareWaveformDrawing('small');
   benchmark.compareWaveformDrawing('medium');
   benchmark.compareWaveformDrawing('large');
   await benchmark.compareArchiveImport('large');
   await benchmark.runPerformanceBenchmark('small', { exportAudio: true });
   ```

5. Run medium and large full exports separately while profiling. Do not overlap workloads. Inspect `globalThis.performanceBenchmarkStatus` for the current stage. The harness stops scheduled sources and closes its real-time context when it completes/fails; an in-progress offline render still requires page teardown to interrupt.
6. For import safety, open a project, import a valid archive, cancel during validation/staging and compare its stored project JSON. Repeat with a corrupt ZIP. Test fixtures can populate the test profile's local project; do not clear a user's shared library.

Syntax checks passed for all six modified production JavaScript modules and three added test/benchmark modules. `git diff --check` passed. The existing GitHub Actions workflow still runs `npm test` on Node 22; remote CI and GitHub Pages deployment were not executed. Worker/module URLs remain relative via `import.meta.url`; no runtime localhost API or external service was added.

## 9. Changed files and next steps

- [src/portable-project.js](../../../src/portable-project.js), [src/archive-worker.js](../../../src/archive-worker.js): background validation, cancellation and Blob reuse.
- [src/app.js](../../../src/app.js): import UI/staging cancellation and decode reuse.
- [src/audio.js](../../../src/audio.js), [src/waveform.js](../../../src/waveform.js): cached exact waveform ranges and preview cleanup.
- [src/sidechain-processor.js](../../../src/sidechain-processor.js): block-rate coefficient calculation.
- [tests/performance.test.js](../../../tests/performance.test.js), [tests/performance-fixture.js](../../../tests/performance-fixture.js), [tests/benchmark-sidechain.js](../../../tests/benchmark-sidechain.js): regression and reproducible benchmark coverage.
- [README.md](../../../README.md), [IDEA.md](../../../IDEA.md), [EHS_FORMAT_SPEC.md](../../../EHS_FORMAT_SPEC.md), this report: current status, evidence, architecture and limitations.

Finish 005A before declaring readiness for 005B: establish valid completed medium/large profiles, implement a bounded archive/cache memory strategy, improve scheduling and recovery, then re-run audio/format and full-workflow regressions. Recommended 005B priorities remain physical iOS/Android touch/audio, browser compatibility, latency and synchronization, background/resume behavior, accessibility and responsive workflow usability. Preserve the long-term roadmap and separate deployment/independent audio-standard release gates.
