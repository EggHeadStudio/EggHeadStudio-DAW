# Batch 005B.5B - Arrangement, Mixer and mobile workflow verification

## Status

**BATCH 005B.5 INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

The priority Arrangement/Mixer milestone and dynamic Rack acceptance are
implemented and tested. Phone-width real downloads and portable restoration
are no longer blocked by the earlier harness. The complete **connected**
22-step mobile production scenario has not been executed. Do not start
005B.6 on the basis of component/layout tests alone.

No commit, push or deployment was performed. No production dependency, mandatory
backend, project schema, .EHS container version, audio quality or DSP changed.
The intake worktree was clean; the actual intake suite passed **315/315**
in 6270.4099 ms.

## Implemented functionality

### Arrangement touch architecture

- **Scroll / select**, **Select Range** and **Edit Clips (touch)** are explicit,
  mutually exclusive modes. Touching a clip edge in Scroll mode cannot start
  a trim; ordinary panning does not move clips.
- The range toolbar supplies exact Start/End beats, First/Last track selectors
  and visible **Copy section / Duplicate section / Paste section here**
  actions. Paste has a snapped numeric beat destination and uses the selected
  range's first track. This makes multi-track editing possible without requiring
  a long diagonal drag across a small phone viewport.
- Range handles are focusable buttons with Arrow-key adjustments and exact
  numeric alternatives. Keyboard adjustment restores focus after overlay redraw.
- Commands reuse `copyTimeRange`/`pasteTimeRange`, destination validation,
  independent pattern snapshots and Arrangement history. Partial audio source
  offsets, pattern phase, gain, fades, track spacing and gaps retain existing
  semantics. Underlying audio assets are referenced, not duplicated.
- Pointer cancellation restores the previous range and insertion marker, rather
  than clearing a valid selection or retaining a cancelled seek. Clip/loop
  drafts remain uncommitted on cancel.
- The pointer helper rejects non-primary contacts/buttons, ignores unrelated
  pointer IDs, handles lost capture and removes listeners before releasing
  capture. No second timeline coordinate or scheduling model was introduced.
- Range intersection display now passes the actual BPM when calculating typed
  instrument duration; it no longer assumes the default 120 BPM.
- This is rectangular, time-based multi-clip/section selection. A separate
  discontiguous clip-selection model was not added.

### Selected-track Mixer and device lifecycle

- A visible **Selected track Mixer** action opens the actual selected strip,
  even when the desktop right Mixer is hidden. Fader, numeric pan/volume,
  Reset, Mute/Solo, actual meters and FX access use their original handlers.
- Closing restores the strip's previous hidden state. No controls, parameter
  stores, meters or audio graphs are cloned for mobile.
- Compact-track CSS explicitly excludes an expanded Mixer, so it cannot hide
  numeric controls/reset/title or compress the expanded meter.
- Expanded editors survive same-workspace structural rerenders, including
  Mute/Solo. Workspace changes still close them. Stable track/device identity
  is used for Mixer/EQ restoration instead of following a reordered device
  solely by its array position.
- Mixer FX/settings actions dismiss the expanded Mixer before opening the
  existing surface/dialog, so the overlay cannot cover its destination.
- The normal Done/Back/Escape routes and shared recording guard remain.
  Expanded editing covers the top transport; return with Done to use the
  header transport. Recording cannot be started underneath an expanded editor.

### Dynamic Drum Rack

No new Rack/pad model was necessary. Actual 390px UI acceptance now verifies:
one empty pad; Add Pad; different sample assignments; preview-button operation;
gain/pan/pitch; steps; velocity 0.4; 32-step pattern and eight-beat length;
unused removal; referenced removal Cancel/Keep/Delete; preserved silent orphan
notes; no reuse of an orphan's MIDI mapping; maximum 32 pads/rows; last-pad
selection/inspector; disabled Add at the limit; exact save/reload.

Preview buttons were exercised, but this fixture does not independently
measure the audio output of all 32 pad previews. Shared instrument signal
regressions and restored project playback are reported separately below.

## Mobile gesture contract

