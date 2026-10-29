# Batch 005B.5D - Mastering repeatability and mobile closure

## Status and scope

**BATCH 005B.5D COMPLETE — AUDIO REPEATABILITY VERIFIED**

Acceptance is scoped to the executed Windows / native Edge Chromium browser
tests, not physical phones or other audio engines. The unchanged-project
numerical blocker is resolved without changing native filters or widening
tolerances. No PWA, new instrument, backend, schema migration, commit, push or
deployment was introduced. The user-reported deployed release remains 005B.5B;
these results describe the local source and versioned build.

The [005B.5C report](./BATCH_005B_5C_REPORT.md) remains the historical failed
baseline. Its [matrix](./BATCH_005B_5C_ACCEPTANCE_MATRIX.md) describes the
representative categories rerun here, not every possible gesture.

## Root cause and controlled reproduction

1. Reexecuting the original connected fixture before changes reproduced
   **max 2.7529895305633545e-5 / RMS 2.9230180368967106e-6** on an unchanged
   project. Its restored comparison also failed: max 2.475827932357788e-5 /
   RMS 2.9725259952201653e-6. Neither involved comparing separate recordings.
2. With one identical deterministic stereo buffer, eight graph variants at
   both 44100 and 48000 Hz were bit-identical across four fresh renders each:
   no effects; EQ bypass; flat EQ without cuts; one bell; multiple bands;
   cuts; EQ plus saturation/imaging; full multiband/limiter chain.
   Actual Pre/Post EQ taps were captured alongside final output.
3. Decoding the phone-authored archive once and replaying its fixed pre-master
   mix through the actual settings was also bit-identical, both continuously
   and with the existing quantum-aligned suspend/resume windows.
4. The real project already differed slightly **before** Master EQ. Per-filter
   taps located the large increase at the first 20 Hz high-pass, not the bell,
   imager, multiband or archive. One measured comparison:

   | Tap | L RMS difference | R RMS difference | First differing L/R frame |
   |---|---:|---:|---|
   | Pre-EQ | 6.075338969e-8 | 3.665596774e-8 | 22090 / 22086 |
   | First high-pass output | 4.727646548e-6 | 3.591872310e-6 | 22090 / 22086 |
   | Final output | 3.380211720e-6 | 2.580727092e-6 | 22319 / 22321 |

   Pre-EQ peak changes were -1.192092896e-7 / -8.940696716e-8. First-filter
   peak changes were -1.645088196e-5 / 6.631016731e-6. Final peak changes were
   1.247227192e-5 / 1.557171345e-6. In the first four one-second windows,
   left first-filter RMS errors were 3.7502e-6, 8.8771e-6, 4.4364e-6 and
   8.5359e-6, falling to 3.1709e-7 in the fifth. Full per-channel/window
   distributions are retained in the session evidence.
5. A minimal eight-voice native fan-in, with deterministic PCM and playback
   rates, reproduces the effect without the application model, Worklets,
   archive or scheduler: input differences around 2-3e-8 maximum and 2e-9 RMS
   become high-pass differences around 1e-5 maximum / 2e-6 RMS. Fixed pairwise
   unity sums of the **same voices** make input and filtered output exactly
   repeatable across six renders.

The actionable cause is native multi-input floating-point summation varying
between fresh polyphonic graphs, followed by a numerically sensitive native
low-frequency filter path. The EQ was not receiving identical samples. This
does **not** establish a faulty EQ frequency response or a particular internal
browser implementation bug. Native coefficient/state precision has not been
source-audited, and no Firefox/Safari conclusion is inferred from Edge.

Explicit time-zero Biquad AudioParam events, explicit master stereo channel
counts, and ordering the track fan-in alone did not remove the failure.
Ordering instrument/audio voice sums as well as track sums does. Startup
parameter smoothing was therefore not the remaining cause.

## Correction and preserved DSP

[ordered-audio-bus.js](./src/ordered-audio-bus.js) builds a deterministic
insertion-order chain of native unity GainNodes. Each sum has at most two
inputs. Released voice slots are reused in stable order; node allocation is
bounded by peak window polyphony, not total song length. All sums are
disconnected on completion, cancellation or failure.

[AudioEngine.render](./src/audio.js) uses these buses for offline audio clips,
Sampler/Drum voices and track-to-master fan-in. The existing continuous context,
one-second bounded scheduling, voice timing, effects, fades, sidechain taps,
tail calculation, master graph and latency trimming remain in place.

