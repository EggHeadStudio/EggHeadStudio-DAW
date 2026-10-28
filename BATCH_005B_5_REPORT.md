# Batch 005B.5 - Mobile production UX foundation

## Status

**BATCH 005B.5 INCOMPLETE - SPECIFIC REQUIREMENTS REMAIN**

This is a coherent, tested mobile navigation and editing milestone, not full
mobile production acceptance. Do not advance to 005B.6 on this evidence alone.
No commit, push or deployment was performed.

The [before/after audit](./BATCH_005B_5_MOBILE_UX_AUDIT.md) records the prioritized
findings. Existing DSP, project schemas, .EHS v1, independent clips, Recording
Studio, live Sample Studio effects and Mastering audition are preserved.

## Implemented architecture and behavior

- One guarded workspace entry point serves existing desktop navigation and the
  mobile Back/Arrangement/workspace chooser. The seven destinations are
  Arrangement, Sampler, Drum Rack, Sample Studio, Recording, Mastering and Export.
  Navigation history is bounded, transient UI state, not project data.
- Below 850px, the original transport controls are reorganized into a compact
  shell and secondary Tempo disclosure. Desktop controls return to their
  original locations above that breakpoint. No duplicate transport handlers or
  audio graphs are created.
- Existing Piano Roll, drum steps, pad inspector, sample stage, EQ and Device
  Panel surfaces can expand. Done/Back/Escape, focus restoration and modal
  keyboard containment are provided. Hidden empty editors are not expandable.
  Local Piano Roll redraws retain the expanded presentation.
- Piano Roll offers Draw/move, additive Select and native Scroll modes. These
  use the existing beat/row coordinate system and note velocity model.
  `pointercancel` rolls notes, selection and Undo/Redo back to the gesture
  snapshot; cancellation does not save changed notes.
- Arrangement range selection and clip editing are mutually exclusive.
  Mobile drum step targets are enlarged.
- Recording capture and pending microphone acquisition block workspace changes
  and expansion. The existing emergency global Stop remains available.
- FFT analysis detaches while a different expanded editor covers its surface.
  This changes presentation work, not the audio processing path.
- Browser geometry tests uncovered a genuine pitch-grid defect: generic studio
  button minimum heights overrode musical row sizes. A late, specificity-matched
  exclusion now keeps Piano keys, notes and velocity bars in their authoritative
  geometry. Key/row alignment is checked at every accepted layout.

## Modified files

New:

- [src/mobile-workspace.js](./src/mobile-workspace.js)
- [src/mobile.css](./src/mobile.css)
- [tests/mobile-workspace.test.js](./tests/mobile-workspace.test.js)
- [tests/mobile-workspace-browser.js](./tests/mobile-workspace-browser.js)
- [BATCH_005B_5_MOBILE_UX_AUDIT.md](./BATCH_005B_5_MOBILE_UX_AUDIT.md)
- This report.

Updated:

- [index.html](./index.html)
- [src/app.js](./src/app.js)
- [src/arrangement-workspace.js](./src/arrangement-workspace.js)
- [src/eq-visualizer.js](./src/eq-visualizer.js)
- [src/piano-model.js](./src/piano-model.js)
- [src/sampler-ui.js](./src/sampler-ui.js)
- [src/studio-workflows.js](./src/studio-workflows.js)
- [tests/workspace-workflow-ui.js](./tests/workspace-workflow-ui.js)
- [README.md](./README.md)
- [IDEA.md](./IDEA.md)

The older workspace workflow fixture now enters mobile workspaces through the
real chooser and explicitly selects Draw mode. Its complete workflow was not
rerun in this milestone; the dedicated acceptance below was executed instead.

## Automated and browser evidence

### Node and build

- Intake: **310/310** Node tests passed, 6121.5041 ms.
- Final: **315/315** passed, zero failed/cancelled/skipped, 5895.8292 ms.
  The five added tests cover workspace catalog, guarded/bounded navigation,
  gesture cancellation, preserved note-array identity and exact Undo/Redo
  restoration, including the full 100-entry history.
- Two static builds produced the same **64 assets** and version
  **`a077efefdde2d22aa808`**.
- Final syntax checks passed for all **125 JS/MJS** repository modules,
  including vendored modules. Strict UTF-8 decoding passed for **163**
  tracked/unignored repository text files. `git diff --check` passed
  (Git emitted only its existing LF-to-CRLF conversion notices).
- Built-subpath smoke at `/dist/` loaded the above version, reached Ready,
  loaded 54 versioned resources with HTTP 200, and displayed the mobile
  navigation without page overflow at 390px and 320px. This is a startup/layout
  smoke, not built-artifact audio or full production acceptance.
- No dependencies or archive limits changed.

### Chromium mobile UI

The initial audit inspected 47 workspace/layout cases before implementation.
The final dedicated fixture passed **49 workspace/layout cases** at
320, 360, 390, 430, 768 and 1280px widths, plus 844x390 landscape.

- No page-level overflow.
- Compact header measured 101px in mobile/landscape cases and 54px desktop.
  The old 320px header alone measured 177px, plus 59px navigation.
- Primary mobile navigation and Play/Stop targets measured at least 44px.
  This is not a claim that every dense grid cell/native input is 44px.