| Action | Contract / visible alternative |
|---|---|
| Tap clip/track | Select in Scroll mode; does not seek the song through the clip. |
| Double-tap instrument clip | Existing selected-pattern editor route; Open Editor is the explicit alternative. |
| Drag clip | Edit Clips mode only for touch; grab offset and left-edge grid snap use the existing ruler scale. |
| Resize | Clip-edge handles in Edit Clips; exact Clip Editor fields remain available. |
| Time/track selection | Select Range drag, boundary handles and exact time/track fields; selection represents all intersecting clips. |
| Copy/duplicate/paste | Visible contextual section buttons; Duplicate appends at the range end; explicit Paste beat permits a distant destination. |
| Seek | Ruler/playhead interaction, not a clip drag. Cancellation restores the insertion marker. |
| Loop | Existing start/end/move brace; Loop from Range is the precise alternative. |
| Piano Roll | Existing Draw/move, additive Select and native Scroll modes; no second note/velocity model. |
| Scroll / two fingers | Native bounded scrollers in Scroll mode. No new custom two-finger editor handler is claimed. |
| Pinch | No dedicated musical pinch handler; visible timeline/Piano zoom controls remain the supported alternative. Browser/system pinch is not advertised as musical timeline zoom. |
| Long press/context | Existing contextmenu/desktop Shift+F10 path is retained; visible Edit/section actions do not require a custom long-press recognizer. OS long-press behavior is unverified. |
| Cancel/lost capture | Restore pre-gesture valid state; no committed cancelled clip/range/loop/seek edits. |

Mouse and keyboard paths remain. Dense musical handles are not all claimed
to be 44px in both dimensions.

## Exact automated validation

- **320/320 Node tests passed**, 0 failed/cancelled/skipped, 5969.4634 ms
  on the final rerun (preceding full run: 6354.4401 ms).
  Five additive tests cover pointer commit/cancel/lost capture, pointer-ID and
  primary-contact guards, 90 BPM mixed-section phase/fade/gain/pattern/history
  preservation and atomic invalid-destination rejection.
- The targeted mobile/Arrangement suites passed **32/32** before the full run.
  VS Code test discovery did not discover these plain Node tests; the existing
  `node --test` runner was used instead.
- Two static builds matched: **64 assets**, version
  **`9f451b9c0eeb830e84fa`**.
- Final syntax/text/whitespace results are recorded in the validation closure
  below. Existing tests and numerical audio thresholds were not weakened.

### Validation closure

All **128 JS/MJS** repository modules passed `node --check`, including vendored
modules. All **167** tracked/unignored repository text files passed strict UTF-8
decoding. `git diff --check` passed; Git emitted only LF-to-CRLF conversion
notices. The build remains `9f451b9c0eeb830e84fa` after documentation/test-only
updates. No tests were removed.

Node reproduction in PowerShell:

```powershell
$tests = @(Get-ChildItem tests -Filter '*.test.js' -File -Recurse | Select-Object -ExpandProperty FullName)
node --test $tests
```

Production builds use `node scripts\build-static.mjs` twice. Browser fixtures export host-side
Playwright functions and run against a local static server on disposable
origins. Run the new Arrangement fixture on an empty origin, then the Rack
fixture on that same saved origin. The Sample/transport sequence must share
one page before the portable fixture. Do not execute against personal projects.
The owned static server and initial headed Edge process were stopped after
acceptance. Disposable browser profiles and the failed-run screenshot were
removed; no user browser profile was modified.

## Executed Chromium browser results

### Arrangement and Mixer

[The maintained fixture](./tests/mobile-arrangement-browser.js) created a
project through the UI at 390x844 with audio, Sampler and Drum Rack tracks.
It imported an actual synthetic WAV file, assigned sources, entered a Piano
note and drum step, then edited the Arrangement.

| Numerical/action check | Executed result |
|---|---|
| Zoomed clip movement | 31.19921875, 39 and 48.75 measured px/beat; clip start moved exactly 0 -> 1 -> 2 -> 3 beats |
| Left/right trim | Both committed; left trim retained offset 1 beat and start 4 beats; Undo/Redo exact |
| Scrolled ruler seek | Exactly beat 3 / 1.5 seconds at 120 BPM |
| Loop start/end | Exactly beats 2 and 4; cancelled loop movement restored both state and brace geometry |
| Cancelled clip/range/seek | Previous data/selection/insertion retained |
| Scroll over audio clip | No clip/project edits |
| Mixed section duplication | Three intersections retained correct track/time/offset metadata and independent copied patterns |
| Section Undo/Redo | Whole pre-duplicate state restored; Redo reapplied |
| Explicit section paste | Beats 24-32 on the intended three tracks |
| Selected Mixer | Volume 0.6, pan -0.25, Mute/Solo persisted; overlay survived rerender |
| Real meter | Native playback produced nonzero visible meter activity |
| Devices | Add Utility/Delay, bypass, reorder and remove persisted |

The same complete fixture passed against the **built `/dist/` subpath**, not
only source files. Both runs reported no page errors. Layout checks passed at
320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390.
These seven layout checks are not a full seven-size interaction matrix.

### Other UI and safety regressions

- The existing mobile fixture passed **49 workspace/layout cases**, plus
  expanded Piano drawing, additive selection, move/pitch/resize, velocity/
  note cancellation, Undo/Redo, scroll, Back and persistence. No page errors.
  Primary mobile navigation/Play/Stop targets remained at least 44px.
