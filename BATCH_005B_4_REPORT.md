# Batch 005B.4 - Interactive EQ and real spectrum acceptance

**BATCH 005B.4 COMPLETE - READY FOR BATCH 005B.5**

Completion describes the functional implementation and tested Windows Chromium
scope below, not physical-device, all-engine or independent audio certification.
Portable restoration used an explicitly empty, isolated origin in the integrated
browser, not a separately created Playwright context; see limitations.
No commit, push or deployment was performed.

## Delivered

- One shared interactive track/master EQ: logarithmic valid-Nyquist frequency,
  separate EQ-dB/FFT-dBFS axes, native Biquad response, selected/disabled/bypassed
  states and responsive physical-sized SVG labels.
- Actual four-band track and six-band master models, plus cuts; exact numeric
  frequency/gain/Q, bell/shelf, enable, selected-default reset, mouse/touch,
  cancellation, keyboard and Shift-fine adjustment. Wheel Q has visible
  rotary/numeric access. Unsupported cut gain/Q and shelf Q are disabled.
- Actual lazy FFT, Pre/Post, On/Off, FFT size, smoothing, decaying peak hold.
  Correct device-local taps follow track/master order and bypass; final output
  is never mislabeled as Pre-EQ.
- Targeted master-bypass repair: bypass now skips residual high/low cuts, while
  active processing topology and original cut Q conventions remain unchanged.
- Bounded 30 Hz rendering, reused FFT arrays, native response caching,
  visibility/fold/suspension handling and explicit branch/editor disposal.
- Existing actual compressor, limiter and multiband gain-reduction readouts
  remain intact. No decorative meter or additional processor.

See [the architecture/audit](./BATCH_005B_4_EQ_ARCHITECTURE.md) for formulas,
tap diagrams, supported filter limits, authoritative bindings, compatibility and
official Live 12 functional references.

## Changed files

| Files | Purpose |
|---|---|
| [eq-model.js](./src/eq-model.js), [eq-analyzer.js](./src/eq-analyzer.js) (new) | Shared native descriptors/response and disposable FFT branches |
| [eq-visualizer.js](./src/eq-visualizer.js), [eq-workspace.js](./src/eq-workspace.js) (new) | Shared interactive view and existing-model adapters |
| [audio.js](./src/audio.js), [mastering.js](./src/mastering.js) | Matching actual EQ configuration, local taps, true master EQ bypass |
| [app.js](./src/app.js), [workspace.css](./src/workspace.css) | Device/master integration, lifecycle and responsive styling |
| [eq-visualizer.test.js](./tests/eq-visualizer.test.js) (new) | Fifteen additive deterministic tests |
| [eq-audio-acceptance.js](./tests/eq-audio-acceptance.js) (new) | Native offline/live fixtures and reordered master tap verification |
| [eq-workspace-ui.js](./tests/eq-workspace-ui.js) (new) | Maintained five-width graphical/analyzer/lifecycle Page fixtures |
| [eq-project-browser.js](./tests/eq-project-browser.js) (new) | UI .EHS restoration, actual playback, render hashes, WAV/MP3 decoding |
| [README.md](./README.md), [IDEA.md](./IDEA.md), [EHS_FORMAT_SPEC.md](./EHS_FORMAT_SPEC.md), this report and architecture guide | Workflow, compatibility, evidence and next-stage handoff |

No dependency or framework added. Live scheduling remains 25 ms / 150 ms;
continuous-context offline scheduling, sidechain, instrument clips, Drum Rack,
velocity editing, recording/recovery, encoders, storage and archive limits were
not rewritten.

## Automated validation

- **298/298 Node tests passed**, no failures, cancellations or skips, latest full
  run 8,293.909 ms. All 283 previous tests remain; fifteen tests are additive.
- `node --test tests/*.test.js` using portable Node v22.23.4. The editor's test
  integration discovered zero tests; this was not counted as a passing suite.
- New deterministic coverage: five sample-rate frequency/pixel round trips,
  inverse gain mapping, input-rate rejection, Shift drag conversion, native
  response composition/configuration, band/cut types and bypass, analyzer buffer
  reuse/disposal, legacy defaults and JSON serialization, and bypassed-EQ tap
  reordering/insertion/removal without rebuilding the audible chain.
