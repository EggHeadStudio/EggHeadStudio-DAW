# Batch 005B.5F — Mobile focus, performance and scrollbar checkpoint

## Status

**BATCH 005B.5F INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

This checkpoint implements a shared, reversible focus surface, landscape
suggestions, playable Sampler and Drum Rack performance surfaces, and shared
cross-browser scrollbar styling. The 005B.5F.2 continuation verifies live
instrument output and an instrument-project `.EHS` round trip in Chromium, but
does not complete the connected mobile production workflows or certify
physical-device input/audio, Edge, Firefox or installed-PWA behavior.

## Implemented

- `src/mobile-focus.js` adds a reusable full-screen presentation of existing
  editor DOM. It preserves project/editor state, adds a Done/Escape exit and
  focus restoration, supports remembered per-workspace focus/continue choices,
  and only prompts on a portrait-to-landscape transition. It does not force
  orientation or recreate audio graphs. Mounting is idempotent for a workspace
  that is still mounted.
- `src/mobile-performance.js` adds a chromatic Sampler keyboard with one-to-four
  visible octaves, octave shifting, user-selected touch velocity and sustain,
  plus a 16-pad Drum Rack surface with bank switching and selected-pad settings
  handoff. Both use the current track, sample buffers, pad IDs and AudioEngine.
  Active voices are released on pointer cancellation, range/bank changes, focus
  exit and workspace teardown.
- `src/audio.js` adds live AudioEngine preview voices for held Sampler notes and
  Drum Rack hits. Sampler pitch/region/envelope/release use the existing
  instrument settings and route into the existing track/effect graph. Drum
  voices use the assigned sample and pad gain/pitch/pan/mute settings.
- `src/drum-rack-ui.js` handles the performance surface's selected-pad settings
  handoff through the existing pad selection model.
- `src/workspace.css` defines shared scrollbar tokens, standard
  `scrollbar-width`/`scrollbar-color` styling, and a WebKit pseudo-element
  fallback only when standard color styling is unavailable.
- `src/mobile.css` provides the focus and instrument performance layouts.
- Added unit tests for focus preference handling, pointer concurrency,
  cancellation/sustain races, bank mapping and AudioEngine routing parameters.

Focus surfaces for Sample, Recording, Mastering, Export and Arrangement reuse
their existing UI rather than introducing a second state model. They are
presentation-only; dedicated simplified workflows/modules requested for those
workspaces remain incomplete.

## Cross-workspace scrollbar styling and verification

The shared tokens in `src/workspace.css` apply to native scroll containers
throughout the app. Firefox and Chromium-family browsers supporting standard
scrollbar properties use thin scrollbars with a transparent track and
charcoal/blue-gray thumb; hover-capable standard implementations brighten the
thumb while the scroll container is hovered. The WebKit fallback specifies a
6px thumb/track, rounded thumb, no arrow buttons and a restrained hover color.
The rules do not change `overflow`, scroll coordinates, element widths or
timeline/piano/waveform gesture logic. Touch scrolling remains native.

The integrated Chromium browser loaded the source app and reported
`scrollbar-width: thin` and the expected token color. Its Arrangement page
showed no document-level horizontal overflow at 320x740, 360x800, 390x844,
430x932, 768x1024, 1280x900 or 844x390. Focus entry/exit, landscape prompt,
Continue, remembered Continue, remembered Focus and repeated orientation
behavior were exercised in that browser.

Installed Edge 156.0.4314.56 and Firefox 153.6.0 were launched headlessly
against the local source app. Both reported standard scrollbar-property
support and the expected computed charcoal thumb/transparent track in a
scrollbar probe. Before/after probe screenshots show Edge's bright default
scrollbars replaced by the thin dark token styling; Firefox retains its native
overlay/auto-hide presentation with the token colors. Full-app after screenshots
were also captured in both browsers. The before images are isolated native
scrollbar probes, not screenshots of an earlier app revision. These browser
runs were visual/CSS checks only, not mouse, keyboard, wheel or touch
interaction tests. Chromium PWA standalone styling was not separately
exercised.

