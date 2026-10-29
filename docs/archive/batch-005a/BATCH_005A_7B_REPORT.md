# Batch 005A.7B - Reliability Closure Checkpoint

**BATCH 005A.7 INCOMPLETE - SPECIFIC BLOCKERS REMAIN**

**Batch 005A.7-UX is complete for the tested Chromium scope.** Do not treat this as approval to begin the 005B redesign: long-export performance/validation remains open.

No commit, push or deployment was performed. No music-production feature, Session View, backend, dependency or schema migration was added.

## 1. Implemented reliability changes

- **ZIP output:** `src/archive-zip.js` uses fflate's incremental writer, feeding at most 1 MiB per push and returning Blob parts rather than one contiguous ZIP output buffer. Workers and the no-Worker path share this writer. Output limits are enforced as chunks arrive. Input payloads, hashing and import extraction remain buffered: this is NOT end-to-end streaming.
- **Archive integrity/memory:** preserve stored lossless media, content deduplication, CRC/SHA-256 and format v1. Validate ZIP data descriptors against central records. Reject known oversized stored media before reading/encoding and enforce existing JSON limits on export. No limit was increased. Worker errors and injected allocation failures propagate; cancellation never returns a partial successful archive.
- **Export workflow:** Cancel project export terminates the Worker; the fallback checks cancellation between chunks. Metadata is snapshotted before asynchronous packaging. Export of an older snapshot does not mark newer changes backed up. JSON/.EHS recovery remains possible when local metadata storage is full.
- **Persistence:** autosave errors have an explicit notification and status instead of only an uncaught storage exception. The previous stored snapshot survives a failed write; edits remain in memory. Corrupt recovered text is copied to `pulse-project-recovery-<timestamp>` before a later edit may replace it. If that backup cannot be stored, replacement is refused.
- **Import replacement:** persist incoming metadata before swapping the active in-memory project. Metadata quota failure leaves the active project and previous metadata intact; verified assets may remain cached. IndexedDB and localStorage are not a cross-storage transaction: process-kill crash atomicity is not claimed.
- **Processor faults:** live track/master Worklet failure stops voices, disposes failed graphs, and reports the failure. Retry Play rebuilds the graph. An actual offline Worklet exception rejects rendering rather than delivering silent/partial successful audio. Offline graphs are disconnected after rendering or processor rejection.
- **Measured DSP hot path:** multiband smoothing exponentials are computed six times per block, rather than six times per sample; remove temporary fourth-order filter arrays allocated per sample. Reference PCM hashes remain identical at 44.1/48/96 kHz across attack/release, knee, solo and bypass changes. This does not claim whole-project cross-browser bit identity.
- **UX regression:** maintained instrument workflow script uses dynamic pads and current editor selectors. Velocity accessible names now update while dragging, matching their heights and titles.

## 2. Automated validation

Full Node suite: **253 passed / 0 failed / 0 skipped**, preserving all 241 baseline tests.

Twelve added tests cover chunked ZIP losslessness, cancellation and output budgets, v1 checksums/descriptors, injected read/Worker allocation errors, oversize preflight, autosave quota/corrupt backup, processor disposal and exact multiband reference hashes/coefficient counts.

JavaScript syntax checks passed for all **80** source/test `.js` and `.mjs` files. `git diff --check` passes (Windows line-ending notices are not whitespace errors). **107** text files were checked for strict UTF-8 so the earlier Pages Markdown encoding failure is not repeated. These are local results; CI/deployment was not triggered.

## 3. Recording Studio browser acceptance

Integrated Chromium/Electron on disposable localhost origins. `tests/recording-browser-acceptance.js` installs a Web Audio synthetic microphone and injects faults; actual Recording Studio controls start/stop/punch/retry/calibrate. This is not a real microphone, permission-prompt test or hardware-latency measurement.

| Workflow | Executed result |
|---|---|
| Count-in / pre-roll | Observed REQUESTING -> COUNT-IN -> PRE-ROLL -> RECORDING -> SAVING -> IDLE. At 120 BPM, count-in = 2 seconds and pre-roll = 96,000 frames at 48 kHz. |
| Punch In / Out | Beats 4-6 captured exactly 48,000 frames (1 second). Backing starts at beat 0 with one-bar pre-roll. |
| Placement / offset | Placement matches the timing model; an added +50 ms offset moves the clip earlier. Measured placement formula error = 0 seconds in the maintained fixture. Browser compensation is not independently measured input latency. |
| Loopback | Synthetic output route with a 75 ms DelayNode measured 95.6667 ms, correlation 1. The extra MediaStream bridge is included; do not interpret this as a 20.7 ms real microphone latency. |
| Permission denial | Injected NotAllowedError produced the explicit microphone-permission message and returned to idle. No real permission prompt was denied. |
| Save failure / retry | Injected IndexedDB Blob-write quota error retained pending PCM/WAV. Retry succeeded after removing the fault; no duplicate take was inserted. |
| WAV recovery | Downloaded buffered float WAV decoded to exactly 48,000 frames, RMS 0.141403. |
| Suspension interruption | Real AudioContext.suspend triggered buffered recovery; 16,384 frames survived. Final partial Worklet chunk may be missing, as the UI warns. All microphone tracks ended. |
| Background interruption | Opening another integrated browser tab made the recording page genuinely hidden. Recording returned to idle, saved 269,728 frames in that run, and all microphone tracks ended. This is distinct from merely dispatching visibilitychange. |
| Multiple takes | Repeated recording/retry/punch operations preserved alternate and split clips. The restored/exported project contained five recording clips referencing four audio assets. |

