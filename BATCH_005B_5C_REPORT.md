# Batch 005B.5C - Connected mobile production acceptance

## Status

**BATCH 005B.5 INCOMPLETE - SPECIFIC BLOCKERS REMAIN**

The connected 390x844 production session was executed from New Project through
sample editing, instruments, section duplication, synthetic overdub, take review,
mobile mastering, actual WAV/MP3 downloads and empty-origin portable restoration.
This is new connected evidence, not a combination of older component results.
However, **numerical render repeatability/restoration failed the unchanged RMS
tolerance**. Do not start 005B.6 or declare full audio acceptance.

The user reports that 005B.5B is deployed. This work was tested locally only:
no commit, push or deployment was performed. Earlier documentation housekeeping
was already in the worktree and is preserved.

## Implemented fixes

1. **Sample Studio re-entry crash:** leaving Sample Studio disposed its UI, but
   retained the old stop/dispose callbacks. Opening an instrument sample later
   called the stale callback against the reused main element and threw
   `Cannot set properties of null (setting 'textContent')`. Teardown now clears
   those callbacks after stopping/disposing the active session. Repeated
   cross-workspace opening passes without page errors.
2. **Unsaved sample replacement:** Open in Sample Studio from instruments/takes
   now asks before replacing an unsaved editor buffer. Matrix checks explicitly
   decline replacement, then accept it; Cancel stays in the instrument editor.
   This does not change saved assets or portable project data.
3. **Playhead intercepting clip gestures:** the wide playhead hit surface could
   intercept a clip's start handle. In Clip Edit/Range modes its line remains
   visible but pointer events pass through to the active editor gesture.
   Ruler seeking remains available; Scroll/select retains playhead dragging.
4. **Master graph startup:** a new graph now initializes AudioParams directly at
   committed values, instead of ramping from browser node defaults. Subsequent
   live edits retain the existing 15 ms smoothing. This removes unintended
   startup parameter sweeps, but **did not resolve** the numerical blocker.
   DSP algorithms, chain order and Worklet settings protocols are unchanged.

No new production dependency, recording engine, effect model, project schema,
container format or archive limit was introduced.

## Connected workflow

The maintained [production fixture](./tests/mobile-production-browser.js)
performs all 22 steps without resetting the project. Its only synthetic input
hook is microphone acquisition: a 523.25 Hz oscillator feeds a MediaStream into
the existing PCM capture path. Source samples are generated WAV files selected
through real file choosers. Musical project edits use UI controls; application
state is read for assertions, not injected.

| Steps | Executed result |
|---|---|
| 1-3 | Visible document at 390x844; New Project; import four-second stereo 1 kHz source. |
| 4 | Touch both waveform handles; exact 0.25-3.75 s selection; zoom/fit. |
| 5-6 | Active processed preview; gain/EQ edits retain source identity; A/B; save a new processed asset. |
| 7-9 | Create Rack from saved sample; import original into library; assign two different assets; enter four steps and operate pad preview. |
| 10-11 | Create Sampler from processed asset; touch-create two melody notes and change stored velocity. |
| 12-14 | Two independent four-beat instrument clips; select beats 0-4 across tracks; duplicate to beats 4-8. |
| 15-16 | Create/arm Audio track; select backing; one-bar count-in; synthetic overdub with real input meter activity; Stop & Save. |
| 17 | Operate take preview; trim to 0.1-1.8 s; gain 0.8; fades 0.05/0.1 s; move to bar 0.5; Activate; cancel a second count-in without losing saved take; confirm clip in Arrangement. |
| 18 | Selected-track mobile Mixer sets take track volume 0.7/pan -0.15; insert track EQ. |
| 19 | Mobile advanced Mastering: multiband, imaging, limiter, shared numeric controls, touch EQ, actual FFT, live A/B, final render and analysis. |
| 20 | Actual WAV/MP3 downloads independently decoded; non-silent stereo output and the recorded frequency measured in both. |
| 21 | Actual .EHS download from this same song. |
| 22 | Empty-origin import restores exact track/pattern/take/effect/master settings and decoded source hashes; playback operates. **Rendered-audio RMS comparison fails.** |

Final sessions ran against both source and built `/dist/` entries. These are
separate executions of the same workflow, not a claim that independently
recorded oscillator takes have identical bytes. Both had zero page errors.
Both exit with a failed acceptance result because numerical gates remain failed.

