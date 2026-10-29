# Batch 005B.3 - Production workspace UX completion

**BATCH 005B.3 COMPLETE - READY FOR BATCH 005B.4**

Complete for the executed desktop Chromium and synthetic-touch scope below.
Physical-device and non-Chromium acceptance remain explicit limitations.
No commit, push or deployment performed.

## Implemented

- Compact 84 px Arrangement tracks, independent expansion and 220-400 px
  numeric resizing, stable-ID reorder actions and exactly aligned right Mixer.
- Shared real Mixer bindings across compact horizontal/expanded vertical volume
  presentation. Existing pan, M/S, effects access and measured meters retained.
- Resizable Device Panel with keyboard/pointer/touch/cancel, compact devices,
  explicit close and selected-track instrument-first context.
- Organized Piano Roll toolbar, selected-note count, visible sample identity
  and folded source configuration.
- Existing dynamic Drum Rack selected-pad workflow and matching step emphasis.
- Sample Studio's five-stage capture/edit/process/preview/save workflow.
- Vocal-first Recording layout; Advanced disclosure preserves open state.
  Emergency Stop and unsaved recovery remain directly accessible.
- Mastering modules presented in actual DSP order with status, reorder actions,
  shared controls and one Output gain editor; existing EQ graph retained.
- Export Audio / Release Information / Release Package organization, with
  portable editable .EHS clearly distinct.
- Narrow control-commit, crossover readout, breakpoint preference and synthetic
  Piano Roll click fixes discovered by executed acceptance.

See [the before/after workflow audit](./BATCH_005B_3_WORKFLOW_AUDIT.md) for official
Ableton reference links, architectural decisions and intentional differences.

## Modified files

| File | Purpose |
|---|---|
| `src/workspace-layout.js` (new) | Transient stable-ID track height, track ordering controls, Device Panel interaction |
| `src/studio-workflows.js` (new) | Reparent existing wired studio controls into production stages/groups |
| `src/workspace-ui.js` | Apply layout chrome and reorient the existing Mixer volume range |
| `src/arrangement-workspace.js` | Lane resize observation and initial-only responsive defaults |
| `src/workspace.css` | Compact/expanded rows, panel separator/density, grouped studio surfaces/status |
| `src/app.js` | Wire organizers, undoable track ordering, master focus and paired control sync |
| `src/recording-studio.js` | Organized recording/recovery controls and retained Advanced state |
| `src/sampler-ui.js` | Selection status and deferred post-gesture redraw to prevent extra notes |
| `src/ui-controls.js` | Dynamic range orientation and discrete native `change` commits |
| `tests/workspace-layout.test.js` (new) | Four layout model tests |
| `tests/workspace-workflow-ui.js` (new) | Maintained workspace and five-width Piano Roll touch acceptance |
| `tests/design-system-ui.js` | Expand track before testing detailed numeric/vertical Mixer controls |
| `tests/recording-browser-acceptance.js` | Open Advanced before existing timing/calibration/fault operations |
| `README.md`, `IDEA.md` | Current workflow, baseline and next-batch handoff |
| These two 005B.3 reports | Audit, measured evidence and scope limits |

No DSP, live/offline scheduler, archive/container, project migration, encoder or
recording placement algorithm was changed. No dependency added.

## Automated checks

| Check | Executed result |
|---|---|
| Full `node --test tests/*.test.js` | **283/283 passed**, 0 failed/skipped; final run 7559.385 ms |
| Preserved baseline | All original 279 tests retained; 4 new layout tests |
| `node --check` across source/tests/scripts | **106 modules passed** |
| Strict UTF-8 decoding | **114 source/test/style/script/document files passed** |
| `git diff --check` | Passed |
| Static build | **56 assets**, version `ca8d2c3e328365f29e02` |
| Built `/dist/` subpath browser smoke | 46 script/style requests, one matching version, 0 failed; saved tracks preserved |

The existing VS Code Test Explorer discovered no tests; the repository's Node
runner was used. No test assertions were weakened. Earlier browser fixtures
were adjusted only to expose controls moved into intentional disclosures.

## Browser and interaction results

Actual Chromium browser interactions ran on disposable local origins:

1. `tests/instrument-workflow-ui.js`: independent Drum Rack and Sampler creation,
   pattern/editor navigation, five widths and no page overflow.
2. `runWorkspaceWorkflowAcceptance`: starts with that fixture, tests compact/
   expanded shared volume state, 300 px resize, stable-ID reorder, temporary
   track addition/removal, scroll and Mixer visibility. At every tested width:

   | Width | Expanded row/lane/Mixer | Compact row/lane/Mixer | Maximum top delta |
   |---|---|---|---|
   | 360 | 300 / 300 / 300 px | 84 / 84 / 84 px | 0 px |
   | 390 | 300 / 300 / 300 px | 84 / 84 / 84 px | 0 px |
   | 430 | 300 / 300 / 300 px | 84 / 84 / 84 px | 0 px |
   | 768 | 300 / 300 / 300 px | 84 / 84 / 84 px | 0 px |
   | 1280 | 300 / 300 / 300 px | 84 / 84 / 84 px | 0 px |

   Device Panel keyboard resize, touch resize, touch cancellation and compact
   mode passed at all five widths. No horizontal page overflow or page errors.
