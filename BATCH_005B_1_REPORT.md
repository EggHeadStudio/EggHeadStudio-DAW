# Batch 005B.1 - Professional UX architecture and interface cleanup

**BATCH 005B.1 COMPLETE - READY FOR DESIGN SYSTEM IMPLEMENTATION**

Completion is for this focused foundation and the tested Chromium scope, not
the full 005B redesign, all-browser certification or physical-device acceptance.
The [UX audit](./BATCH_005B_1_UX_AUDIT.md) contains the concrete problem inventory,
priorities, official Live 12 comparisons, component architecture, mobile plans
and 005B.4 graphical-EQ design.

## 1. Actual implementation

- Global Project disclosure replaces the always-visible action row. The former
  Save Locally action is accurately named Download JSON; .EHS remains the
  portable project operation. Removed the duplicate header Export Audio route;
  use Export Studio navigation.
- Arrangement Edit disclosure owns contextual clip/range operations. Right-click
  a clip or track header, or press Shift+F10, selects that context and opens the
  same commands. No separate clipboard or command state. All existing shortcuts
  remain. Pattern commands are absent on audio tracks; selection commands are
  disabled without a selection; empty range fields are hidden.
- Browser has Samples, Instruments and Effects categories. Instrument choices
  open the existing named/color/type track dialog. Effect choices invoke the
  existing selected-track effect insertion handler and open Devices.
- Keyboard-selectable track titles expose selected state. Changing tracks clears
  an unrelated selected clip rather than leaving its inspector under another
  track's devices. M/S/FX/Edit header shortcuts are hidden while their Mixer
  counterparts are visible, and return when the Mixer is collapsed. FX reliably
  reopens the Device Panel. Master volume is in the right Mixer header.
- Track effects have one authoritative editor in Arrangement. Sampler/Drum Rack
  workspaces keep source/pad/note controls but replace duplicated track gain and
  effects with Track effects & Mixer navigation. Patterns and transport position
  are preserved.
- Bottom panel shows instrument setup first, then horizontal ordered effect
  cards. Effects can fold without bypassing, enable/bypass, reorder, remove and
  access presets. Folding is transient and resets when the chain is rebuilt.
- Neutral surface/border/spacing/focus tokens, restrained mint selection accents,
  reduced decorative rounding, visible focus, native disclosure semantics,
  explicit accessible input names and shared focus/hover tooltips.
- Representative functional controls: Utility gain and pan rotary controls,
  width linear range; paired numeric entry, native range keyboard behavior,
  visible units/value, reset, mouse/touch rotary dragging, Shift-fine dragging,
  double-click/touch double-tap rotary reset and invalid-entry feedback.
  Existing `input` handlers still mutate the actual effect parameters and sync
  live graphs/autosave. Numeric controls do not own a second parameter model.
- Corrected track-creation hint: new Drum Rack has one pad, expandable to 32.

Sample Studio effects intentionally remain separate: they are destructive-to-new-
output sample processing, not a second track-effect editor. Pad gain, Utility gain
and Mixer volume are different DSP stages, not accidentally duplicated controls.
Studio audition controls still preview samples/mastering, not a second global
Arrangement transport.

## 2. Changed files

| File | Purpose |
|---|---|
| `src/workspace-ui.js` (new) | Project/context/browser/device presentation and existing-handler integration |
| `src/ui-controls.js` (new) | Shared numeric/range/rotary and tooltip primitives |
| `src/workspace.css` (new) | Scoped visual foundation and responsive shell/device rules |
| `index.html` | Loads new stylesheet; no application rebuild |
| `src/app.js` | Hooks presentation, sole effects owner, selected-track consistency |
| `src/arrangement-workspace.js` | Refreshes contextual actions when a range changes |
| `src/track-ui.js` | Correct new-rack hint |
| `src/sample-editor.js` | Accessible names for existing selection/effect inputs |
| `tests/ui-controls.test.js` (new) | Six pure control/context regression tests |
| `tests/ux-architecture-ui.js` (new) | Maintained Page-based UX and 35-case workspace audit |
| `tests/instrument-workflow-ui.js` | Updated Project/Edit/Device Panel paths; original behavior assertions retained |
| `README.md`, `IDEA.md` | Workflow documentation and staged roadmap |
| `BATCH_005B_1_UX_AUDIT.md`, this report (new) | Requested audit and technical handoff |