- [The Rack fixture](./tests/mobile-drum-browser.js) passed the 1-32-pad workflow
  described above and seven-size no-page-overflow checks with 32 pads/rows.
- The maintained instrument workflow passed without forced Piano clicks:
  independent Rack/Sampler patterns, sample assignments, Device Panel edits,
  reload and five-width no-overflow checks.
- Synthetic Recording Studio safety passed delayed-permission/capture
  navigation guards, enabled emergency Stop and actual AudioContext suspension
  recovery: **16384 frames, RMS 0.10606348344229255,
  peak 0.15000000596046448**, stream ended.
- This safety fixture now waits for at least 16384 **actual buffered frames**
  before suspending. A fixed 500ms delay initially stopped before a complete
  buffer was received and correctly produced the application's visible no-take
  message. A wall timer is not evidence that recoverable PCM exists.

## Audio and portable verification

Executed shared Sample/transport/Mastering fixtures measured:

| Measurement | Result |
|---|---:|
| Sample -6 dB gain | -5.986288636221118 dB |
| Sample +6 dB EQ | +6.009100786716582 dB |
| Sample low-pass attenuation | -39.95234112161655 dB |
| Native compressor RMS response | +7.5885802846503045 dB |
| Saved sample | 192000 frames at 48000 Hz; RMS 0.05657597681720708; peak 0.08001953363418579 |
| Once-only Save level error | +0.0011414375768613102 dB |
| Dry synthetic take in connected transport fixture | 10145 frames; RMS 0.10606534985812976; peak 0.15000000596046448 |
| Master -6 dB output | -5.980119437770263 dB |
| Master +6 dB EQ | +6.002043089931147 dB |
| Actual master gain reduction | 19.81726392913916 dB |

Native compressor makeup can increase RMS; no negative attenuation claim is
made from that positive result. Five-width Sample EQ/rotary/waveform/numeric
touch regressions, source retention, Save once, instrument sample reuse,
recording-safe Space, live backing, master A/B/pause/stale analysis and cleanup
passed. The scalar measurements above were taken in the shared fixture's
desktop phase, not certified on a physical phone.

### Actual 390px downloads and empty-origin restoration

[The portable fixture](./tests/workspace-portable-browser.js) now reads actual
Playwright download files instead of replacing anchor-click behavior.

- Downloaded **812841-byte .EHS**; target origin verified
  `autosave: null`, IndexedDB asset count **0** before import.
- Two assets restored; track/instrument/pattern/clip/effect/master settings
  compared exactly; decoded source PCM shapes and SHA-256 hashes identical.
- Reference/repeated/restored renders: **1336230 frames, stereo, 44100 Hz**.
  Repeated render was bit-identical in this run.
- Restored render: max absolute error **0.000018358230590820312**,
  RMS error **7.969787465831201e-7**. Existing gates remain **1e-4 max**
  and **1e-6 RMS**. The restored render was **not bit-identical**.
- Restored actual playback FFT: **996.09375 Hz**.
- Downloaded WAV decoded to **1454400 stereo frames at 48000 Hz**,
  RMS **0.04345368686134276**, peak **0.2851716876029968**.
- Downloaded MP3 decoded to **1455751 stereo frames at 48000 Hz**,
  RMS **0.04343385562962199**, peak **0.28513336181640625**.
  Decoded sample rate is the independent decoder's rate, not an encoded-header
  sample-rate claim; MP3 duration includes encoder padding.
- Both decoded levels matched the committed reference mix within the unchanged
  0.15 dB gate. Container v1 and schemas 1/2 remain unchanged.

This verifies an **empty origin in the isolated browser**, not a second browser
profile. The fixture project contains instrument clips, audio and a synthetic
recorded take. It is not the 32-pad project's portable round trip or the full
22-step phone-authored project.

### Harness findings

The integrated hidden-page issue was not treated as an application failure.
An independent Edge 156.0.4314.50 launch with an isolated persistent test profile
and Playwright was used. A separately attached headed/CDP context gave unreliable
touch delivery; the successful runs used Playwright-launched **headless Edge**
with genuine visible document state and touch emulation. No visibility spoof,
forced hidden click, fake FFT or direct project-state edit was used to pass.

Large compressed PCM numeric arrays subsequently stalled host/browser argument
transfer. Base64 now carries exactly the same compressed bytes; downloads use
the same bounded binary representation for import/decoding. This changes test
transport only, not archives, PCM, DSP, thresholds or application limits.
The connected sample/transport tests must share a page: reloading between them
correctly loses unsaved Sample Studio editor state.

Early touch runs also exposed scrolled/covered fixture targets and premature
wall-time assertions. Target-specific, non-forced hit testing and actual
buffer-frame waits are now used. The broad 49-case fixture required reruns;
these results are not a claim of repeated-run, flake-free UI certification.
Retain target/hit-test stability in the remaining full interaction matrix.