The browser probe directly verified computed scrollbar support/color in Edge
and Firefox. These screenshot runs do not prove native mouse-thumb, wheel,
keyboard or touch scrolling for every individual workspace. Browser-native
scrolling and all musical coordinate systems were left unchanged.

## Validation and evidence

- Baseline before this continuation: **327 Node tests passed**.
- Focused new tests: **14 passed** across
  `tests/mobile-focus.test.js`, `tests/mobile-performance-audio.test.js` and
  `tests/mobile-performance-audio-routing.test.js`.
- Final full Node suite: **341 passed, 0 failed**.
- `node --check` passed for all changed JavaScript modules and new tests.
- Two consecutive static builds produced version `0b0898958eda813c20ba`
  (68 source assets); the SHA-256 manifests for all 1,695 `dist` files
  matched across both runs.
- `git diff --check` passed.
- JavaScript syntax checks cover modified application modules.
- Chromium viewport checks cover Arrangement/focus layout only; the seven sizes
  are not a complete workflow test for every workspace.
- AudioEngine unit tests verify source routing, pitch, release scheduling, pad
  gain/pan and cancellation. A separate integrated-browser check ran the
  production `AudioEngine.render()` with a real `OfflineAudioContext`: a
  Sampler output measured 261.58 Hz for a MIDI 60 note rooted at MIDI 69, and
  a Drum Rack output measured 879.97 Hz for a 440 Hz sample pitched up one
  octave. Both outputs had nonzero rendered RMS and peak levels. This verifies
  actual offline Sampler/Drum PCM generation. At the 5F.1 checkpoint, live
  playback was still unverified; that specific gap is superseded by the
  real-time Chromium measurements in the 5F.2 continuation below.
- Three production instrument-scheduling tests cover simultaneous pitched
  voices, assigned Drum Rack pad sample/gain/pitch/pan and muted/unassigned
  pads. They test event scheduling and do not simulate rendered PCM.
- Existing regression tests remain in the full Node test command. No project
  schema, `.EHS` format, PWA worker, service-worker cache policy, or audio
  rendering threshold was changed.
- No device, deployment or physical microphone test was performed.

## Batch 005B.5F.2 continuation

The focused continuation verifies actual real-time AudioContext output from
the Performance Mode UI and a UI-exported `.EHS` archive imported on a clean
browser origin. See the [5F.2 acceptance report](./BATCH_005B_5F_2_REPORT.md)
for the requirement-by-requirement results, signal measurements and remaining
blockers.

## Batch 005B.5F.3 continuation

The 5F.3 work adds task-stage navigation and pinned existing controls in the
Sample Studio, Mastering and Export focus surfaces, plus track-scoped source
cleanup for instrument removal/reconfiguration. This is a partial workflow
implementation, not acceptance of connected mobile production. Recording/
recovery, meaningful-audio export, built-app workflows, live instrument
lifecycle behavior, trusted input and physical-device testing remain open. See
the [5F.3 report](./BATCH_005B_5F_3_REPORT.md) for the full
requirement-by-requirement status.

- Chromium's real-time AudioContext advanced at 48 kHz. Sampler MIDI 57 from
  the restored 220 Hz sample produced a 222.66 Hz FFT peak; its ADSR values
  restored as attack 0.12 s, decay 0.10 s, sustain 0.40 and release 0.20 s.
  Note cancellation and focus exit decayed to near-zero analyser RMS.
- Drum Rack performance output was measured for simultaneous assigned pads
  and for Pad 17 in Bank 2. Live EQ low-cut at 1 kHz reduced the 220 Hz pad
  output relative to bypass; the effect remained enabled with its 1 kHz
  setting after `.EHS` import. Pad mute disabled triggering and produced no
  measured output.
- An app-generated 181,225-byte `.EHS` archive was imported on a fresh origin
  with no pre-existing localStorage keys. The UI reported two audio assets
  verified and restored. The browser harness did not emit a native download
  event, so it transferred the app-generated archive Blob to the clean-origin
  Open .EHS file input; it did not inject project state or change the archive.