This changes floating-point summation order, not musical gain or filter DSP.
It adds no delay, silence, quantization, amplitude reduction, filter bypass,
cache of rendered output or project field. Live playback graphs and their
parameter smoothing remain unchanged. Live/offline signal consistency is
checked separately; live hardware playback is not promised bit-identical.

Audit: every render creates fresh filters and Worklets; committed frequency,
gain, Q and types are unchanged; initial values still start directly at target;
subsequent live updates still use the existing 15 ms smoothing. Filter order,
graphical native response, Pre/Post FFT taps, stereo matrix, final limiter
and chain reordering are unchanged. The portable source hashes/settings match;
44100 Hz rendering and 48000 Hz test decoding are not confused.

### Fixture correction

[workspace-portable-browser.js](./tests/workspace-portable-browser.js) previously
always imported root source audio modules. It now resolves audio and portable
modules beside the application's loaded module entry. Thus `/dist/` numerical
checks actually use the versioned build, not a source-render proxy.
The error bounds remain **max 1e-4 / RMS 1e-6**.

## Audio quality and performance

Deterministic sine, impulse, sweep and noise checks use actual native Web Audio:

| Check | Measured result |
|---|---:|
| Track EQ +6 dB / -9 dB | +6.000004329 / -9.000000249 dB |
| High-pass / low-pass attenuation | -39.97248698 / -42.69990363 dB |
| Track native response near test tone | +5.999270439 dB |
| Master EQ rendered boost / graphical response | +6.000865827 / +6.000141621 dB |
| Master bypass error | 0 |
| Master impulse/sweep/noise analyzer tap error | 0 for each |
| Master impulse/sweep/noise stereo proportionality error | <= 7.450580597e-9 |
| Live track EQ boost | +6.000003815 dB |
| Live master EQ boost / output trim | +6.003532410 / -12.000001907 dB |
| Live reordered EQ bypass difference | 0 |

The native response/probe and stereo checks retain their original bounds.
Live graph updates, actual FFT ownership, A/B, source identity, Sample Save
processing once, backing playback and desktop Space routing are separately
rerun with the maintained cross-workspace fixtures.

Final cross-workspace measurements: Sample gain -5.990934659 dB, EQ
+6.012138144 dB, cut -39.99378554 dB, compressor RMS response +7.582631548 dB.
The source is retained during edits; saved 192000-frame/48000 Hz PCM has RMS
0.05657597682 and peak 0.08001953363, with the once-only processing comparison
at +0.001141438 dB. Master live trim is -5.990587750 dB, EQ +5.999694172 dB
and measured limiter reduction 19.81726815 dB. Both workspace fixtures report
zero page errors and preserve pause/A-bypass/cache invalidation and cleanup.

Additional native regressions verify:

- Stereo separation, mono sum and opposite polarity; snapshot edits during
  export produce max/RMS difference 0.
- Offline cancellation rejects with AbortError, closes the context and leaves
  zero sources (135.3 ms in the measured small cancellation).
- Ghost sidechain ducking survives scheduling boundaries: -24.55407488 dB
  at both measured windows. The amplified mastering test reaches
  -2.099388078 dBTP estimated against a -2 dB ceiling, with zero clipped samples.
- Instrument duck ratio 0.071271306, mastering gain ratio 0.503570285,
  muted RMS 0 and solo backing RMS 0.
- Actual AudioContext suspension salvages 16384 dry microphone frames,
  RMS 0.1060634834 / peak 0.150000006; input tracks end and navigation recovers.
  Permission/capture guards and emergency Stop remain available.

A same-archive old/new diagnostic serves the baseline audio module from Git HEAD
only in an isolated test context, and imports the exact same downloaded archive.
Decoded input hashes/shapes agree. One old/new comparison after slot reuse:
max 2.692826092e-5, RMS 3.005568510e-6, level change 1.461425737e-8 dB,
peak change 3.427267075e-7. This is a diagnostic comparison with the old
non-repeatable implementation, **not** a relaxed repeated-render gate.

Performance was checked on the existing deterministic 4-track / 30-second
fixture, including sidechain, delay tails, saturation, imaging, multiband and
limiter. An initial per-voice summing allocation was discarded after a measured
slowdown; stable slot reuse reduced allocated GainNodes from 547 to 257.
Baseline uses 240. The final change adds 17 sums in that workload.

