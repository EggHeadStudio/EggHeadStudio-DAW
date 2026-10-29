# Batch 005A.7C - Offline Rendering and Reliability Closure

**BATCH 005A.7 COMPLETE - READY FOR BATCH 005B**

This is closure for the tested desktop Chromium scope, not universal hardware, mobile, cross-engine or mastering-standard certification. The 005B redesign was not started. No commit, push or deployment was performed.

## 1. Problem and reproduction environment

7B reported a 588.44-second medium render, a subsequent 180-second whole-workload timeout, and no completed large export. A runner timeout was not evidence that rendering itself consumed the entire deadline.

The new runner reports fixture, graph/module loading, context rendering, analysis, encoding and decoding stages independently. Its default 900-second **whole-workload** deadline reports the active stage and is separate from native rendering failure. The original 180-second runner remains usable for archive/playback-only checks.

Measured on Windows, headless Microsoft Edge **156.0.4314.50**, Chromium 156, an isolated disposable profile, 24 reported hardware threads and 32 GiB reported device memory. Background timer/render throttling was disabled for the controlled benchmark. Workloads ran sequentially, not concurrently with another export. This remains a shared workstation, not a dedicated laboratory.

Fixtures retain 44.1 kHz stereo, deterministic audio, Sampler/Drum Rack patterns, track EQ/delay, an external ghost sidechain, native master EQ/compressor, mastering EQ, 4x saturation, imager, three-band compression and linked true-peak limiter. Nothing is automatically disabled or downsampled.

## 2. Profiling evidence and root cause

### Controlled before/after context timings

| Workload | Before context render | After context render | After render API including graph/trim | Context render / program duration |
|---|---:|---:|---:|---:|
| 4 tracks / 30 s | 11,461.4 ms | 7,381.3 ms | 7,448.4 ms | 0.246 |
| 12 tracks / 180 s | 546,248.3 ms | 66,181.4 ms | 66,346.5 ms | 0.368 |
| 24 tracks / 300 s | Not completed in 7B; not rerun unbounded | 192,697.0 ms | 193,116.7 ms | 0.642 |

The controlled medium baseline spent **791 ms constructing the graph** (46.6 ms loading Worklet modules), then **546,248.3 ms in startRendering**. Its render API total was 547,191.6 ms; its entire reference-capture workload was 550,000.9 ms. Thus native rendering, not decoding/encoding or a deadline, reproduced the critical problem.

The old path attached all future voices and their gain/panner branches before rendering: **3,294 source nodes** for medium, versus 183 for small. Future/finished source branches made graph traversal scale with the whole song rather than the current playback interval. Retaining and traversing these branches was the demonstrated architectural bottleneck; it was not solved by another per-sample mathematical approximation.

An intermediate four-second scheduling window reduced medium context rendering to **76,519.3 ms**, retaining at most 90 source handles. A one-second window measured **70,062.7 ms** before the independent stereo correction, retaining at most 36. The final corrected-stereo run measured 66,181.4 ms. Do not attribute all run-to-run variation or the stereo change to the window-size adjustment.

### Baseline small A/B probes

| Probe | Context rendering |
|---|---:|
| Full original chain | 11,461.4 ms |
| Multiband disabled in test processor settings | 9,111.3 ms |
| Limiter replaced in the test harness by its equivalent native delay | 8,185.8 ms |
| Mastering bypassed | 4,479.1 ms |
| External sidechain effect removed | 9,570.9 ms |
| Saturation mix disabled | 10,692.0 ms |

These are isolation probes, not production optimizations or additive stage costs. Disabling a mix does not necessarily remove all native branch work.

### Isolated native stages, identical 30-second stereo input

| Stage | Context render |
|---|---:|
| Native buffer-source passthrough | 47.3 ms |
| Mastering EQ filters | 652.5 ms |
| Native 4x-oversampled saturation shaper | 918.0 ms |
| Mid/side imager | 329.1 ms |
| Multiband AudioWorklet | 1,239.7 ms |
| Lookahead true-peak limiter AudioWorklet | 2,283.6 ms |
| External sidechain AudioWorklet | 619.8 ms |