- Pointer inputs were synthesized because the browser automation helper did
  not deliver trusted pointer events. These measurements verify the live audio
  graph and event handlers, not physical touch, native pointer capture or
  device latency. AudioContext suspension/resume through a trusted user gesture
  remains blocked by the same automation limitation.

## Files changed

- `src/mobile-focus.js`
- `src/mobile-performance.js`
- `src/audio.js`
- `src/app.js`
- `src/drum-rack-ui.js`
- `src/mobile.css`
- `src/workspace.css`
- `tests/mobile-focus.test.js`
- `tests/mobile-performance-audio.test.js`
- `tests/mobile-performance-audio-routing.test.js`
- `BATCH_005B_5F_REPORT.md`
- `BATCH_005B_5F_MOBILE_UX_AUDIT.md`
- `BATCH_005B_5F_2_REPORT.md`
- `MOBILE_PERFORMANCE_MODES.md`
- `README.md`
- `IDEA.md`

## Requirements still open

1. Live Sampler and Drum Rack output, note-off, simultaneous voices, pad bank
   mapping and cancellation were measured in Chromium. Still verify trusted
   native pointer capture and AudioContext suspension/resume via actual user
   input, then repeat on target browsers/devices; synthetic pointer tests do
   not certify physical touch or latency.
2. Complete per-workspace connected workflows at all requested viewports,
   including Sample Studio save/cancel and transport, recording emergency Stop
   and recovery, Mastering A/B/render state, Export progress/cancel and separate
   `.EHS` handling, Arrangement gestures, Mixer alignment and Piano Roll/sample
   waveform coordinates.
3. Instrument settings and two sample assets survived a clean-origin `.EHS`
   round trip. Exercise additional real projects, recording recovery and
   broader workspace state through portable round trips.
4. Exercise native mouse-thumb, wheel, keyboard and touch scrolling in Edge and
   Firefox across each workspace; test Chromium installed-PWA/standalone
   rendering. The scrollbar before/after probe and full-app after screenshots
   are saved in session artifacts.
5. Test physical Android/iOS touch, orientation, audio latency, microphone
   recovery and accessibility. No physical-device compatibility is claimed.

No commit, push or deployment was made.

## Batch 005B.5F.4 continuation

Mobile Arrangement now has selected-clip actions, long-press and explicit
movement, Trim-mode handles, cancellable midpoint-anchored pinch zoom, and
snapped playhead sample insertion. Source Chromium touch emulation verified
selected clip movement, snapped trimming, pinch anchor preservation and
cancellation; the deterministic build was only smoke-tested. Cross-track
movement, gesture Undo/Redo, full responsive workflow acceptance, built-app
gesture testing and physical-device input remain open. The batch is incomplete;
see [BATCH_005B_5F_4_REPORT.md](./BATCH_005B_5F_4_REPORT.md) and the
[mobile Arrangement gesture guide](./MOBILE_ARRANGEMENT_GESTURES.md).

## Batch 005B.5F.5 continuation

The 5F.5 follow-up closes several browser-verifiable Arrangement items:
source Chromium verified explicit/long-press movement, both trim edges,
compatible and rejected cross-track movement, Duplicate/Delete and their
Undo/Redo paths at 390x844. The deterministic build verified long-press move,
Undo/Redo and end trim; all seven requested viewport widths/heights received
layout-only overflow checks. Four host-side browser fixtures now reload after
setting the mobile viewport to avoid desktop-initialized state in mobile
acceptance runs.

This does not complete 005B.5F.5. Connected production workflows,
pointer-cancellation/lost-capture acceptance, multi-viewport gestures,
source/build project-state parity, active-voice browser measurements,
clean-origin connected `.EHS`, PWA regression and physical-device input remain
open. The full requirement table and test evidence are in
[BATCH_005B_5F_5_REPORT.md](./BATCH_005B_5F_5_REPORT.md); use the
[physical-device checklist](./MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md) for
later user-led testing.