- **114 JavaScript modules** passed `node --check` across source, browser/Node
  tests and scripts. **123 files** passed strict UTF-8 decoding (those modules,
  source styles and the five updated/new documentation files).
- `git diff --check` passed; only the repository's existing LF-to-CRLF notices
  were printed, with no whitespace error.
- Two static builds agree: **60 assets**, content version
  **`8734f0b4ebce6cb8da82`**. No deployment.
- The built `/dist/` subpath loaded the existing local project, displayed a valid
  response and measured **996.09375 Hz** during actual playback. All **50**
  captured JS/CSS resource URLs matched the content version. Its 360 px layout
  had a 265 px plot, a valid curve and no page overflow. Desktop/360 px plot
  screenshots were inspected; this is a local build smoke, not hosted Pages
  deployment or CDN-cache certification.

## Native audio measurements

48 kHz deterministic sine, impulse, sweep and noise fixtures exercised actual
native Web Audio rather than screenshots or a pure mathematical proxy.

| Measurement | Result |
|---|---:|
| Track +6 dB / 1 kHz sine | +6.0000043285 dB |
| Track -9 dB / 1 kHz sine | -9.0000002488 dB |
| High-pass attenuation fixture | -39.9724869788 dB |
| Low-pass attenuation fixture | -42.6999036305 dB |
| Native graph response nearest 1 kHz sample | +5.9992704391 dB |
| Simultaneous native live Pre/Post FFT difference | +6.0000038147 dB |
| Master +6 dB sine | +6.0008704124 dB |
| Master EQ bypass steady-state maximum error | 0 |
| Analysis branch on/off whole-buffer maximum error: impulse/sweep/noise | 0 / 0 / 0 |
| Stereo invariance error: impulse/sweep/noise | 3.3391e-38 / 0 / 0 |

The controlled live FFT used bin 1001.953125 Hz at 48 kHz: Pre -43.0712089539
dBFS, Post -37.0712051392 dBFS. Native window/bin magnitude is not calibrated sine
peak or loudness. Bypass error excludes initial unrelated master AudioParam
settling (first 12,000 frames); no full-startup sample-identity claim is made.

An additional live master fixture placed saturation **before** EQ and -12 dB
output **after** it: local EQ boost **6.0035324097 dB**, final output relative
to Post-EQ **-12.0000019073 dB**. Pre-EQ's 3 kHz harmonic measured
**-59.6860885620 dBFS**; moving EQ before saturation changed it to
**-183.4771423340 dBFS**. Bypassed Pre/Post difference was **0 dB**.
This tests actual tap position after reordering, not merely changed labels.

## Browser and synthetic-touch acceptance

Maintained Page fixtures passed at **360, 390, 430, 768 and 1280 px**:

- Actual UI-created track/sample/clip/EQ, point mouse/touch drag, touch cancel,
  exact numeric synchronization, keyboard frequency edit, type, band enable,
  cut enable and unsupported cut-gain state.
- Zero page-level horizontal overflow and no additional Arrangement clips.
- Independent selected-track state, EQ device bypass, fold/expand, master six
  bands plus cuts, actual master point dragging and numeric changes.
- JSON autosave/reload equality for track and master settings; zero page errors
  in the graphical interaction fixture.
- Actual 1 kHz playback spectrum at **996.09375 Hz** with 4096 FFT on the
  engine's 44.1 kHz context. Sequential UI Pre/Post difference **6.0053176880 dB**;
  bypass returned to the Pre level within 0.2 dB.
- Analyzer On/Off, context suspension/resume, silent other-track selection,
  folded no-draw state, actual effect reorder/removal and project replacement.
  Retired editors were disposed and no longer retained analyzer branches.
- A 2x device-pixel-ratio check produced a 1,358-pixel Canvas backing width for
  a 679-CSS-pixel plot. This is synthetic high-DPI emulation, not a Retina device.

Mobile testing used Chromium synthetic touch/CDP, not physical phones. A
selected-point stacking defect found at 360 px was fixed: overlapping enlarged
targets could intercept a selected band's touch. The selected point is now
raised once, without reparenting it on every captured drag update.