The shaper probe measures its wet DSP, not the complete wet/dry blend. Isolated graphs differ from the combined signal topology; their timings must not be added as an exact whole-song prediction.

`tests/profile-dsp.mjs` also measures the shared algorithms directly in Node, without per-sample logging. The initial 30-second stereo runs measured limiter 673.5-991.6 ms, multiband 756.1-875.0 ms, sidechain 251.5-325.0 ms; standalone true-peak analysis took 1,629.5 ms and loudness including true peak 1,784.9 ms. A later repeat measured limiter 1,149.1-1,386.3 ms, multiband 1,111.6-1,158.4 ms, sidechain 305.0-379.6 ms, true peak 2,224.3 ms and combined analysis 3,413.5 ms, illustrating shared-machine variation rather than a code change. Stereo 44.1 -> 48 kHz resampling took **753.6 ms**, producing 1,440,000 frames per channel with the unchanged 32-tap algorithm. These are CPU probes, not browser-export timings.

Corrected event-generation probes use the fixture's actual 16-beat pattern cycle: small **180 events / 0.4 ms**, medium **3,240 / 2.9 ms**, large **10,800 / 3.1 ms**. Render-duration estimation took 2.8/3.2/7.1 ms. An early diagnostic counter used the helper's implicit 64-beat default; it was corrected. That counter never controlled the actual scheduler or PCM.

## 3. Implementation and architecture

- `src/offline-scheduler.js` schedules approximately one second of future sources at a time, quantized down to 128-frame boundaries. At 44.1 kHz each normal window is 44,032 frames.
- **One OfflineAudioContext renders the entire song.** Its track graphs, sidechain sends, filters, reverbs/delays, multiband envelopes and limiter ring remain continuous. This is bounded source scheduling, not independent chunked audio rendering, output streaming, or restarted mastering.
- Ended source/gain/panner branches are disconnected at suspension boundaries. Audio clips/long voices crossing a boundary continue; they are not retriggered. The same instrument-event and voice-scheduling helpers are used.
- Render metadata/master settings and the buffer-reference map are captured before asynchronous processing. PCM is referenced, not cloned per window. Editing or clearing the live map afterward cannot change the ongoing export.
- Export Studio and Release ZIP rendering receive the AbortSignal and progress. Cancellation stops new music scheduling at the next boundary, retires/disconnects the graph, and drains the native context as silence. OfflineAudioContext has no close method; leaving it suspended was rejected as a cleanup strategy. This final drain still uses the already allocated native output buffer; it is not rendering the remaining music.
- Track/master Worklets accept a disposal message and return false on their next process call. Main-thread handlers are cleared and ports closed. Native processor failures still reject export and remain visible.
- A graph-construction/render failure also enters cleanup. If native draining itself fails, both errors are surfaced rather than silently accepting output.
- Existing duration limits, sample rates, oversampling, bit depths, dither options, native DSP, limiter interpolation and LUFS algorithms are unchanged. The live scheduler remains 25 ms / 150 ms.
- The existing limiter-latency trim still needs a second full output buffer briefly. Workers/analysis/encoding still copy transferable channels. No claim is made that export is constant-memory.

### Separate audio-integrity repair

Actual stereo tests found that the previous imager connected the **same positive side sum to both output channels**. At width 1 it duplicated the reconstructed left signal into the right output. The right branch now receives the negative side sum.

This is an intentional correction to previously wrong audio, not an optimization tolerance or an automatic preset change. Saved settings/archives do not change; old stereo projects may sound different from the broken renderer.

## 4. Full export measurements

| Stage | Small | Medium | Large |
|---|---:|---:|---:|
| Fixture PCM creation | 228.4 ms | 1,443.3 ms | 2,653.3 ms |
| Initial graph, including modules/first window | 51.9 ms | 81.6 ms | 157.9 ms |
| Module loading (included above) | 36.1 ms | 39.0 ms | 52.3 ms |
| Render API total | 7,448.4 ms | 66,346.5 ms | 193,116.7 ms |
| Worker loudness/true-peak/stereo analysis | 1,556.4 ms | 8,647.7 ms | 15,138.1 ms |
| 24-bit WAV encode, no dither | 1,087.0 ms | 5,392.5 ms | 9,846.3 ms |
| Independent WAV decode | 187.4 ms | 1,240.1 ms | 3,204.0 ms |
| 320 kbps MP3 encode | 6,317.1 ms | 28,822.9 ms | 48,552.5 ms |
| Independent MP3 decode | 254.7 ms | 1,334.9 ms | 2,339.3 ms |
| Entire dual-format verification workload | **17,378.1 ms** | **114,681.1 ms** | **277,435.6 ms** |