3. The same fixture verified selected-track Devices, Piano Roll source settings,
   Sample Studio stage order and exact frame-32 marker, +3 dB processing, real
   sample save and enabled Create Sampler/Add to Drum Rack. It also checked
   Recording arm/count-in/offset, Stop visibility with Advanced closed, real
   Master bypass/numeric/keyboard/reorder, MP3 bitrate/release fields and reload
   persistence of tracks/mastering/release data.
4. `runPianoTouchWorkflowAcceptance`: synthetic touch at all five widths created
   a note at beat 2/pitch 64, moved to beat 3/pitch 65, resized to 1.5 beats,
   exercised Undo/Redo and scrolled both axes at 2x zoom. Count assertions prove
   no extra notes from move/resize/scroll.
5. Existing Drum Rack/velocity touch acceptance passed all five widths.
   The 35-case workspace audit found no page overflow or unnamed inputs.
6. Existing UX architecture and design-system browser acceptance passed,
   including six effect controls, focus/disable/bypass/persistence and visible
   live meter behavior. Detailed Mixer tests now intentionally expand the track.
7. Desktop and 360 px Arrangement screenshots were inspected after final layout
   changes. Navigation and timeline use bounded internal scrolling.

These are synthetic touch events in Chromium, not physical-device verification.

To reproduce the new UI checks, serve the repository statically and give a
Playwright Page on a fresh disposable origin to `runInstrumentWorkflowAcceptance`
from `tests/instrument-workflow-ui.js`, then `runWorkspaceWorkflowAcceptance`
and `runPianoTouchWorkflowAcceptance` from `tests/workspace-workflow-ui.js`.
Use an autoaccept handler for the temporary-track delete confirmation. The
fixtures intentionally create/edit local test projects; do not use a personal
project origin. Native signal checks use the existing
`tests/run-browser-check.mjs` harness.

## Audio and .EHS regression evidence

Native headless Edge was used for independent Web Audio/export checks. No audio
algorithms were changed by this batch:

| Check | Measured result |
|---|---|
| Utility -12 dB offline | -12.0000002552 dB |
| Utility -12 dB live | -12.0000002327 dB |
| Edited-control WAV / MP3 RMS | 0.0111690780 / 0.0111460359 |
| Clean-origin instrument .EHS restore | Container v1 / instrument schema 2; 2 sample hashes, pad/note/pattern/effect data restored, edit/reopen passed |
| Restored instrument WAV | 8.3000226757 s; RMS 0.01676865358, peak 0.06945693493 |
| Restored instrument MP3 | 8.3330612245 s decoded; RMS 0.01673483073, peak 0.06946731359 |
| Offline settings/buffer snapshot comparison | Maximum and RMS error 0 in that fixture |
| Sidechain ducking | -24.55407488 dB |
| Final limiter | -2.099371746 dBTP; 0 clipped samples |
| Native render cancellation | Closed context, 0 remaining sources; measured 705.9 ms |

Clean-origin restoration used empty browser storage, then edited/reopened the
restored instrument project and verified decoded WAV/MP3. Invalid import
preserved the existing project. This is not a newly repeated clean-origin
recording-archive test. Recorded-audio portability evidence remains in the
earlier reliability reports; do not conflate the two fixtures.

The layout model adds no project fields. Existing JSON, .EHS container v1 and
audio/instrument schema compatibility remain unchanged. No EHS format-spec
update is required for transient presentation state.

## Recording regression

The maintained full synthetic Recording browser fixture passed after opening
the new Advanced container. Its original timing and failure assertions remain:

- 48,000 recorded frames at 48 kHz, one-second punch capture.
- Two-second count-in; pre-roll 96,000 frames.
- Punch start/end 211,200 / 259,200 frames; playback start 115,200 frames.
- Compensation 0.0551666667 s; resulting clip position 1.9448333333 s.
- Injected quota failure retained recovery WAV: 48,000 frames,
  RMS 0.1414030499; Retry Save succeeded.
- Manual offset placement error: 0 in the synthetic fixture.
- Synthetic loopback: 95.6667 ms, correlation 1.
- Permission denial remained visible.
- Interrupted capture retained 12,288 frames; four takes; tracks ended.

These measurements validate controlled synthetic routing/timing, not real
microphone/interface latency or acoustic loopback accuracy.

## Known limitations and 005B.4 handoff

- Compact shortcuts prioritize density; not every compact control is 44 px.
  Expanded tracks/dedicated editors expose detailed controls.
- Track expansion/height and Device Panel preferences are transient for this
  batch, not persisted in a song or portable project.
- No new sample-save format selector: existing new-asset 32-bit float WAV is
  explicitly identified. Song WAV/MP3 remains in Export Studio.
- No complete graphical EQ/FFT implementation, full-screen phone architecture,
  automation, new processors or framework migration.
- No physical-device, non-Chromium, complete WCAG/screen-reader certification
  or newly repeated long-project performance benchmark.
- Existing buffered archive input/low-memory gates remain as documented in
  005A reports; this UX batch does not claim streaming import.
- Build/subpath verification is local, not a remote GitHub Pages deployment.

Next: 005B.4 graphical EQ and measured spectrum/response interactions. Preserve
the shared actual-value controls, instrument-first Device Panel, stable IDs,
25 ms / 150 ms live scheduler, continuous offline DSP graph, sidechain,
recording recovery and portable project boundaries. Keep 005B.5 physical/mobile
acceptance explicit.