A targeted failing Node regression reproduced stale tap references when a
bypassed EQ moved without changing the audible-chain signature. Updating the
tap map from actual stage outputs fixes movement, insertion and removal without
rebuilding audible nodes. In the actual UI, moving the bypassed EQ from after
to before a -12 dB Utility changed its measured local spectrum by **12 dB**,
as expected, while leaving the audible chain unchanged.

## Portable project and actual exported audio

The fixture generated audio locally, then used the actual **Project > Save
.EHS** UI. Browser-managed download events are unavailable in this harness;
the test temporarily captures the generated Blob download and restores the
anchor implementation in `finally`. It supplies that file through the actual
import input's change handler on another origin, verified beforehand to have
**null project autosave and zero IndexedDB assets**.

Final archive size: **2,306,809 bytes**. Track/master settings were equal after
import. The one embedded sample decoded, and restored live playback measured
**996.09375 Hz**. Reimport while the old live EQ was attached disposed that editor
and its branch correctly.

Before/after native renders: **542,430 frames, 44.1 kHz stereo**, RMS
**0.0330149327101**, peak **0.0600728690624**. Both channel SHA-256 hashes were
identical before/after restoration:

```text
d08a1364abab7e9147aa178267534c8841ab392d2ee9a9b3be186dcdb1228e6e
90958d5e48ca70e314b44a295e20f46572f317439f87374c85ddd81012b278dd
```

Actual Export Studio UI output decoded successfully:

| Format | Rate / channels | Decoded frames | RMS | Peak |
|---|---|---:|---:|---:|
| WAV | 48 kHz / 2 | 590,400 | 0.0330146480990 | 0.0599734969437 |
| MP3 | 48 kHz / 2 | 591,830 | 0.0329753618478 | 0.0600872822106 |

Both contain the processed signal without clipping. MP3 encoder padding and
lossy PCM are expected; MP3/WAV are not claimed sample-identical to float source.
Container v1, schema 1 audio projects and existing schema-2 instrument/archive
Node tests remain compatible; no destructive migration or archive-limit change.

## Visualization performance

One-second visible UI observations at 1280 px; not total browser/audio-thread CPU:

| FFT | Drawn frames | Total measured draw time | Mean per drawn frame |
|---|---:|---:|---:|
| 2048 | 24 | 17.2 ms | 0.717 ms |
| 4096 | 24 | 20.4 ms | 0.850 ms |
| 8192 | 24 | 32.8 ms | 1.367 ms |

Rendering is capped at 30 Hz; actual cadence depends on browser scheduling.
No full app render occurs per frame. Native response probes/FFT arrays are bounded
per editor, and old branches are explicitly removed. This run does not measure
retained browser-process memory, audio-thread CPU, battery or phone thermal load.
Prior whole-project export benchmarks remain in
[005A.7C](./BATCH_005A_7C_REPORT.md); they were not relabeled as new EQ benchmarks.

## Limitations and 005B.5 handoff

- Tested integrated Chromium and native Windows Edge; no Firefox/WebKit,
  physical touch, microphone hardware or mobile performance certification.
- The integrated browser rejects `browser.newContext()` under its page-storage
  affinity rules. Restoration therefore used a truly empty **origin**, not
  another browser profile/context. Separate-profile acceptance remains an
  explicit environment-limited check; no cross-context claim is made.
- Local FFT follows live AudioEngine taps, not separately rendered Mastering
  auditions, sample-preview contexts or offline export progress. Mono FFT can
  cancel anti-phase stereo; it is not LUFS or complete stereo power.
- Native windowing, smoothing warm-up and frequency-bin leakage affect FFT dBFS.
  There is no selectable cut slope/Q, dynamic EQ, phase plot or automation.
- Analyzer preferences and selected bands are transient and may reset on an
  existing responsive full render. Hidden/off editors can retain a lightweight
  RAF callback, but do not draw hidden plots or retain hidden analysis branches.
- Legacy EQ template generation remains internal to the old application render
  path and is synchronously replaced by the one shared editor.

005B.5 should implement dedicated phone workspace presentation while preserving
these model/tap/disposal contracts and the measured audio/export behavior.
Retain synthetic tests, add physical and non-Chromium acceptance, and measure on
actual mobile hardware before assigning phone budgets. Do not replace native
FFT with waveform decoration or mix final-output and local EQ labels.