No DSP, live/offline scheduler, sidechain/mastering processor, recording model,
archive schema/limits, storage recovery or encoder implementation changed.
No new dependency, mandatory service, Session View or framework migration.

## 3. Browser evidence / before and after

Integrated Chromium, Windows, isolated `.localhost` test origins. Measurements
use a 1100px-high viewport. Layouts are browser emulation, not real phones.

| Width | Original header | New header | Original toolbar scroll height / visible height | New toolbar scroll height / visible height |
|---:|---:|---:|---:|---:|
| 360 | 275px | 177px | 409 / 132px | 144 / 144px |
| 390 | 275px | 137px | 387 / 132px | 144 / 144px |
| 430 | 258px | 98px | 340 / 132px | 144 / 144px |
| 768 | 137px | 100px | 199 / 132px | 98 / 98px |
| 1280 | 106px | 54px | 131 / 131px | 48 / 48px |

Before measurements were collected at 900px height; these header/toolbar intrinsic
heights are not a controlled whole-workspace performance comparison. Fixture track
counts differ. New measurements have both audio/instrument context but only
applicable commands visible. No claims of measured task-completion speed.

Visual screenshots were inspected in the browser: one review exposed wasted
Device Panel height from the master strip; moving it into the Mixer and folding
preset fields brought instrument/effect cards into view. Screenshots are tool
evidence, not checked-in binary files.

### Executed UX acceptance

- Project disclosure and New Project, sample import, browser instrument creation,
  source assignment, pattern creation, Piano Roll note creation.
- Effects Browser Utility insertion into the selected track; sole Device Panel
  return from instrument editor without losing notes.
- Utility numeric edit to -6 dB, rejection of empty numeric input with validity
  feedback and no state mutation, keyboard Arrow/Home, mouse rotary movement,
  reset, linear width/numeric synchronization.
- Device fold vs bypass distinction, bypass persistence, effect reorder/remove,
  preset save access; actual project state checked after edits.
- Right-click Edit invocation and duplication; Ctrl+Z restores clip count.
  Keyboard track selection, unrelated-clip clearing and Shift+F10 invocation.
- Focus-visible tooltip with `aria-describedby`, Escape dismissal, panel
  collapse and FX shortcut reopening.
- Navigation through Sample Studio, Recording Studio, Mastering, Export and
  Arrangement; active workspace has `aria-current="page"`.
- Synthetic CDP touch knob drag and double-tap reset at all five widths; no
  internally clipped toolbar or horizontal page overflow.
- JSON autosave/reload preserves tracks, parameters, patterns and source
  references. After reload, real   UI Play advanced the clock to 00:00.237 and
  track meters registered nonzero signal before Stop.
- Layout/input-name audit: **35/35 cases** (seven workspaces x five widths),
  no page horizontal overflow and no unnamed input/select found by the explicit
  label/aria-label check. This is not a complete WCAG audit.
- Existing instrument workflow acceptance retained two independent named
  instruments, 16-beat clips, assigned sources and -6 dB Utility parameters after
  reload.
- Existing synthetic Drum Rack touch regression passed at all five widths:
  pad selection, Add Pad, step editing, referenced removal Cancel/Delete.
- Existing velocity touch regression passed at all five widths: alternating
  roughly 0.25/0.75 velocities; Piano Roll and velocity-lane maximum horizontal
  scroll positions matched exactly (1358/1328/1288/950/456px).

## 4. Audio and portable-project regressions

Existing signal acceptance executed:

- Stereo separation/balance retained; mono left/right difference 0; opposite-
  polarity channel sum 0.
- Export snapshot comparison maximum/RMS difference **0 / 0**.
- Instrument render: 370,440 frames / 8.4s; RMS 0.0166719959, peak 0.0684752092.
- Cancellation: AbortError, **zero sources**, native context closed, 309.8ms
  for the focused fixture.
- Existing boundary sidechain test: **-24.55407488 dB** ducking at both measured
  positions.
- Active limiter: **-2.099371746 dBTP**, sample peak 0.7852908373,
  **zero clipped samples**. Estimates are not mastering certification.

Final clean-origin acceptance used isolated headless Edge
156.0.4314.50 / Chromium 156, zero initial IndexedDB assets and no autosave.
Imported a portable instrument project, continued editing, saved/reopened it,
retained two linked references and unchanged SHA-256 asset digests, and rejected
invalid input without replacing the active project. Format **v1**, schema **2**
unchanged. Archive sizes 197,015 then 197,823 bytes (timestamps/edit metadata
explain size variation).

