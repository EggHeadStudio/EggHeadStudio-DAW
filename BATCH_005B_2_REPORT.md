# Batch 005B.2 - Design system and reusable audio controls

**BATCH 005B.2 COMPLETE - READY FOR BATCH 005B.3**

Completion describes the requested foundation and tested Windows Chromium scope.
It is not full mobile redesign, all-browser/physical-device certification or
independent audio standards certification.

See [the design-system guide](./BATCH_005B_2_DESIGN_SYSTEM.md) for actual tokens,
mapping math, units, API, interaction/focus contracts and staged work.

## Delivered

- Expanded Comic-Tech Lite tokens, readable neutral studio/input surfaces,
  numeric typography, focus/error/selection states and restrained family accents.
- Shared real rotary, linear slider and vertical fader enhancement: SVG arc,
  actual-value native range, numeric entry, units, keyboard, reset, captured
  mouse/touch, Shift-fine movement, cancellation and synchronized disabled state.
- Migrated Utility, Compressor, Delay, Reverb, Saturation and Limiter parameters.
  Existing Sampler source filter/Q and legacy delay use the same primitives.
  EQ keeps its existing graph/ranges; no new graphical EQ or FFT was added.
- Reusable device shell: stable identity, Active/Bypassed status, fold, chain
  presets, reorder/remove; scroll/fold/focus survive structural rerenders.
- Consistent Mixer faders/pan, track stripes, actual stereo/sample-peak text and
  real compressor reduction. Hidden/offscreen meter DOM work is skipped.
- Track-dialog focus restoration and Arrangement shortcut isolation.
- Empty preset selection cannot accidentally load preset zero.
- One initialization guard defers normal track graph creation until the master
  input exists, avoiding premature control synchronization into an undefined
  audio destination while initial Worklet modules load. Parameter edits remain
  in the project and apply at the next initialized synchronization. Existing
  unsupported-sidechain errors remain explicit.

No DSP algorithm, source scheduling, recording, encoder, sidechain/mastering
processor, archive format/limits, storage recovery or migration was rewritten.
No new dependency, framework, service or Session View. No commit/push/deployment.

## Modified files

| Files | Purpose |
|---|---|
| [ui-controls.js](./src/ui-controls.js) | Shared parameter mapping, presentation and interactions |
| [device-ui.js](./src/device-ui.js) (new) | Device shell, migration, stable focus/fold lifecycle |
| [meter-ui.js](./src/meter-ui.js) (new) | Visible actual-measurement DOM updates |
| [workspace-ui.js](./src/workspace-ui.js), [workspace.css](./src/workspace.css) | Mixer/device integration, tokens, responsive studio styling |
| [app.js](./src/app.js) | Meter and device lifecycle, shortcut guard, preset validation |
| [sampler-ui.js](./src/sampler-ui.js), [track-ui.js](./src/track-ui.js) | Existing filter/delay controls and modal focus |
| [audio.js](./src/audio.js) | Initialization-only track-sync guard |
| [design-controls.test.js](./tests/design-controls.test.js) (new) | Seven pure mapping/format/default tests |
| [live-transport.test.js](./tests/live-transport.test.js) | Pending-initialization control regression |
| [design-system-ui.js](./tests/design-system-ui.js) (new) | Maintained Page-based control/device/touch/contrast acceptance |
| [design-system-audio.js](./tests/design-system-audio.js) (new) | Edited-project archive/encoded audio, live gain and real meter checks |
| [README.md](./README.md), [IDEA.md](./IDEA.md), this report and design guide | Workflow, evidence and next-stage handoff |

## Automated and browser acceptance

Final validation results are recorded below after the final initialization fix.
All previous 271 Node tests remain unchanged in strength; seven control tests and
one initialization test are additive.

| Check | Result |
|---|---|
| Node 22.23.4, `node --test tests/*.test.js` | 279 passed, 0 failed/skipped/cancelled |
| `node --check` across source/tests/scripts | 102 modules passed |
| Strict UTF-8 across source/tests/scripts and root Markdown/HTML/JSON | 128 files passed |
| `git diff --check` | Passed; only local LF-to-CRLF notices |
| Deterministic static build | 54 assets, version `b31fd88e668646cdcb69` |
| Built `/dist/` subpath smoke | 44 script/style requests share that version; 23 enhanced controls; two-track saved project unchanged |

### Actual UI

Executed existing UX architecture acceptance and new design-system acceptance:

- Browser/Project/workspace navigation and authoritative Device Panel retained.
- Six real devices; numeric values persist in actual project data, including
  milliseconds-to-seconds conversion. Log arc/keyboard/pointer mapping works.
- Tempo sync disables both time range and numeric entry. Bypass remains audible
  state, not folding; reorder preserves device focus and unrelated fold state.
- Chain preset shortcut works; empty selection visibly rejects without mutation.
- Mixer numeric/range synchronization, pan and lane alignment.
- Modal opener focus and keyboard-shortcut isolation.
- Deliberately delayed actual Worklet initialization: edited Utility before
  Ready, retained -9 dB in project state, completed loading without page errors,
  then restored the fixture value. The probe delays module completion, not DSP
  output or the production scheduler.
- At all five widths: captured knob, slider, pan and vertical-fader touch,
  pointer cancellation, no accidental clip edits, horizontal device scrolling,
  60 px knob targets and no page-level horizontal overflow.
- Sampler filter edit, actual persisted project parameters, reload and existing
  UX playback/meter acceptance.
- Existing two-instrument workflow: independent Drum Rack and Sampler clips,
  source assignment, Utility edits on both instruments and reload.