Final master analysis displayed approximately **-19.8 LUFS** and **-15.1 dBTP**
(4x estimate); FFT showed **996.09375 Hz**. These are observed application
readouts, not independent loudness-standard certification.

## Actual export and recording evidence

| Measurement | Source final | Built final |
|---|---:|---:|
| Offline frames / rate / channels | 366031 / 44100 / 2 | 366031 / 44100 / 2 |
| Offline RMS | 0.05044877265550257 | 0.05044882137198498 |
| WAV downloaded bytes | 2196280 | 2196280 |
| WAV decoded frames / rate / channels | 398401 / 48000 / 2 | 398401 / 48000 / 2 |
| WAV RMS / peak | 0.05044836501039754 / 0.17559513449668884 | 0.05044841368877406 / 0.17617923021316528 |
| WAV recorded-tone amplitude | 0.02709946115688553 | 0.0271261697032402 |
| MP3 downloaded bytes | 333396 | 333396 |
| MP3 decoded frames / rate / channels | 399986 / 48000 / 2 | 399986 / 48000 / 2 |
| MP3 RMS / peak | 0.0503485246333197 / 0.17544156312942505 | 0.05034863291469151 / 0.17605045437812805 |
| MP3 recorded-tone amplitude | 0.026968089306693456 | 0.026970172346131867 |
| Removing recorded track: render difference RMS | 0.007854603211353176 | 0.007854009294634597 |
| Portable archive bytes | 1855713 | 1850083 |

Decoded WAV duration is about 8.300 s; MP3 about 8.333 s including encoder
padding. The decoder uses 48 kHz; this is not a claim about encoded header rate.
Both outputs match the reference master level within the existing 0.15 dB
bound. The 523.25 Hz component is measured over 1.2-2.5 seconds and exceeds
the fixture's 0.005 amplitude minimum. The dry take therefore contributes to
the final mastered downloads, rather than merely existing in project metadata.

The final built archive contains three audio assets, container v1/project
schema 2. A separate ZIP inspection verified all five payload lengths and
SHA-256 hashes. Browser import starts with `autosave: null` and zero IndexedDB
assets. Exact settings and source PCM checks pass before numerical comparison.
This uses two empty origins in one isolated context, not a second-profile claim.

## Blocking numerical result

The existing bounds remain maximum error **1e-4**, RMS error **1e-6**:

| Comparison | Maximum absolute error | RMS error | Result |
|---|---:|---:|---|
| Source: repeated original | 0.000024359673261642456 | 0.0000023365062080983296 | FAIL RMS |
| Source: restored project | 0.00002372264862060547 | 0.0000031669289340609223 | FAIL RMS |
| Built: repeated original | 0.00002870708703994751 | 0.000003537656916790688 | FAIL RMS |
| Built: restored project | 0.000030875205993652344 | 0.000003207557449053483 | FAIL RMS |

The discrepancy also occurs without an archive round trip. Diagnostic cloned
renders narrowed it to the mastering EQ path, but do not establish its exact
cause. One diagnostic run after startup initialization gave RMS 3.5435e-6 with
the chain unchanged versus 8.8977e-9 with master EQ disabled. Other probes
disabled multiband, limiter, imaging or the full chain; disabling multiband or
limiter alone did not remove the discrepancy. These clones are diagnostic
renders only, not bypassed production acceptance.

Do not call this bit-identical, claim archive corruption, rewrite DSP
speculatively, lower the signal to hide error, or widen the tolerance.
Next work should isolate native EQ/filter state versus upstream numerical
variation with a minimal reproducible browser signal before changing routing.

## Regression results

- Intake: **320/320 Node tests**, 5732.5461 ms.
- Final full suite: **321/321**, 0 failures/cancelled/skipped, 7610.1016 ms
  (preceding full run: 8937.2028 ms).
  The added test checks direct startup values and preserved live smoothing.
- Targeted mastering suites: **29/29**.
- Two deterministic builds: **64 assets**, version `95c50c9bb1c8fe3c0410`.
- All **130 JS/MJS** modules pass syntax checks. Final documentation integrity
  and whitespace checks are recorded in the validation closure below.