The last row includes fixture preparation, hashes, analysis, both sequential encodes, decode/statistical scans and waits. It is an actual benchmark total, not a timer for a single UI export button. No resampling is needed when source/output are both 44.1 kHz; that production fast path is unchanged. The native-stage and Node probes isolate the other DSP costs.

### Loading, playback and archive packaging (separate no-render run)

| Metric | Small | Medium | Large |
|---|---:|---:|---:|
| JSON parse/stringify load | 0.2 ms | 0.8 ms | 1.2 ms |
| Decode restored assets | 202.8 ms | 1,114.6 ms | 2,057.1 ms |
| AudioContext initialization | 187.7 ms | 208.3 ms | 205.3 ms |
| Playback preparation | 20.7 ms | 32.6 ms | 48.3 ms |
| Maximum observed scheduler call, including initial fill | 3.2 ms | 3.0 ms | 4.4 ms |
| .EHS packaging | 308.7 ms | 1,235.8 ms | 1,869.6 ms |
| .EHS validation/extraction | 1,053.7 ms | 3,972.5 ms | 6,200.5 ms |
| Archive bytes | 11,646,568 | 64,568,539 | 106,908,351 |

Playback was observed for one second per performance run, distinct from the extended stress below. Sources after Stop were zero for all three. .EHS remains v1, lossless, deduplicated and checksum-validated, with the original limits. Input collection/hash/extraction remain buffered; ZIP output is chunked into Blob parts, not end-to-end streamed. No archive code/limits were changed in 7C.

## 5. Audio quality verification

### Optimization-only reference comparison

Pre-change small and medium PCM were saved before editing. The windowed renderer was first compared **before** correcting the imager:

- Small four-second windows: max absolute error 0.0000438094, RMS error 0.00000196935, peak difference -0.0000003353.
- Medium one-second windows: max absolute error **0.0001047105**, RMS error **0.0000060650**, peak difference **+0.0000076890**. Both retained exactly 7,985,775 frames.

After the final runtime changes, a small reference probe explicitly restored the old right-side polarity **in the test harness only**, isolating scheduling from the intentional stereo fix:

- 1,370,775 frames on both sides; no sample-count/duration change.
- Maximum error **0.0000445638**; RMS error **0.00000192795**.
- Peak and true-peak difference **-0.000000990927**.
- Integrated loudness difference **-0.000000678900 LU**.
- Best timing alignment **0 frames**, tested against shifts -4 through +4.

These are measured native graph/summation differences, not sample-identical or independently auditioned perceptual certification. Acceptance envelopes for these fixtures are max error <0.0002, RMS error <0.00001, peak difference <0.00002, loudness difference <0.001 LU and zero best-lag shift; the applicable measured checks satisfy them. The 7B exact shared-DSP reference tests remain unchanged.

### Functional signal checks

- Corrected width-1 stereo retained distinct 440/660 Hz channels and the intended approximately 2:1 RMS balance. Width 0 produced equal channels (maximum difference 0); opposite-polarity input retained opposite channels (maximum channel sum 0).
- A running render was edited and its caller's buffer map cleared after its first window: export versus the untouched render had **max/RMS difference 0/0**.
- Muted ghost-sidechain triggers spanning two different window boundaries ducked bass by **24.5541 dB** at both positions. Stateful processing/routing was retained.
- An amplified master with saturation, multiband and a -2 dBTP limiter rendered at **-2.09937 dBTP estimated**, sample peak 0.785291, with zero clipped samples.
- All expected sources were constructed: 180/3,240/10,800 instrument events plus 3/54/180 audio-clip sources, yielding 183/3,294/10,980 total sources.