- Existing CDP synthetic touch: Drum Rack selection/add/remove/steps and Piano
  Roll velocity lane at all five widths.
- 35 workspace/width combinations: Arrangement, Sample Studio, Recording,
  Mastering, Export, Sampler and Drum Rack; no page-level horizontal overflow or
  unnamed active-workspace inputs.
- Desktop and 360 px screenshots inspected. Narrow devices remain reachable by
  intentional nested scrolling; this is not the final phone architecture.

| Width | Document width | Device chain content / viewport | Knob | DOM elements |
|---:|---:|---:|---:|---:|
| 360 | 345 | 2098 / 310 | 60 | 662 |
| 390 | 375 | 2114 / 340 | 60 | 662 |
| 430 | 415 | 2114 / 380 | 60 | 662 |
| 768 | 753 | 2114 / 718 | 60 | 662 |
| 1280 | 1280 | 2294 / 990 | 60 | 662 |

Widths are CSS pixels at 1100 px viewport height. Vertical scrollbar allocation
explains document width below viewport width. DOM counts are this fixed fixture,
not a performance budget or claim about arbitrary projects.

Token contrast: primary text/surface 14.31:1; muted/raised 6.69:1;
focus/raised 10.27:1; minimum tested pair accent/selection 6.36:1.
All tested text/status/device-family pairs exceeded 4.5:1. No complete
screen-reader, contrast or physical-device certification is claimed.

### Audio and portable projects

The actual UI-edited six-effect Sampler project was packaged/opened as .EHS
container v1, project schema 2. Referenced audio was embedded once; track,
pattern, clip and effect metadata compared equal after reopening.

| Actual UI-edited project | WAV (24-bit) | MP3 (320 kbps) |
|---|---:|---:|
| Decoded frames | 498331 | 499968 |
| RMS | 0.0123310401 | 0.0123115642 |
| Sample peak | 0.215250850 | 0.215209961 |

Archive size for that run: 91575 bytes, one referenced sample. Both outputs were
decoded and numerically non-silent/non-clipping; MP3 is lossy, not sample-equal.
The same archive passed exact track-metadata comparison.

An isolated native Edge 156 context independently measured Utility -12 dB:
offline -12.00000026 dB, live -12.00000023 dB. The live probe uses a continuous
generated sine through the real graph and waits for **audio-clock** settling,
not a fixed wall-clock sleep. Its actual peak drove meter DOM; hidden/offscreen
updates were skipped. Tolerances: 0.02 dB offline, 0.3 dB live.

The existing genuinely clean-origin acceptance independently passed with empty
initial IndexedDB/autosave: container v1/schema 2, two SHA-256 assets, linked
references, editing/save/reopen, rejected invalid import preserving the project,
live transport, decoded WAV/MP3. Decoded WAV duration 8.30002268 s, RMS
0.01676865, peak 0.06945693; MP3 8.33306122 s, RMS 0.01673483, peak 0.06946731.

Existing continuous offline regressions passed: exact export-snapshot comparison
(maximum/RMS difference zero), stereo/mono/opposite-polarity cases, native render
cancellation with closed context/zero sources, repeated sidechain ducking
-24.5541 dB, limiter true peak -2.09937 dBTP and zero clipped samples.

### Validation caveats resolved during execution

- A 375 ms test value was incompatible with the existing 10 ms delay step.
  The fixture now enters 370 ms; the actual control bounds were not weakened.
- Log ArrowUp at the minimum could round to the same stepped value. The control
  now advances at least one actual step; repeated five-width tests passed.
- Independent touch cases now reset their baseline values and wait for Ready
  after reload, rather than racing asynchronous asset/Worklet initialization.
  Premature normal track sync also has the narrowly scoped initialization guard.
- The integrated browser reported AudioContext `running` while its audio clock
  remained zero during the standalone live probe. It was not counted as a pass.
  Actual edited-project offline/export checks ran there; the live measurement
  ran in isolated native Edge. The native fixture regenerates its test assets;
  it does not pretend to be the same browser profile or hardware microphone.
- Test Explorer discovered no tests; validation uses the repository's existing
  Node runner. No dependencies were installed.

## Limits and technical handoff

- Mixer rows are 238 px desktop / 280 px mobile to fit the vertical controls and
  touch targets; compact track density remains a follow-up.
- Fold/scroll state is transient, not persisted in JSON/.EHS. Presets are still
  complete local chains, not a new device-preset format.
- Percentage display retains fractional numeric entry. Parameter Undo/automation
  is not implemented. Existing Arrangement/Piano Roll Undo remains.
- Specialized sample/mastering/EQ controls are not all replaced. Graphical EQ,
  actual spectrum work and draggable nodes belong to 005B.4.
- Visibility skips outside-screen meters, not every possible clipping-ancestor
  occlusion; the existing audio meter computation still runs.
- Large-project timing/memory benchmarks were not repeated: no render/scheduling
  algorithm changed. Keep the measurements and limits in
  [005A.7C](./BATCH_005A_7C_REPORT.md), not a new performance claim.
- Firefox/WebKit, physical iOS/Android, low-memory devices, real microphone
  latency and assistive-technology testing were not executed here.
- Local versioned subpath smoke is not remote GitHub Pages deployment.

005B.3 should reuse the actual-value parameter API and stable device IDs, preserve
the single authoritative track Device Panel, and retain shared live/offline DSP.
Do not introduce a second parameter state, per-frame application rerenders or
synthetic meter activity. Preserve .EHS v1, project schemas and recording recovery.