| Controlled old/new trial | Baseline | Fixed-slot implementation |
|---|---:|---:|
| Native context render | 8461.2 ms | 7853.7 ms |
| Whole render | 8515.5 ms | 7913.8 ms |
| Maximum active sources | 12 | 12 |
| Sources after render | 0 | 0 |
| Output frames / rate | 1370775 / 44100 | 1370775 / 44100 |
| Suspensions | 31 | 31 |
| Sampled JS heap peak | 58725921 bytes | 50677625 bytes |

These are individual measurements on a shared Windows host, not a statistically
proven speedup or a native-memory measurement. Two further final workload
renders took 8366.3 / 8838.3 ms and had **max/RMS/peak difference 0**, including
reused slots, all 180 instrument events and effect tails. Both retired all
sources. Medium/large performance numbers from earlier batches were not rerun
or relabeled as new measurements.

## Connected mobile and remaining variants

Both source and versioned `/dist/` execute all 22 UI-authored steps at 390x844.
No project construction by model injection, hidden forced clicks, visibility
spoofing or threshold weakening is used. Each session compares the same
recorded PCM with itself and its restored archive; separate source/built
recordings are not compared as identical inputs.

Final pooled-bus results, using the final build:

| Comparison | Maximum error | RMS error | Result |
|---|---:|---:|---|
| Source repeated | 0 | 0 | PASS |
| Source restored | 0 | 0 | PASS |
| Built repeated | 0 | 0 | PASS |
| Built restored | 0 | 0 | PASS |

These are bit-identical within each accepted project, not merely level matched.
Both clean import origins started with null autosave and zero IndexedDB assets.
Both restored the exact track/pattern/take/effect/master settings and decoded
source hashes; restored playback operated; both sessions had zero page errors.

| Download / recording measurement | Source | Built |
|---|---:|---:|
| Reference frames / rate / channels | 366031 / 44100 / 2 | 366031 / 44100 / 2 |
| Reference RMS / peak | 0.05044934832 / 0.17684359848 | 0.05044784030 / 0.17706976831 |
| WAV bytes | 2196280 | 2196280 |
| WAV decoded RMS / peak | 0.05044894086 / 0.17688593268 | 0.05044743278 / 0.17711183429 |
| WAV 523.25 Hz recorded-tone amplitude | 0.02721734067 | 0.02711081342 |
| MP3 bytes | 333396 | 333396 |
| MP3 decoded RMS / peak | 0.05034882451 / 0.17696256936 | 0.05034749792 / 0.17705002427 |
| MP3 recorded-tone amplitude | 0.02705359655 | 0.02696798731 |
| Removing take: render difference RMS | 0.00785466712 | 0.00785404429 |
| Downloaded .EHS bytes | 1852133 | 1859824 |

WAV/MP3 decode to stereo 48000 Hz, 398401 / 399986 frames respectively,
including MP3 padding. This decoder rate is not an encoded-header claim.
Both retain the existing 0.15 dB level and recorded-tone checks. Independent
ZIP inspection of the final built archive validates all five payload lengths
and SHA-256 hashes, three audio assets, container v1 and project schema 2.

Additional UI acceptance at 390px, separately on source and build:

- Two normally saved new takes alongside the imported take; take switching,
  exact source-buffer identity and nonzero actual track meters; gain 0.5,
  trim 0.05-0.8 s, fades 0.05/0.08 s; cancel active recording without changing
  saved takes.
- Sample microphone Cancel, fresh recording/Finish, declined replacement and
  discard, and actual shared Play/Stop from the scrolled Save area.
  The existing phone Sample Studio header transport now stays sticky;
  no second playback control or audio model was created.
- Visible numerical export progress (12%, value 0.1202206083), cancellation at
  a real render boundary, successful subsequent release export.
- Real ZIP download contains WAV, MP3, JPEG cover, metadata JSON and release
  notes. Both audio files independently decode without clipping. MP3 TIT2,
  TPE1 and APIC plus WAV metadata are inspected, not just form values.
- New Project Cancel and Save-then-New preserve the outgoing JSON; declined
  portable replacement preserves state; accepted replacement and reload retain
  every take. The release archive is distinct from the editable .EHS.

Final source/built variant runs each retain three normally saved takes.
Take-preview meters are 0.02336646 / 0.02333600 (source) and
0.02339208 / 0.02326301 (built). Sample microphone recordings contain
46080 / 51840 decoded frames; independently recorded durations need not match.
The actual release ZIPs are 1297306 / 1297564 bytes, with zero page errors.