- Actual expanded Piano interactions created two notes, selected additively,
  moved notes in time and pitch, resized the identified note, and exercised
  Undo/Redo, cancelled note and velocity gestures, native scroll without extra
  notes, Back and reload persistence.
- Key 60 and its pitch lane have matching top/height across layouts.
- Expanded editor state survives note redraws; Arrangement modes are exclusive.
- No page errors were captured.

Touch evidence uses synthetic Chromium pointer/touch interactions on Windows,
not physical Android or iOS. The six widths are not a complete portrait and
landscape matrix for every workspace and gesture.

### Recording safety

The dedicated synthetic microphone fixture passed pending-permission and
capture navigation guards, emergency Stop availability, and interruption by
actual `AudioContext.suspend()`. The buffered dry take was saved:

- 16384 frames.
- RMS 0.10609276324065178.
- Peak 0.15000000596046448.
- Microphone stream ended after cleanup.

This verifies the tested interruption/recovery path, not physical microphone
latency, mobile OS background recording or every permission/storage failure.

### Executed shared-audio regressions

The existing cross-workspace fixtures were rerun, not inferred from Node tests:

| Signal/workflow | Measured result |
|---|---|
| Sample live gain | -6.018155053845459 dB |
| Sample EQ boost | +6.0015380210136895 dB |
| Sample low-pass attenuation | -39.98855250707068 dB |
| Native compressor RMS change | +7.583897138906526 dB |
| Master live output | -5.9853263573799484 dB |
| Master live EQ | +5.996770216517647 dB |
| Master gain reduction | 19.817286652470823 dB |
| Cross-workspace dry synthetic take | 12063 frames, RMS 0.10606583860823386 |

Native compressor makeup can raise RMS while gain reduction increases; the
positive RMS change is not reported as attenuation. The fixtures also exercised
five-width EQ/rotary/waveform/numeric controls, retained preview source identity,
Save-once behavior, Sampler attack/fine tuning, pad gain, real notes/steps,
sample reuse, backing playback, recording-safe Space, A/B/pause/cache and cleanup.
No page errors were captured in these regressions.

## Compatibility and portability

No DSP algorithms, scheduler intervals, encoder settings, .EHS container version
or persistent project schema were changed. Navigation/expanded presentation and
touch modes are transient; note changes use existing notes and persistence.
The 315-test suite includes the existing archive/project/audio regression tests.

The fresh browser portability/export rerun did **not** complete. One attempt
timed out waiting for restored-playback FFT after the test page was backgrounded.
A standalone retry with `bringToFront()` timed out waiting for a visible/stable
Project menu click; inspection still reported `document.visibilityState` as
`hidden`, despite valid viewport dimensions and visible element styles.
These are unresolved browser-harness acceptance failures, not passing exports
or evidence of an archive-corruption defect. Do not weaken the signal checks
or force clicks to call them accepted. Repeat with a genuinely foregrounded
browser. Passing historical 005B.4B evidence is not substituted for this batch's
execution. The full phone production/export/restoration sequence has **not**
been accepted.

## Cross-workspace regression checklist

- [x] Guarded navigation, compact shell, primary targets and expanded presentation.
- [x] Piano Draw/Select/Scroll, move/pitch/resize, cancellation and Undo/Redo.
- [x] Recording navigation safety and suspended-context synthetic dry-take salvage.
- [x] Live Sample effects, source retention, Save once and instrument reuse.
- [x] Live Mastering audition, EQ/FFT and recording-safe transport.
- [ ] Complete Arrangement touch move/resize/range/section-copy workflow.
- [ ] Selected-track mobile Mixer ergonomics and complete device workflow.
- [ ] Full 1-32-pad mobile selection/assignment/removal/inspector acceptance.
- [ ] Full phone WAV/MP3 and clean-origin .EHS production round trip.
- [ ] Physical Android/iPhone, Firefox/WebKit and virtual-keyboard acceptance.

## Specific remaining requirements and handoff

1. Finish the standardized pinch/two-finger/long-press gesture architecture where
   applicable, without conflicting with native scrolling and musical editing.
2. Verify and finish Arrangement touch clip movement, boundary resize, range
   editing, loop and complete section duplication through the real mobile UI.
3. Finish selected-track Mixer ergonomics and the specialized Sample, Recording,
   Mastering and Export phone workflows. Expanded surfaces are a foundation,
   not proof that each long production workflow is efficient.
4. Accept dynamic Drum Rack sizes through 32 pads, sample assignment/removal,
   inspector, steps and velocity on mobile.
5. Execute all 22 requested phone production steps together: import/record,
   waveform edit, effects, instruments, arrangement/section copy, overdub/trim,
   mix/master, WAV/MP3, .EHS export, empty-origin import and restored sound.
   Do not substitute direct model editing for this UI workflow.
6. Test real Android/iPhone, Safari/WebKit and Firefox when available, including
   virtual keyboard, orientation, OS interruptions and real audio hardware.

There are no claimed mobile hardware performance measurements in this report.
The existing project/DSP interfaces remain the basis for the remaining work;
do not add a separate mobile model, audio engine or mandatory backend.