`tests/audio-fault-browser.js` additionally loaded a deliberately throwing AudioWorklet processor. Live failure was reported and stopped voices; retry rebuilt an audible graph (track peak 0.141421). Offline failure rejected export. Suspension kept the audio-clock position frozen; resumption, a 400 ms scheduler gap and a seek recovered without duplicate voices. Sources after Stop: 0. This is bounded fault injection, not a claim that arbitrary background throttling is gapless.

## 4. Recorded project portability and audio

An actual Save .EHS / Open .EHS workflow restored the recorded project into another fresh origin: no local project and zero IndexedDB asset records existed beforehand. All track JSON, recording metadata, clip positions and assets matched. Container version remained 1.

- Clean-origin WAV versus original WAV: 366,031 frames at 44.1 kHz; maximum absolute left-channel difference **2.384185791015625e-7** (two 24-bit PCM LSBs), consistent with TPDF dither. Not a sample-identical claim.
- Final changed-code archive export/reopen: **569,517 bytes**, v1, four verified audio assets, five recording clips.
- Final actual Export Studio WAV: **2,196,280 bytes**, stereo 44.1 kHz, 366,031 frames, RMS **0.0432312901**, peak **0.244493604**.
- Final actual Export Studio MP3: **333,396 bytes**, stereo 44.1 kHz, 367,488 decoded frames, RMS **0.0431479030**, peak **0.245330811**. Encoder delay/padding remains; it is not gapless.

Both exports contained the synthetic recorded tone; neither was silent or clipped. This verifies the synthetic fixture, not arbitrary recordings or independent mastering-standard compliance.

## 5. Storage and archive browser faults

`tests/storage-fault-browser.js` passed on a fresh origin:

- Corrupt project recovery left original raw text intact and backed it up before editing.
- Metadata quota failure visibly marked Local save failed; previous metadata was unchanged.
- JSON and .EHS export retained the unsaved in-memory name under that quota fault.
- Export cancellation downloaded no archive. Import cancellation and corrupt ZIP rejection kept the active project unchanged.
- Import metadata quota failure did not swap the active project or saved snapshot.
- Removing the injected fault allowed autosave and reload recovery.

Injected allocation failures and oversized-file rejection are also Node-tested. **Native OS/browser out-of-memory termination and process-kill during autosave/import were not induced.** Normal localStorage replacement is one synchronous operation; no multi-step asynchronous autosave was introduced.

## 6. Five-width UX acceptance

At **360, 390, 430, 768 and 1280 px**, synthetic CDP touch executed pad selection/preview, Add Pad, step activation, referenced removal Cancel/Delete and correct row counts. No page-level horizontal overflow.

At the same widths, velocity touch alternated persisted values **0.25 / 0.75**. At 2.5x time zoom, Piano Roll and velocity max-scroll positions matched exactly: **1358 / 1328 / 1288 / 950 / 456 px**. The earlier alignment/Undo/Redo and shared-velocity playback tests remain preserved. The maintained workflow script also passed sample assignment, pattern editing, effect changes and reload.

No physical device or Firefox/WebKit acceptance was executed. Edge below is another Chromium version, not independent engine coverage.

## 7. Reproducible performance workloads

Fixture: `tests/performance-fixture.js`; runner: `tests/run-performance-browser.mjs`. Four generated stereo assets, audio/Sampler/Drum Rack tracks, EQ/delay, external sidechain and enabled mastering multiband/limiter; 44.1 kHz, 120 BPM.

Windows headless Edge **156.0.0.0**, reports 24 hardware threads / 32 GiB deviceMemory, visible page, autoplay enabled and background throttling disabled. This is a shared development machine, not a controlled phone benchmark. Single-run wall times are noisy. Fixture generation is separate from loading JSON and decoding packaged audio.

| Workload | Fixture generation | JSON load | Audio restore/decode | Playback prep | .EHS export / import | Offline render / WAV encode |
|---|---:|---:|---:|---:|---:|---:|
| 4 tracks / 30 s, post-DSP change | 284.8 ms | 0.2 ms | 185.1 ms | 11.7 ms | 304.6 / 827.7 ms | 12,522.4 / 1,041.4 ms |
| 12 tracks / 180 s, pre-DSP change | 1,869.9 ms | 1.5 ms | 1,489.9 ms | 36.3 ms | 1,275.4 / 3,958.9 ms | **588,439.8** / 5,243.2 ms |
| 24 tracks / 300 s, post-DSP change, no-render run | 3,016.9 ms | 1.3 ms | 2,534.7 ms | 73.9 ms | 2,140.2 / 8,630.5 ms | Not completed |

