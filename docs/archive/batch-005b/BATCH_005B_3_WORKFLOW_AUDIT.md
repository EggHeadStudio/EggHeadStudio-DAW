# Batch 005B.3 - Production workspace workflow audit

## Scope and evidence

Audited the running Arrangement, Devices, Piano Roll, Drum Rack, Sample Studio,
Recording Studio, Mastering and Export workspaces, their source and the 005B.1 /
005B.2 reports. This is an incremental vanilla-JavaScript workflow refinement,
not an application rebuild, new DSP system or Session View.

The prior Arrangement rows measured 238 px on desktop, with taller responsive
rules. That made even a small song unnecessarily tall. Device and studio controls
worked but did not consistently communicate the next production action.

## Official Live 12 references

Consulted these official references as interaction guidance:

- [Arrangement View](https://www.ableton.com/en/live-manual/12/arrangement-view/):
  compact song overview, track heights and contextual editing.
- [Working with Instruments and Effects](https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/):
  selected-track device context and an ordered processing chain.
- [Editing MIDI](https://www.ableton.com/en/live-manual/12/editing-midi/):
  separating time/pitch/duration editing from velocity and source configuration.
- [Recording New Clips](https://www.ableton.com/en/live-manual/12/recording-new-clips/):
  arming, backing playback and recording/review as a coherent workflow.
- [Instrument, Drum and Effect Racks](https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/):
  selected-pad context and reusable devices.
- [Simpler](https://www.ableton.com/en/live-manual/12/live-instrument-reference/#simpler):
  source/sample configuration separated from musical note editing.

Adapted these principles to the existing browser application. No Live assets,
proprietary artwork, new warp engine, Session View or feature-parity claim.

## Before / after

| Workspace | Before | Implemented refinement |
|---|---|---|
| Arrangement | Tall fixed rows; detailed controls consumed the song overview | 84 px default rows, per-track Expand/Compact, numeric expanded height, track type/color/name and independent-pattern action |
| Right Mixer | Detailed vertical strip at all times | The same bound volume range becomes horizontal when compact and vertical when expanded; pan, M/S, FX/Edit and actual meters remain |
| Track ordering | No direct workspace reorder affordance | Expanded Earlier/Later actions use Arrangement undo checkpoints and preserve stable track identity |
| Devices | Selected-track chain already worked, but height/density were fixed | Keyboard/mouse/touch height separator, compact device presentation, explicit Hide devices, existing instrument-first context |
| Piano Roll | Flat toolbar mixed note setup, zoom and operations with source settings | Named Note setup / View / Note editing groups, selection count, source identity and folded region/envelope configuration |
| Drum Rack | Functional dynamic pads and step rows | Explicit Select Pad > Choose Sample > Edit Steps > Preview guidance, existing selected-pad inspector and selected step-row emphasis |
| Sample Studio | Capture, processing and save actions mixed around the waveform | Record/Import > Edit > Process > Preview > Save stages and keyboard-accessible jump navigation |
| Recording Studio | Advanced configuration competed with recording/review | Backing, armed track, count-in and Record/Stop prioritized; advanced monitoring, offset, punch and calibration folded |
| Mastering | Module grid/list, duplicate Output gain and generic controls | Actual ordered chain, module status/reorder actions, shared actual-value controls, separate analysis/audition and one Output gain owner |
| Export | Audio settings, release metadata and packaging lacked clear workflow divisions | Audio Export / Release Information / Release Package navigation; editable .EHS explicitly remains in Project |

## Arrangement and Mixer architecture

`src/workspace-layout.js` owns transient presentation state:

- Default height: 84 px; Expand: 240 px.
- Expanded numeric resizing: 220-400 px, finite, rounded and clamped.
- Heights follow stable track IDs through structural rerenders and reordering.
- One `--track-height` on the actual row sizes its header, lane and right Mixer.
  There is no independent Mixer-height array or scroll-offset alignment hack.
- Existing volume/pan inputs and project parameters remain authoritative.
  Expansion changes the volume wrapper orientation, not its audio binding.
- The waveform ResizeObserver also observes lanes, so resizing refreshes detail.
- Adding a track starts compact; removing it does not resize surviving tracks.
- Breakpoint defaults apply on first mount only. Explicit browser/Mixer choices
  are not repeatedly overwritten when crossing a responsive breakpoint.

Track ordering moves the original track objects, uses the existing Arrangement
history/save/rescheduling path, restores selected-track identity and clears an
index-based range selection. No PCM, pattern, device or sample duplication.

The Device Panel height is 160-600 px before responsive viewport constraints.
Its focusable separator supports Arrow Up/Down in 20 px increments, Home/End,
pointer/touch dragging and restoration on cancel/lost capture. Compact devices
hide redundant numeric/reset presentation, not parameters or processing.

Layout heights/density are in-memory workspace preferences, not song data.
Reload returns to the compact defaults; there is no project/archive migration.

## Existing handlers and production data stay authoritative

`src/studio-workflows.js` moves the existing wired DOM nodes into groups. It
does not clone controls, own another effect model or rewrite editors:

- Piano Roll notes/velocities retain their existing pattern IDs and data model.
- Source configuration still edits the selected track's sampler.
- Drum pads retain stable IDs/note mappings and their existing removal choices.
- Sample processing retains frame-based precision, original/processed preview,
  history, Save Sample, Create Sampler and Add to Drum Rack.
- Sample saving still creates a new lossless 32-bit float WAV asset. There is
  an explicit output description rather than a fake format selector.
- Recording keeps AudioWorklet PCM capture, placement, compensation and takes.
  Advanced state survives same-workspace remounts; busy controls remain covered
  by the existing disable rules.
- Emergency Stop and unsaved Retry Save / Download WAV remain outside Advanced.
- Mastering display follows Input > current user chain > Output gain > Limiter.
  The existing DSP puts the fixed final limiter after Output gain; the UI
  deliberately does not follow a generic list that would misrepresent this.
- Existing export quality, encoding, metadata, packaging, progress and
  cancellation controls are retained. Release ZIP is not a portable project.

## Defects found during acceptance

1. Numeric/reset/keyboard shared controls emitted `input`, but mastering commits
   on `change`. Discrete shared-control edits now emit both, preserving the
   original native binding. Continuous gestures still commit on release.
2. Normalized mastering crossovers could leave paired shared readouts stale.
   The existing synchronization path now updates enhanced controls too.
3. Breakpoint changes could undo an explicit Mixer visibility choice. Initial
   defaults are now separate from later user choices.
4. Recording remounts closed Advanced after saving. Its open state is retained.
5. Touch note move/resize could replace the dragged DOM node before the browser
   synthesized its click, accidentally adding another note. The note stays
   mounted through that click; the redraw runs next frame only if the same
   Piano Roll is still mounted. Actual edits/save remain immediate.

## Executed acceptance and remaining limits

- At 360/390/430/768/1280 px, 300 px and 84 px rows had identical header/lane/
  Mixer top coordinates and heights: maximum measured top delta **0 px**.
- Add/remove/reorder/scroll/Mixer toggle retained alignment and stable heights.
- Device separator keyboard/touch/cancel and compact density passed all widths.
- Piano Roll touch creation at beat 2, movement to beat 3 / pitch 65, resize to
  1.5 beats, Undo/Redo and horizontal/vertical scrolling passed all widths,
  with no extra notes from dragging or scrolling.
- Existing dynamic Drum Rack/velocity touch checks and 35-workspace layout
  audit passed. No horizontal page overflow in that tested scope.
- Desktop and 360 px Arrangement screenshots were inspected.
- Real Sample Save, Recording setup, Master bypass/value/reorder, Export
  settings/release fields and project reload passed through browser UI.

Compact rows deliberately use smaller density-oriented shortcuts. Expanded
tracks and dedicated editors expose detailed controls; this is not a claim that
every compact shortcut has a 44 px target. Navigation/lanes/devices can scroll
inside their own surfaces. Full-screen phone editors and bottom sheets remain
005B.5 work. No physical-device, WebKit/Firefox, full screen-reader or complete
WCAG certification.

005B.4 should implement genuine FFT analysis, logarithmic DSP response curves
and draggable EQ nodes using existing parameter bindings. Do not treat waveform
data as a spectrum or change DSP for visual convenience.

See [the implementation and verification report](./BATCH_005B_3_UX_REPORT.md).