The representative 16-category / seven-size matrix is rerun on source and
build: 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390.
Export-format/menu cells are not presented as full downloads at every size;
actual download/replacement workflows run at 390px.

## Modified files

- [audio.js](./src/audio.js), [ordered-audio-bus.js](./src/ordered-audio-bus.js):
  deterministic bounded offline fan-in.
- [mobile.css](./src/mobile.css): scoped persistent Sample Studio transport.
- [ordered-audio-bus.test.js](./tests/ordered-audio-bus.test.js): three additive
  ordering, stale-release, reuse/bounded-allocation/disposal regressions.
- [mastering-repeatability-browser.js](./tests/mastering-repeatability-browser.js):
  deterministic PCM, eight graph variants, polyphonic root reproducer,
  pre/post/per-filter and rejected initialization/channel diagnostics.
- [eq-audio-acceptance.js](./tests/eq-audio-acceptance.js): additional master
  impulse/sweep/noise, stereo/tap and native-curve checks.
- [workspace-portable-browser.js](./tests/workspace-portable-browser.js):
  source/build module resolution correction.
- [mobile-closure-browser.js](./tests/mobile-closure-browser.js):
  recording, sample, progress/cancel, tagged release and project variants.
- This report, [README](./README.md), [IDEA](./IDEA.md) and
  [current mobile milestone](./BATCH_005B_5_REPORT.md), plus the
  [historical report index](./docs/archive/README.md).

## Reproduction and limits

Serve the repository with `python -m http.server 8768`. Use an empty disposable
browser context/origin and native Edge with autoplay enabled, no state spoofing.
Browser-side exports in the repeatability fixture run through `page.evaluate`;
the host-side production/closure/matrix fixtures take a Playwright page.
Import only the archive produced by the connected fixture through the real
file input. For source use `/`; for built use `/dist/` after
`node scripts/build-static.mjs`. Build dependencies remain locally bundled.
No repository dependency installation or user browser profile is required.

For the browser-side numerical reproducer, import
`/tests/mastering-repeatability-browser.js` in the served page and await
`runMasteringRepeatability()` followed by `runPolyphonicRepeatability()`.
The latter reports the uncontrolled native comparison separately and throws
if the ordered production helper is not exactly repeatable. For connected
acceptance, call `runMobileProductionAcceptance(page, {cleanOrigin})` from
[the maintained fixture](./tests/mobile-production-browser.js), starting at an
empty origin with a second unused origin for restoration. Then use
`runMobileClosureAcceptance(page)` and `runMobileProductionMatrix(page)` on a
UI-imported copy of that actual downloaded archive. No persistent user profile
or application project injection is needed.

Full Node regression: **324 passed, 0 failed/cancelled/skipped**, 9615.9511 ms.
This preserves all 321 intake tests and adds three ordered-bus regressions.
Two final deterministic builds match: **65 assets**, version
`d89bb40ccc51233e2ae5`. Source and built each pass all 22 connected steps and
112 representative interaction cells (16 categories at seven sizes).
The source/built high-value variant fixtures also pass on the final pooled
renderer. Browser checks are explicit fixtures, not secretly counted as Node tests.
Initial concurrent-browser startup/preview attempts failed;
final real-time runs are serial and the failures are not counted as passes.
All **134 JS/MJS syntax checks**, **181 strict UTF-8 repository text checks**
and `git diff --check` pass. All **338 relative documentation links** resolve.
Disposable browser contexts were closed and the owned acceptance server stopped.

No physical Android/iPhone, virtual keyboard, real microphone latency,
OS interruption, Firefox or Safari certification is claimed. Dedicated timeline
pinch, every expanded-editor gesture and every packaging/cancellation variant
remain next-phase acceptance work. Sample's sticky main-workspace transport
does not add controls inside a covering expanded editor; Done returns to it.
Native numerical behavior on other engines remains to be measured.
If another engine still varies with identical ordered input, first retain a
small native reproducer and evaluate its precision before selecting any new
processor. Replacing Biquads, changing their response or widening acceptance
thresholds is not justified by this resolved Edge result.

PWA work may be planned next after review of this scoped closure. It must not
silently cache private audio or weaken project/export integrity. Physical-device
and cross-engine acceptance remain explicit mobile UX gates, not numerical
audio blockers concealed by a completion label.
