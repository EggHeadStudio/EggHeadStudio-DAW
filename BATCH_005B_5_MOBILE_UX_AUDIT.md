# Batch 005B.5 - Mobile production UX audit

## Before implementation

Baseline executed in this batch: **310/310 Node tests passed**, 6121.5041 ms.
The worktree was clean at intake. Previous 005B.4/4B behavior is the foundation,
not work to rebuild. Reviewed the requested reports, design system, project
format, shell, workspace organizers, Arrangement and instrument pointer paths.

Actual Chromium UI audit used disposable local storage at 320x740, 360x800,
390x844, 430x932, 768x1024, 1280x900 and landscape 844x390. Arrangement,
Sample, Recording, Mastering and Export were visited at each size (35 cases).
Sampler and one-pad Drum Rack were created using the actual track dialog and
visited at all six widths (12 more cases). This was synthetic viewport
inspection, not Android/iPhone or Firefox/WebKit verification.

### Prioritized findings

| Priority | Surface | Evidence / issue | Planned response |
|---|---|---|---|
| P0 | Navigation / recording | Workspace buttons are disabled by RecordingStudio while busy, but no common programmatic navigation guard; adding alternate navigation could bypass that protection. Sample recording also needs explicit navigation protection. | One guarded workspace entry point; no new audio/project state. Disable mobile workspace/back/expand actions while busy; global Stop remains available. |
| P1 | Global shell | At 320px the header is 177px plus 59px workspace navigation; content starts at y=236. In landscape this consumes much of the available editing height. Major instrument editors are contextual and not discoverable from global navigation. | Compact transport with secondary tempo controls, named workspace switcher and consistent Back/Arrangement actions. Retain desktop navigation. |
| P1 | Piano Roll | Note drag starts immediately on a note (`touch-action:none`), empty lanes scroll; multi-selection requires desktop modifiers. `pointercancel` currently commits changed notes/velocity instead of reverting. | Explicit Draw/Select/Scroll mode; additive touch selection; transactional cancellation. Preserve authoritative row/beat coordinates. |
| P1 | Detailed editors | Source/configuration/toolbars precede the grid. Empty-pattern instruments have hidden grids (zero grid height), not a coordinate failure. Rack grid starts at y=630 at 320px and y=566 at 360px. | Expanded existing-element editors, not cloned UI/models. Clear exit and access to source/actions. |
| P1 | Arrangement | Existing Select Range / Edit Clips toggles can both be active. Native pan vs clip-edit already exists, as do touch handles; make modes mutually exclusive and label current mode. | Preserve selection/scheduler model; explicit consistent modes. Full gesture/section acceptance still required. |
| P1 | Targets | The audited 320px six-track Arrangement has 103 controls with width or height below 44px out of 111 visible controls (includes checkbox/range native dimensions). Sample has 44/46. Compact row controls are intentionally small. | Enlarge primary navigation/edit actions; keep dense musical grid with explicit modes/expanded access. Do not equate every small native input with an inaccessible workflow. |
| P2 | Sample Studio | Existing five-stage controls/live DSP and native EQ work, but long vertical progression separates waveform, preview and processing. Waveform consumes touch selection rather than native horizontal pan. | Expand existing stages/EQ; retain explicit zoom and live preview. Waveform gesture-mode/phone production acceptance remains a separate requirement. |
| P2 | Drum Rack | Stable dynamic pads/inspector exist; 28px step cells are dense and inspector competes with pattern grid. No separate mobile model needed. | Expanded step/inspector surfaces and larger mobile steps; verify 1-32 pads in follow-up. |
| P2 | Mixer / Device Panel | Compact Mixer is at right of wide Arrangement; devices use bounded horizontal chain and nested vertical bodies. | Expand selected existing surface; reuse all actual faders/meters/device handlers. Selected-track mobile Mixer workflow needs full acceptance. |
| P2 | Recording | Existing Record/Stop sticky controls and visible recovery; backing/options precede capture. Interruption already stops/salvages on visibility/context suspension. | Preserve stop/recovery and dry capture. No claim OS background recording works. |
| P2 | Master / Export / Project | Long stages, local mastering taps/live audition, real export progress/cancel and Project .EHS controls exist. No page-level overflow in the audited empty/default workspaces. | Reuse stages and Project menu; keep encoded quality/archive limits; no fake mobile render path. |
| P2 | Keyboard / viewport | No virtual-keyboard/hardware evidence. Native numeric fields may summon a keyboard and shrink visual viewport. | Expanded editor exit must stay accessible; physical keyboard/OS interruption remains a gate. |

No page-level overflow was observed in the 47 baseline cases. That does **not**
establish production usability: hidden empty-pattern grids, long scrolling,
small targets and conflicting gestures are distinct issues.

## Architecture constraints

- Transient navigation, expanded-editor and gesture state only; no project
  schema/.EHS changes.
- Reparent/expand the existing wired DOM, never clone a control or audio graph.
- Shared EQ/knobs/units remain unchanged. Preserve source/graph identity during
  presentation changes and remove hidden-analysis work through existing
  visibility handling.
- Do not silently leave a busy recording or unsaved take. No history-based
  routing that risks triggering browser-back data loss.
- Full completion requires the 22-step phone production/import/export workflow,
  not merely the above layout audit.

## After implementation: verified milestone

The dedicated Chromium fixture passed 49 workspace/layout cases. No page-level
overflow was found; primary navigation/Play/Stop targets measured at least 44px.
The compact header measured 101px on phones/landscape (54px desktop). The
expanded Piano Roll passed additive selection, move/pitch/resize, cancellation,
velocity rollback, Undo/Redo, scroll and reload persistence.

An additional real geometry defect was found during acceptance: generic studio
button minimum heights enlarged musical keys/notes beyond their pitch rows.
A specificity-matched exemption now preserves key/note/velocity geometry.
The fixture checks key/row alignment at each tested layout.

Synthetic recording safety passed delayed-permission/capture guards, emergency
Stop and buffered dry-take recovery after AudioContext suspension. Existing
live Sample/Mastering/transport signal regressions also passed. These results
do not close the full phone production workflow or hardware/browser gates.

## Cross-workspace regression checklist

- [ ] Arrangement gestures, range/section editing and selected-track Mixer.
- [x] Sampler/Piano Roll Draw/Select/Scroll, velocity, cancellation and source.
- [ ] Drum Rack pad/sample/step/velocity workflow.
- [x] Sample waveform, live effects, Save once and instrument reuse (shared regression scope).
- [x] Recording guarded navigation, dry capture and suspended-context recovery (synthetic).
- [x] Mastering live audition, EQ/FFT and preserved analysis semantics (shared regression scope).
- [ ] Export WAV/MP3 and clean-origin .EHS restoration.
- [x] Six widths plus one landscape layout; physical-device/cross-engine gates documented.

Execution results and remaining requirements will be recorded in
[the batch report](./BATCH_005B_5_REPORT.md).