## Connected 22-step acceptance ledger

These are component results, **not one accepted connected phone scenario**.

| Step | Evidence / remaining work |
|---|---|
| 1 Open at 390px | Passed. |
| 2 New project | Passed through Project controls. |
| 3 Import/record sample | Mobile file import passed; Sample editor import covered separately. |
| 4 Waveform edit | Shared five-width touch regression passed; not connected to the new phone song. |
| 5 Effects/live preview | Shared signal and five-width touch checks passed. |
| 6 Save sample | Once-only Save measured; final Save performed in the shared desktop phase. |
| 7 Create Rack | Passed at 390px. |
| 8 Assign samples | Passed at 390px, including distinct sources. |
| 9 Drum pattern | Passed, including velocity/length. |
| 10 Create Sampler | Passed at 390px. |
| 11 Piano melody | Actual touch note creation/editing passed. |
| 12 Arrange clips | Zoomed move, trim, seek/loop and cancel passed at 390px. |
| 13 Multi-track section | Exact time/track bounds and mixed intersections passed. |
| 14 Duplicate section | Three-track duplicate/Undo/Redo/paste passed. |
| 15 Recording Studio | Mobile guarded navigation passed. |
| 16 Synthetic take | Mobile interruption recovery and separate normal desktop stop/save passed. |
| 17 Trim/review recorded take | **Not executed as part of the mobile scenario.** |
| 18 Mix tracks | Mobile selected Mixer/device actions and actual meter passed. |
| 19 Master song | Live shared desktop signal regression passed; complete mobile module/FFT/analysis review remains. |
| 20 WAV/MP3 | Actual downloads/independent decode passed at 390px on the restored fixture. |
| 21 Save .EHS | Actual phone-width archive download passed on the transport fixture. |
| 22 Empty-origin restoration | Exact settings/source hashes, numerical render and playback passed at 390px. |

## Modified files

Production:
[src/app.js](./src/app.js),
[src/arrangement-workspace.js](./src/arrangement-workspace.js),
[src/mobile-workspace.js](./src/mobile-workspace.js),
[src/mobile.css](./src/mobile.css),
[src/workspace.css](./src/workspace.css).

New tests:
[tests/mobile-arrangement.test.js](./tests/mobile-arrangement.test.js),
[tests/mobile-arrangement-browser.js](./tests/mobile-arrangement-browser.js),
[tests/mobile-drum-browser.js](./tests/mobile-drum-browser.js).

Updated fixtures:
[tests/mobile-workspace-browser.js](./tests/mobile-workspace-browser.js),
[tests/instrument-workflow-ui.js](./tests/instrument-workflow-ui.js),
[tests/workspace-transport-browser.js](./tests/workspace-transport-browser.js),
[tests/workspace-portable-browser.js](./tests/workspace-portable-browser.js).

Documentation:
[README.md](./README.md), [IDEA.md](./IDEA.md),
[BATCH_005B_5_REPORT.md](./BATCH_005B_5_REPORT.md),
[BATCH_005B_5_MOBILE_UX_AUDIT.md](./BATCH_005B_5_MOBILE_UX_AUDIT.md), this report.
The format specification remains applicable without modification.

## Cross-workspace checklist and exact remaining gates

- [x] Arrangement touch coordinates, section clipboard/history and selected Mixer.
- [x] Sampler/Piano modes, cancellation and keyboard/row alignment regression.
- [x] Dynamic Rack 1-32 pads, assignment/removal/mapping/velocity/reload.
- [x] Sample live shared effects, Save once and source identity regression.
- [x] Recording guarded navigation, dry capture and buffered interruption recovery.
- [x] Master live output/EQ/reduction, A/B/pause/cache semantics regression.
- [x] Phone-width real WAV/MP3 and empty-origin .EHS verification.
- [ ] One connected phone-authored 22-step workflow, especially sample Save,
  recorded-take review/trim and complete mobile Mastering.
- [ ] Full representative touch matrix at all seven sizes, including committed
  range gestures, arbitrary track transfers, section handles, device expansion/
  focus and every specialized workspace. Existing layout passes are not this.
- [ ] Remaining Sample waveform/navigation/preview ergonomics and complete
  Recording count-in/backing/review, Mastering module/analysis and Export
  metadata/artwork/progress/cancel phone acceptance.
- [ ] Physical iOS/Android, virtual keyboard, real microphone latency/OS
  interruption, Firefox and Safari/WebKit.

No hardware performance/latency certification or background mobile recording
claim is made. Continue 005B.5 from these specific gates; do not rebuild the
shared models or begin 005B.6 yet.