| Decoded output | Bytes | Duration | Channels / rate | RMS | Peak |
|---|---:|---:|---|---:|---:|
| 24-bit WAV | 2,196,230 | 8.300022676s | 2 / 44,100 Hz | 0.01676865358 | 0.06945693493 |
| 320kbps MP3 | 333,322 | 8.333061224s | 2 / 44,100 Hz | 0.01673483073 | 0.06946731359 |

MP3 retains existing encoder padding. These are actual decoded output
measurements, not claims of bit-identical lossy audio.

The integrated-browser DOM-only clean-project runner initially timed out waiting
for an animation-frame clock in a hidden tool tab; inspection found a running
AudioContext, not a DSP failure. It was not counted as a pass. The unchanged
fixture passed in the isolated native browser with controlled foreground/
background throttling flags. Interactive UX playback separately passed via real
UI actions. Background-tab gapless behavior is not newly promised here.

## 5. Automated validation and reproduction

Full Node suite: **271 passed, 0 failed, 0 skipped** (all 265 existing tests
preserved plus six new control/context tests). All **97 JavaScript modules**
passed syntax checks; **130 text files** passed strict UTF-8 validation.
`git diff --check` passed (only Windows CRLF notices). Deterministic static build
succeeded with **52 assets**, content version `0c25b6866eb258891eb1`.
Browser smoke of `/dist/` loaded 42 script/style resources in that same version
namespace, matched `version.json`, displayed the new Device Panel and preserved
the two-track saved project and -6 dB Utility setting on the unchanged origin.
This is a local built-subpath check, not a remote Pages deployment.

```text
node --test tests/*.test.js
npm run build
node tests/run-browser-check.mjs 9228 http://localhost:8767 ./tests/instrument-clean-browser.js runCleanInstrumentAcceptance
node tests/run-browser-check.mjs 9228 http://localhost:8767 ./tests/offline-render-acceptance.js runOfflineBoundarySignalAcceptance
```

Serve the repository locally; the CDP runner requires an owned disposable
Chromium/Edge with debugging port 9228. Never point fixtures at a personal
project origin. For interactive checks, pass a Playwright Page on a fresh origin
to `runUxArchitectureAcceptance` in `tests/ux-architecture-ui.js`. Pass the
two-instrument workflow fixture Page to `runWorkspaceLayoutAudit`.
`tests/instrument-workflow-ui.js` retains workflow, Drum Rack touch and velocity
touch exports. Existing harness dependencies were used; no tooling was installed.

## 6. Limitations and 005B.2 handoff

- This is not full design-system rollout. Only Utility parameters use the new
  rotary/numeric primitives. Other effect/sample/master controls retain their
  current implementation.
- Context invocation opens the inline contextual Edit disclosure; it is not a
  pointer-positioned custom popup. Native disclosure keyboard behavior is kept
  instead of assigning ARIA menu roles without implementing their full model.
- Device folding is transient; presets are local effect presets as before.
  Not every rerender restores keyboard focus/scroll inside a device. Native
  range semantics, reset and numeric entry are available, but full screen-reader,
  contrast and every-workspace shortcut auditing remain 005B.2 acceptance.
- Mobile shell is smaller, but the 360px header is still 177px high and dedicated
  studios still require vertical scrolling. Full-screen editors/bottom sheets
  and true mobile workspace navigation belong to 005B.5.
- FFT/draggable graphical EQ, band bypass/filter-type evolution and pre/post
  analysis belong to 005B.4; design is in the audit. No spectrum placeholder was
  added. No general automation system was introduced.
- Physical touch/microphone hardware, Firefox/Safari, low-memory devices,
  independent loudness certification and remote Pages deployment were not
  retested. Existing archive buffering, storage durability and arbitrary
  background-throttling limits still apply.
- Full medium/large export benchmarks were not repeated for UI-only changes;
  retain the measured 7C baseline and continuous-context DSP architecture.

Next: extend these small modules/tokens rather than rewriting the application.
Prioritize consistent control/header/menu skins, keyboard focus restoration,
named shortcuts and contrast across studios before EQ and mobile specialization.
No commit, push or deployment was performed.