- Source and built responsive fixtures: seven sizes, 16 interaction categories
  each (**112 category checks per entry**), zero page errors; see the
  [acceptance matrix](./BATCH_005B_5C_ACCEPTANCE_MATRIX.md).
- Shared audio regressions pass: sample gain -6.0000100698216965 dB; EQ boost
  +5.986437830349126 dB; low-pass -39.967667045203996 dB; compressor RMS response
  +7.617451853282045 dB. Positive compressor response includes native makeup;
  it is not described as attenuation.
- Shared saved sample: 192000 frames at 48 kHz, RMS 0.05657597681720708,
  peak 0.08001953363418579; once-only processing error +0.0011414375768613102 dB.
- Desktop shared transport/instrument/record/master regression passes:
  output -5.993175514516354 dB, EQ +6.001909081635537 dB, reduction
  19.817286871197368 dB; source retention, pause/A-bypass, stale-analysis
  invalidation, backing mix and typing-safe Space behavior pass.
- Recording interruption rerun passes pending-permission/capture guards,
  emergency Stop and actual AudioContext suspension. Salvaged 16384 frames,
  RMS 0.10606348344229255, peak 0.15000000596046448; input stream ended.

One shared-regression startup attempt timed out while another browser workload
was active. The isolated rerun passed. Earlier matrix attempts exposed both the
fixed application defects and fixture assumptions about hidden desktop actions,
sticky headers, expanded-row hit positions and notes/velocities at edit bounds.
Only the final explicitly reported runs count as acceptance.

## Modified files and reproduction

Production: [app.js](./src/app.js), [arrangement.css](./src/arrangement.css),
[sample-editor.js](./src/sample-editor.js), [mastering.js](./src/mastering.js).
Tests: [mastering.test.js](./tests/mastering.test.js), new
[mobile-production-browser.js](./tests/mobile-production-browser.js) and
[mobile-production-matrix.js](./tests/mobile-production-matrix.js).
Documentation: this report, the acceptance matrix, [README](./README.md),
[IDEA](./IDEA.md), [005B.5 report](./BATCH_005B_5_REPORT.md) and the
[archive index](./docs/archive/README.md).

Use the existing Node test/build commands. Browser fixtures export host-side
Playwright functions: call `runMobileProductionAcceptance(page, {cleanOrigin,
onStage, onArchive})` on an empty source or built origin, with a second unused
origin for restoration. Failed numerical gates throw an error carrying
`error.evidence`; they do not return a success-shaped fallback. `onArchive`
optionally retains the actual downloaded file for matrix reproduction.
Call `runMobileProductionMatrix(page, {onStage})` after UI-importing that file
into a disposable origin. It changes the test song; never use personal storage.

Testing used isolated headless native Edge 156 on Windows with genuine
`document.visibilityState === 'visible'`, synthetic CDP touch and ordinary
Playwright controls/file selection/downloads. No visibility spoofing, forced
hidden clicks, huge numeric-array transfers or project-state injection.
Playwright is session-local, not a new repository dependency.

## Remaining acceptance

1. Resolve the repeatability/restoration RMS blocker without weakening gates.
2. Complete remaining recording variants (multiple normal saved takes and
   take-specific audition metering) and Sample Cancel/New Recording phone review.
3. Export progress/cancel, metadata/artwork and project replacement variants
   are not fully represented by matrix format/menu actions.
4. Full gesture variants, native scroller behavior and all legacy controls are
   not certified by the representative matrix.
5. Physical iOS/Android, virtual keyboards, real microphone latency/OS
   interruption, Firefox and Safari remain untested. These may remain later
   device gates, but the current numerical blocker prevents 005B.6 readiness.

### Validation closure

All **130 JS/MJS** modules pass `node --check`; all **172** tracked/unignored
repository text files pass strict UTF-8 decoding. `git diff --check` passes
(only existing LF-to-CRLF conversion notices). Both final seven-size interaction
matrices pass, including numerical ruler-seek assertions and sample discard
Cancel/acceptance. Source and built connected workflows still deliberately
exit nonzero on the numerical gates shown above. The build remains
`95c50c9bb1c8fe3c0410`; later changes are documentation/fixtures only.

The owned static server was stopped and browser contexts were closed.
Disposable safety-test profile and diagnostic screenshot were removed.
Session-only JSON evidence and the actual downloaded test archive were retained
for continuing the numerical investigation; they are not application assets.