The post-change 12-track workload **exceeded the runner's 180-second total deadline**, so it did not produce a completed export measurement. The first 24-track export attempt was stopped without a result; the complete large loading/archive/playback run explicitly used `no-render`. Do not interpret that run as a successful five-minute export.

| Workload | Archive bytes | Sampled JS heap peak | Max heartbeat delay / longest long task | Scheduler max incl. initial fill | Initial sources / after Stop | Counted node-factory calls |
|---|---:|---:|---:|---:|---:|---:|
| Small post-change | 11,646,568 | 45,295,537 bytes | 339.5 / 372 ms | 1.7 ms | 4 / 0 | 88 |
| Medium pre-change | 64,568,539 | 266,386,496 bytes | 1,169.9 / 2,103 ms | 4.1 ms | 12 / 0 | 257 |
| Large no-render | 106,908,351 | 323,271,190 bytes | 652.8 / 3,753 ms | 11.2 ms | 24 / 0 | 506 |

Scheduler observation was one second per run, not the entire song. Factory counts include tracked createGain/createBufferSource/etc. calls after audio init; they are **not full native live-node counts** and exclude Worklets/mastering nodes created before instrumentation. JS heap sampling excludes native AudioBuffer/Worker/Blob memory. Long tasks include fixture/setup work, not only archive operations. No native-memory ceiling or sustained-mobile playback guarantee is claimed.

The DSP microbenchmark (10,000 stereo 128-frame blocks, Node 22.23.4) measured baseline `[6989.94, 9385.91, 6999.32, 7202.67]` ms and optimized `[5436.78, 5906.63, 6975.86, 5534.76]` ms. Exact reference hashes and operation-count tests justify the optimization; these noisy shared-machine times do not establish end-to-end export speedup. The medium deadline failure shows that this small optimization did NOT close the long-export problem.

Reproduce with a disposable headless browser exposing port 9228 and the static server on 8767:

```text
node tests/run-performance-browser.mjs 9228 http://localhost:8767 small,medium
node tests/run-performance-browser.mjs 9228 http://localhost:8767 large no-render
```

Default runner workloads are small, medium and large with audio export; each workload has a 180-second deadline. Timeout navigates the disposable benchmark page away instead of leaving an indefinite render running.

## 8. Changed files

- Production: `src/app.js`, `src/audio.js`, `src/mastering.js`, `src/mastering-dsp.js`, `src/portable-project.js`, `src/archive-worker.js`, `src/sampler-ui.js`; new `src/archive-zip.js`, `src/project-storage.js`.
- Node tests: new `tests/archive-chunks.test.js`, `tests/project-storage.test.js`, `tests/processor-recovery.test.js`, `tests/multiband-performance.test.js`.
- Browser/benchmark fixtures: updated `tests/instrument-workflow-ui.js`, `tests/performance-fixture.js`; new `tests/recording-browser-acceptance.js`, `tests/storage-fault-browser.js`, `tests/audio-fault-browser.js`, `tests/run-performance-browser.mjs`.
- Docs: `README.md`, `IDEA.md`, `EHS_FORMAT_SPEC.md`, [BATCH_005A_7_REPORT.md](./BATCH_005A_7_REPORT.md), [BATCH_005A_7_UX_REPORT.md](./BATCH_005A_7_UX_REPORT.md), this report.

## 9. Specific remaining blockers

1. **Long offline export performance and full large-workload output validation.** Profile the medium/large render under controlled load, identify the remaining bottleneck, and complete decoded WAV/MP3 and audio-integrity checks for the five-minute workload. Current timings are not acceptable evidence of reliability closure.
2. **Native memory and crash/relaunch acceptance.** JS heap figures cannot establish total memory safety. Injected allocation/quota failures are covered, but actual renderer termination, interrupted commit/relaunch and device memory pressure remain unverified. Keep buffered-import limitations explicit.
3. **Extended scheduler/voice stress.** Bounded suspension, gap, loop and seek tests passed; prolonged background throttling with dense instrument clips and repeated processor recovery needs longer acceptance. Gaps beyond the lookahead are not eliminated.

Physical microphone latency, iOS/Android touch, Bluetooth and Firefox/WebKit may remain explicit 005B device/engine gates; they were not tested here.

## 10. Concise technical handoff for 005B

- First finish the blockers above; **not ready for 005B reliability sign-off**.
- Preserve `AudioEngine` live/offline routing, `instrument-playback.js` event interpretation, 25 ms / 150 ms scheduler, and DSP processor interfaces. UI redesign must not duplicate velocity or pattern data.
- Keep independent clip/pattern IDs, stable pad IDs/note mappings, recording metadata and schema-2 instrument feature markers inside the v1 container.
- Reuse modular Sampler/Drum Rack/Arrangement/Recording components and device graph APIs for future transport/device/knob/mixer work. No new UI architecture was started here.
- Use the maintained browser fixtures as regression evidence, not screenshots or Node serialization alone. Do not remove archive error visibility, recovery exports or processor-failure rejection during redesign.