### Final full-chain decoded files

| Property | Small | Medium | Large |
|---|---:|---:|---:|
| Render / WAV frames | 1,370,775 | 7,985,775 | 13,277,775 |
| Duration, including tails | 31.083333 s | 181.083333 s | 301.083333 s |
| WAV bytes | 8,224,694 | 47,914,694 | 79,666,694 |
| WAV RMS | 0.02144514 | 0.06254338 | 0.09477342 |
| WAV peak | 0.06514335 | 0.19779825 | 0.31318367 |
| MP3 bytes | 1,244,473 | 7,245,322 | 12,044,538 |
| Decoded MP3 frames | 1,372,032 | 7,987,968 | 13,279,104 |
| Decoded MP3 RMS | 0.02143581 | 0.06253616 | 0.09477072 |
| Decoded MP3 peak | 0.06516092 | 0.19778115 | 0.31318986 |
| Render integrated loudness | -31.23385 LUFS | -22.00938 LUFS | -18.43490 LUFS |
| Render estimated true peak | -23.72191 dBTP | -14.07349 dBTP | -10.08248 dBTP |

All files independently decoded as stereo 44.1 kHz; all contained signal and none clipped. MP3 retains encoder padding/delay and is not bit-exact or gapless. Final left/right PCM hashes differ as expected after the stereo repair. The complete large WAV/MP3 verification missing in 7B is now executed.

## 6. Memory, responsiveness and disposal

| Sampled metric, complete dual-format workload | Small | Medium | Large |
|---|---:|---:|---:|
| Peak page JS heap, bytes | 65,041,173 | 243,071,048 | 401,931,168 |
| Browser-tree working-set peak, bytes | 682,561,536 | 1,029,627,904 | 1,229,021,184 |
| Browser-tree private-byte peak | 406,700,032 | 749,842,432 | 942,096,384 |
| Private bytes after final forced GC/sample | 406,700,032 | 511,123,456 | 925,179,904 |
| Maximum whole-workload heartbeat delay | 165.0 ms | 1,046.6 ms | 1,629.3 ms |
| Total constructed source nodes | 183 | 3,294 | 10,980 |
| Maximum retained scheduled source handles | 12 | 36 | 72 |
| Source handles after render cleanup | 0 | 0 | 0 |

Memory was sampled from the explicitly owned Edge process tree approximately every five seconds, plus before/after workload checks. These are sampled lower bounds, not perfect instantaneous peaks. Working sets can double-count shared pages; private bytes are committed process memory, not just resident audio. Browser/renderer/Worker/native allocations are included, unlike JS heap alone. Allocators and process caches retain memory; forced GC does **not** prove all native memory was returned to the OS. DevTools context metadata also remained visible after GC, so it was not used as a claim of native-object destruction.

The whole-workload heartbeat includes large synchronous fixture creation/channel copies and diagnostic hash/RMS scans; it is not a continuous audio-render stall. The separate large archive/playback run observed 234.9 ms maximum heartbeat delay after fixture construction, with a 3,006 ms long task spanning synthetic fixture/waveform setup. Responsiveness is improved/bounded, not universally jank-free. Low-memory/mobile export still needs physical-device budgeting.

Actual cancellation returned AbortError, **zero retained sources and a closed native context in 275.8 ms** for the focused fixture. The remaining silent drain is browser-managed allocation work, not a memory-free cancellation primitive. Node tests verify disposal precedes native draining, no further music is scheduled and failures remain failures.

## 7. Remaining reliability gates executed

### Native process crash/relaunch

Used only the isolated Edge profile. Verified ownership, force-terminated explicit browser/child PIDs, and relaunched that same profile on a disposable origin for each case:

1. **Autosave before the localStorage write:** a test hook held the pending write indefinitely. Previous project JSON and two stored audio blobs survived exactly.
2. **Import while a real IndexedDB asset transaction was uncommitted:** a keepalive request held the transaction after the incoming asset put. Native termination rolled it back; the old project and both audio digests matched, with no incomplete incoming asset.
3. **Project export while ZIP Worker work was pending:** the previous JSON and both audio digests survived exactly.

The first autosave fixture used a 30-second timer and allowed the edit to commit before interruption; that attempt was not counted as a preservation pass. The hook was corrected to an indefinite boundary hold, then rerun successfully. No data corruption was observed in the first attempt either; the newer edit had been completely saved.

These are actual native process terminations with controlled boundary hooks. They do not prove power-loss durability, termination inside the synchronous storage primitive, every cross-storage commit instant, or recovery of uncommitted edits. IndexedDB plus localStorage are still not one atomic transaction. Keep portable backups.

### Extended scheduler stress

Executed **120,475.7 ms** of dense polyphonic Sampler and two independent Drum Rack patterns with external ghost sidechain, repeated looping, 23 seeks, 11 real AudioContext suspensions/resumptions and seven BPM changes.

- 3,937 source registrations; **zero duplicate active scheduling keys**.
- Maximum source count 22; sources after Stop 0.
- 4,849 scheduler calls; mean 0.37094 ms, maximum 7.2 ms.
- No processor errors or accumulated/stuck voices.

Separate actual throwing-Worklet acceptance verified visible live failure, audible retry (peak 0.1414225), offline rejection, suspension and bounded-gap recovery after the disposal changes. This is not a guarantee of gapless arbitrary background-tab throttling.

### Portability

A fresh origin with zero assets/no autosave imported the instrument archive, edited it, exported/reopened it, retained linked pattern references and identical SHA-256 audio digests, rejected an invalid import without replacing the project, and exported non-silent stereo WAV/MP3. Container 1 / project schema 2 retained; archive bytes 197,014 then 197,819. WAV/MP3 RMS 0.01676865 / 0.01673483, peaks 0.06945693 / 0.06946731. Previously verified synthetic recorded-take/velocity/dynamic-pad portability remains supported; no archive schema change was introduced.

## 8. Static deployment cache versioning

- `npm run build` uses Node built-ins only. It writes deterministic, content-versioned `dist/assets/<hash>/src` and `vendor`, matching entry HTML, `version.json` and `.nojekyll`.
- Entire module/Worker/Worklet/CSS/vendor resolution stays in the same version namespace, including repository subpaths.
- Added Pages Actions workflow runs tests, builds and uploads `dist`; remote configuration was **not** changed and no workflow/deployment was triggered.
- GitHub Pages must use **Source: GitHub Actions**, not the previous unversioned branch deployment, to activate this pipeline.
- No Service Worker is installed; there is no random per-load cache buster and no automatic project/IndexedDB clearing.

Browser acceptance loaded build `537999f0b18d54548557`, saved project metadata and an IndexedDB probe, rebuilt, then reloaded build **3521f648df53efcf3d4a**. Metadata and stored Blob matched exactly. Loaded script/style resources used the new namespace; versioned offline sidechain/mastering and MP3 Worker/vendor encoding succeeded (366,031 audio frames, 333,322-byte MP3). A final native-error regression fix changes the final build to `9b1f644c2f9a3f62df39`; the build writes the same captured bytes it hashes, rather than recopying mutable source files.

Check `meta[name="ehs-build"]` against a no-store fetch of `version.json`. Content namespaces prevent mixed-version assets; they cannot force a CDN-cached HTML entry to update immediately. Hard-reload a mismatched entry, especially the first transition from an unversioned deployment. Do not clear site data. Actual remote Pages configuration/deployment remains unverified until a user-approved push/deploy.

## 9. Files and regression validation

Production:

- `src/audio.js`: captured render inputs, bounded scheduling integration, complete cleanup, progress/cancellation.
- `src/offline-scheduler.js` (new): continuous-context quantum windows and native cancellation draining.
- `src/instrument-playback.js`: exposes scheduled voice end time for lifecycle cleanup.
- `src/mastering.js`: right-side imager polarity and processor disposal.
- `src/mastering-processor.js`, `src/sidechain-processor.js`: processor retirement.
- `src/app.js`: Export/Release render progress and AbortSignal wiring.
- `scripts/build-static.mjs` (new), `package.json`, `.github/workflows/pages.yml` (new): static cache-versioned deployment.

New tests/measurement fixtures:

- `tests/offline-scheduler.test.js`, `tests/processor-disposal.test.js`, `tests/static-build.test.js`.
- `tests/offline-profile-browser.js`, `tests/run-offline-profile.mjs`, `tests/profile-dsp.mjs`, `tests/native-stage-profile.js`.
- `tests/offline-render-acceptance.js`, `tests/scheduler-stress-browser.js`.
- `tests/crash-recovery-browser.js`, `tests/run-browser-check.mjs`.

Documentation: this report, `README.md`, `IDEA.md`, [BATCH_005A_7_REPORT.md](./BATCH_005A_7_REPORT.md), `EHS_FORMAT_SPEC.md`.

Full Node regression suite: **265 passed, 0 failed, 0 skipped**, preserving all 253 previous tests. Eight scheduling tests cover continuous windows, tail coverage, 180-/300-second scheduling, cancellation, failure cleanup and a short native-render rejection without an orphaned rejected Promise; three disposal tests cover all processors; one build test covers determinism, transitive assets, version changes, subpaths and preservation of old generated versions.

All **93** source/test/build JavaScript syntax checks, strict UTF-8 validation of **123** text files and `git diff --check` passed. Browser checks described above are executed evidence, not Node-only substitutes. No new dependency was installed and no existing test was weakened.

### Reproduction

Serve the repository on localhost and start an isolated Chromium/Edge with remote debugging port 9228 and autoplay allowed. The profile must be disposable; crash fixtures intentionally replace its own test origin. Commands below use a normal Node 22 installation:

```text
node --test tests/*.test.js
node tests/profile-dsp.mjs
node tests/run-offline-profile.mjs 9228 small full encode
node tests/run-offline-profile.mjs 9228 medium full encode
node tests/run-offline-profile.mjs 9228 large full encode
node tests/run-performance-browser.mjs 9228 http://127.0.0.1:8767 small,medium,large no-render
node tests/run-browser-check.mjs 9228 http://127.0.0.1:8767 ./tests/offline-render-acceptance.js runOfflineRenderAcceptance
node tests/run-browser-check.mjs 9228 http://127.0.0.1:8767 ./tests/offline-render-acceptance.js runOfflineBoundarySignalAcceptance
node tests/run-browser-check.mjs 9228 http://127.0.0.1:8767 ./tests/scheduler-stress-browser.js runSchedulerStress
npm run build
```

`reference`/`compare` runner modes save/read PCM in the disposable origin's test IndexedDB; they must use matching code/settings. `compareLegacyStereoReference` explicitly restores old polarity only for test comparison. Native crash cases require calling prepareCrashCase, terminating only verified owned PIDs, relaunching the same profile, then verifyCrashCase with the returned expectation. The generic runner accepts JSON arguments or `base64:<UTF-8 JSON>` for Windows-safe quoting.

## 10. Limitations and 005B handoff

The critical medium/large render and decoded-audio gaps are closed for this desktop reference. No unresolved critical project-loss or audio-integrity failure was found in the executed gates.

Still explicit release/005B gates:

- Physical microphone latency/permissions, real iOS/Android touch/audio and constrained-device memory; no physical-device claim is made.
- Independent Firefox/WebKit engine and independent loudness/true-peak standards verification.
- Real remote Pages workflow/deployment after approval.
- Longer/background-throttled scheduling and OS/power-loss durability beyond the documented bounded stress/crash cases.
- Buffered archive input/extraction and full-length output/encoding/analysis buffers still consume substantial memory. No end-to-end streaming or universal near-limit memory safety claim.
- Native allocator/process memory retention and diagnostic main-thread scans are not zero-cost. Keep mobile export warnings and profile on actual target hardware.
- Floating-point native graph summation differs slightly, and the intentional stereo repair changes old incorrect output. MP3 encoder padding and the previously documented fractional-rate slice precision limitation remain.

005B may now focus on the requested professional transport/Arrangement/mixer/Device Panel redesign without rewriting the music engines. Preserve shared instrument events, 25/150 ms live scheduling, continuous offline DSP state, explicit fault recovery, buffer/snapshot ownership, archive validation/limits, portable schemas and the maintained browser fixtures. Keep the physical/cross-engine gates in its acceptance plan.
