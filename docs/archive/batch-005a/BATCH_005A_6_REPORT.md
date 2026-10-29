# Batch 005A.6 - Complete Instrument Arrangement Integration (005A.6B)

## Status

**BATCH 005A.6 COMPLETE — READY FOR BATCH 005A.7**

This supersedes the initial 182-test internal milestone. Independent
Sampler/Drum Rack clips are now available through the actual interface,
selected-pattern editors, mixed Arrangement editing and portable projects.
All eight user-facing instrument-composition acceptance steps passed.

No commit, push or deployment was performed. No dependencies were added.
Existing audio assets and archive limits are preserved. `.EHS` container
version 1 is unchanged; typed instrument projects explicitly use project
schema 2. Legacy whole-track patterns are migrated safely on loading.

## Implemented architecture

### Separate instruments, patterns and Arrangement instances

[src/instrument-clips.js](../../../src/instrument-clips.js) defines:

- Instrument configuration remains on `track.sampler` / `track.drumRack`.
- `track.patterns` contains track-scoped stable pattern IDs, names, lengths
  in beats and independent note arrays.
- Each typed clip has its own ID, `kind: "instrument"`, `patternId`, bar
  position, `durationBeats`, `offsetBeats`, gain and loop state.
- Default duplication clones the pattern and note identities. An explicit
  linked-duplicate argument preserves the original pattern reference.
- Validation rejects missing references, duplicate identities, invalid notes
  and invalid clip geometry.

The automatic legacy migration converts a whole-track pattern to a named
pattern and looping instance. It preserves instrument settings and existing
audio clips, fills legacy note defaults and is idempotent. Migration stages
all changes before replacement, so invalid notes do not partially convert
earlier tracks. Startup, JSON and `.EHS` import normalize a candidate before
replacing the active project. Invalid saved data is reported without silently
overwriting it. `legacyTail:true` preserves migrated final-note tails; actual
boundary edits remove that exception. Chromium final-tail and empty-pattern
fixtures had zero maximum/RMS PCM error and unchanged render durations
(9.300022676 and 8.300022676 seconds respectively).

### Unified editing helpers

[src/arrangement.js](../../../src/arrangement.js) now supports typed clips in split,
duplicate, move, beat-based resize, range copy/paste/delete and history.

- Partial copies retain source offset rather than destructively truncating
  note arrays, preserving sustained notes and loop phase.
- Mixed ranges preserve relative track positions, empty time and audio asset
  references without copying PCM.
- Clipboard patterns are snapshots. Paste creates independent pattern IDs,
  while preserving intentional sharing among copies within the same section.
- Paste preflights destinations before modifying tracks. Instrument moves
  require matching playback types; audio clips require Audio destinations.
- Cross-track moves transfer pattern data while retaining the destination
  instrument configuration. Conflicting pattern identities are rejected.
- Operations refuse to replace a destination's unmigrated legacy melody.
- History deep-copies patterns and clips, including generated patterns and
  project loop state.

These operations are connected to the real Arrangement workspace, toolbar,
Clip Editor and shared single-clip/range clipboard. Invalid destinations
report an error before changing any tracks.

### Selected-pattern editing and gestures

- **+ Pattern Clip** creates a fresh pattern at the current position.
- Double-click/tap or **Open Editor** binds the exact clip's pattern to Piano
  Roll/Drum Sequencer, retaining the real track ID and instrument settings.
- Pattern name, beat length and sharing count are visible. Length changes
  refuse to discard note onsets; note lengths and velocities remain editable.
- Default duplicate/paste is independent. **Linked Duplicate** shares a
  reference; the LINKED count and **Make Independent** action make this explicit.
- Piano Roll widths/rulers and Drum step timing use the selected pattern's
  length. Editor histories are pattern-scoped; preview routing stays on-track.
- Clips show track colors, pattern names, loop/shared indicators and bounded
  note/drum previews. Mouse drag, numeric boundaries and touch handles use
  the shared timeline coordinates and snapping.
- Touch uses **Edit Clips (touch)** for body dragging and **Select Range**
  for mixed sections. Outside edit mode, a tap selects and a double-tap opens;
  horizontal swipe remains native scrolling without changing clip data.

### Shared live/offline scheduling

[src/instrument-playback.js](../../../src/instrument-playback.js) replaces duplicated
instrument scheduling in [src/audio.js](../../../src/audio.js).

- One event generator resolves patterns, clip boundaries, loop cycles,
  source offsets, notes, velocities and pad/sample configuration.
- One voice scheduler applies pitch, pan, gain and sampler envelopes in both
  live-compatible scheduling and offline rendering.
- Lookahead enumerates relevant cycles, including sustained/tail overlap;
  subsequent windows do not restart already scheduled notes.
- Seek/edit resume advances both the source and envelope. Transport-loop
  boundaries stop voices at the scheduled audio time.
- Typed clip voices stop at their clip boundary. Migrated legacy clips retain
  final-note tails until their boundaries are edited; the legacy fallback is
  also preserved.
- Render duration includes positioned instrument clips and effect tails.
- Pattern edits enter the live playback signature, triggering the existing
  current-position rescheduling mechanism.

The existing **25 ms interval / 150 ms lookahead**, stable track inputs,
continuous silent transport, mixer/effect routing and mastering architecture
remain in place. No UI-timer loop restart was reintroduced.

## Verification

### Node, syntax and whitespace

- Baseline: **159 passed, 0 failed**.
- Final: **198 passed, 0 failed**; all 159 baseline tests retained.
- All 17 changed/new JavaScript/MJS files pass `node --check`.
- `git diff --check` passes.
- Existing GitHub Actions configuration uses Node 22 and `npm test`.
  The remote workflow was inspected, not executed or claimed passing.

Run from the repository root with Node 22:

```powershell
node --test --test-reporter=spec tests/*.test.js
```

Tests cover independent melodies/drums, stable references, defaults and
atomic migration failure, independent/shared duplication, compatible moves,
destination rejection, split/trim, mixed clipboard snapshots, gaps, partial
sustained notes, loop phase, undo/redo, voice boundaries, transport-loop
cutoff, bounded lookahead, current-position edits, render duration, exact
editor binding, sustained-note quantization, schema/feature validation,
portable pattern references and legacy-tail boundary removal.

### Executed Chromium engine acceptance

Environment: Windows, VS Code integrated browser reporting Chromium
150.0.7871.250 / Electron 43.7.7. Node v22.23.4. This is browser automation,
not physical-device or microphone testing.

The deterministic signal fixture contains three tracks: imported-style audio,
a Sampler with separate Verse/Chorus patterns, and a Drum Rack with distinct
Kick/Fill clips. Additional real-interface acceptance used four tracks:
Backing, Bass Sampler, Melody Sampler and Drum Rack. Test media was generated
deterministically; no microphone hardware was tested.

Reproduction:

1. Serve the repository with `python -m http.server 8765`.
2. Open `http://localhost:8765`.
3. In the browser console:

```js
const checks = await import('./tests/instrument-browser-acceptance.js');
await checks.runInstrumentAcceptance();
await checks.runInstrumentRoutingAcceptance();
await checks.runLegacyMigrationAcceptance();
await checks.investigateFractionalSlices();
```

Measured results:

| Assertion | Result |
|---|---:|
| Offline versus live-compatible window scheduling, maximum absolute PCM error | 0.0000129474 |
| Explicit comparison tolerance | 0.0001 |
| Decoded Verse frequency | 220 Hz |
| Decoded Chorus frequency | 440 Hz |
| Silent Arrangement gap RMS | 0 |
| Verse RMS | 0.0400084 |
| Chorus RMS | 0.0399862 |
| Distinct drum Fill RMS | 0.0172553 |
| WAV size | 1,464,168 bytes |
| Decoded duration, including existing effect-tail allowance | 8.300022676 seconds |
| Decoded format | Stereo, 44,100 Hz |
| Sampler RMS before external Drum Rack detector compression | 0.0401459 |
| Sampler RMS with external detector compression | 0.00286125 |
| Sidechain RMS ratio | 0.0712713 |
| Mastering output ratio with -6 dB output and limiter enabled | 0.5035703 |
| Fully muted project RMS | 0 |
| Audio backing RMS while Sampler soloed | 0 |

The comparison uses actual Web Audio track graphs and the live
`scheduleRange` method in an OfflineAudioContext against normal engine
rendering. It verifies live-compatible scheduling, **not** physical speaker
output or foreground timer reliability under long main-thread stalls.
Mastering gain is consistent with one application, within the test's
0.4-0.6 ratio tolerance; this is not formal DSP certification. The 1e-4
schedule comparison passed, but output is **not claimed sample-identical**.

### Actual interface, touch and encoded exports

[tests/instrument-ui-acceptance.js](../../../tests/instrument-ui-acceptance.js)
exports Playwright functions accepting a Page:

1. On a freshly served disposable origin, run
   `runInstrumentUiAcceptance(page)`.
2. Then run `runInstrumentTouchAcceptance(page)` on that same Page.

The executed UI function used New Project, real file-input import, track
creation, independent melodies, linked editing/unlink, drum patterns, mixed
section duplicate/undo/redo, track effects, external sidechain and mastering.
It finished with 2 Backing clips, 6 Bass clips/patterns, 6 Melody clips/patterns,
and 6 Drum clips referencing 4 patterns. Additional real toolbar checks passed
split, loop toggle, offset-preserving independent copy/paste and delete.

The touch function passed at **360, 390, 430, 768 and 1280 px**: double-tap
opened the exact editor, a new note was placed, a clip moved one beat, its
duration increased one beat, and Undo restored geometry. No page horizontal
overflow occurred. An additional 390 px four-track touch range copy/paste
preserved relative timing and Undo restored counts. Native touch scrolling
moved the timeline 145 px without changing the saved project. These are CDP
synthetic touch tests, **not physical mobile-device verification**.

Actual Export Studio UI output decoded successfully:

| Output | Bytes | Decoded seconds | Format | RMS | Sample peak |
|---|---:|---:|---|---:|---:|
| 24-bit WAV | 4,313,078 | 16.3 | Stereo 44,100 Hz | 0.020400765 | 0.113756180 |
| 320 kbps MP3 | 653,145 | 16.326530612 | Stereo 44,100 Hz | 0.020385093 | 0.113769531 |

All 625 inspected MP3 frames were 320 kbps. MP3 padding is not treated as an
Arrangement timing failure; the existing encoder is not gapless.

### True isolated-browser portable-project acceptance

The integrated browser does not allow creating an unaffiliated new context.
An isolated `.localhost` origin was tested first, but that alone was **not**
counted as a new browser context. Literal clean-environment acceptance then
ran in installed headless **Edge 156.0.4314.50** with a brand-new temporary
user-data directory, using the dependency-free Node CDP runner.

Reproduce with a disposable native Chromium/Edge profile (never a personal
profile), remote debugging on port 9225 and this repository served on 8765:

```powershell
node tests\run-clean-browser.mjs 9225 http://localhost:8765
```

The browser must start with no `pulse-project` autosave and zero IndexedDB
assets; the test refuses nonempty storage. Close that disposable browser
afterward. The executed test passed:

- Import a schema-2/container-1 archive; compare exact clip/pattern data.
- Resolve every sample without the original library or local source folder.
- Play, continue editing, verify two linked references, save a second archive
  and reopen it through the real application handlers.
- Preserve both audio hashes across both versions.
- Reject invalid import while keeping the active project unchanged.
- Decode WAV/MP3 from the same mastered render.

First archive: **196,945 bytes**; second: **197,867 bytes**. Asset SHA-256:

```text
677769c10e108b62b714658fd4a412e131b7cbff2da4f6351b060544956fd59e
b91aaabc2df6f07e6682154f7b2fd54c328f8515859db9d5b8885483459c4eec
```

| Clean-browser output | Bytes | Seconds | RMS | Sample peak |
|---|---:|---:|---:|---:|
| 24-bit WAV | 2,196,230 | 8.300022676 | 0.016768654 | 0.069456935 |
| 320 kbps MP3 | 333,322 | 8.333061224 | 0.016734831 | 0.069467314 |

Both decoded stereo at 44,100 Hz. No formal loudness/true-peak certification,
physical-output timing or deployed GitHub Pages result is claimed.

### Fractional-rate investigation

A controlled 220 Hz / amplitude 0.1 / 44.1 kHz fixture compares a four-second
loop against slices at 1.5 and 2.25 seconds. There are **no fades**, and slice
times fall on exact output frames, isolating the issue from fade boundaries
and UI timers.

| Rate | Source-offset treatment | Maximum error vs whole loop | RMS error |
|---|---|---:|---:|
| 1x | Native / nearest frame / floor | 0 | 0 |
| 1.25x | Native | 0.0015671703 | 0.0006037829 |
| 1.25x | Explicit nearest source frame | 0.0015671703 | 0.0006037829 |
| 1.25x | Explicit floor source frame | 0.0015671703 | 0.0006037875 |

Native output exactly matched explicit nearest-frame source offsets.
Flooring differed from native by up to 0.0031343405. At the first split the
requested source phase is frame 38587.5; restarting a native BufferSource
quantizes that phase, unlike uninterrupted fractional-rate playback. This
identifies source-offset/native restart quantization in the controlled
Chromium case and reproduces the scale of the previous approximately
0.00155 report without envelopes.

Rounding/flooring offsets does not improve the error. No interpolation
shortcut, audio-quality reduction or unverified scheduling compensation was
introduced. Seamless fractional-rate slicing remains unresolved; other
browsers and the original full fixture still require verification.

## Acceptance matrix

| Requirement | Implemented | Functionally verified | Remaining acceptance |
|---|---|---|---|
| Independent Sampler/Drum Rack clips | Yes | Node, real UI + signals | None for this scope |
| Pattern identity and independent/shared copies | Yes | Node + UI linked edit/unlink | None for this scope |
| Split/move/resize/duplicate/delete/loop | Yes | Node + mouse/touch/controls | Physical devices separate |
| Mixed section copy/paste, phase and sustained notes | Yes | Node + UI + touch range | None for this scope |
| Pattern-aware Undo/Redo | Yes | Node + editors/workspace | None for this scope |
| Shared live/offline voices | Yes | Node + Web Audio + UI playback | Long background-stall baseline |
| Sidechain, mute/solo and mastering routing | Shared graph | Measurable browser signals + exports | Formal DSP certification separate |
| Legacy migration | Automatic, atomic | Node + zero-error browser fixtures | Broader historical-project corpus |
| Existing archives / new typed projects | Container 1 retained | Schema tests + native clean-profile round trip | Old app correctly rejects schema 2 |
| New-model project persistence | Yes | Two saves/reopens, unchanged hashes | None for this scope |
| Clip visuals/editor navigation/touch handles | Yes | Five-width actual browser actions | Physical devices separate |
| New-clip WAV/MP3 export | Yes | Actual UI + native decode | Broader browser/export matrix |
| Fractional-rate boundary precision | Investigated | Controlled numerical reproduction | Known native restart discrepancy |
| Physical mobile devices / deployed GitHub Pages | No new verification | Not tested | Separate release validation |

The eight user-facing final acceptance steps **passed**: create Sampler clips,
create Drum clips, edit separately, manipulate clips, copy mixed sections,
hear playback, export expected audio and save/reopen without losing patterns.

## Compatibility and persistence boundary

The ZIP-compatible `.EHS` container remains version 1. Typed instrument
projects declare project schema 2 and required feature `instrumentClips`.
Non-typed schema-1 workflows remain supported. Old schema-1-only applications
cannot open schema-2 projects; explicit rejection is safer than silently
losing patterns. This is a documented schema evolution, not a claim that
older builds understand the new model.

Typed clips validate pattern references/geometry instead of requiring audio
clip source fields. Sampler/pad/audio asset references, ZIP paths/checksums,
size/entry limits and import staging remain enforced. Audio stays deduplicated
in the existing asset store. See [EHS_FORMAT_SPEC.md](../../../EHS_FORMAT_SPEC.md).

## Changed files

- [src/instrument-clips.js](../../../src/instrument-clips.js): model, validation,
  migration, identity and source-phase helpers.
- [src/instrument-playback.js](../../../src/instrument-playback.js): shared event
  expansion and voice scheduling.
- [src/arrangement.js](../../../src/arrangement.js): typed editing, snapshots,
  clipboard, destination checks and history.
- [src/audio.js](../../../src/audio.js): shared scheduling integration, duration and
  playback-signature support from the initial milestone, preserved here.
- [src/app.js](../../../src/app.js), [src/arrangement-workspace.js](../../../src/arrangement-workspace.js),
  [src/arrangement.css](../../../src/arrangement.css): actual clip UI, gestures,
  previews, mixed selection and safe project activation.
- [src/pattern-editor.js](../../../src/pattern-editor.js),
  [src/sampler-ui.js](../../../src/sampler-ui.js),
  [src/drum-rack-ui.js](../../../src/drum-rack-ui.js),
  [src/piano-model.js](../../../src/piano-model.js): exact pattern binding, pattern
  length/velocity/history and sustained-note quantization.
- [src/project-state.js](../../../src/project-state.js),
  [src/portable-project.js](../../../src/portable-project.js): schema/feature
  signaling, migration, typed validation and portable media references.
- [tests/instrument-clips.test.js](../../../tests/instrument-clips.test.js): 23 tests.
- [tests/instrument-fixture.js](../../../tests/instrument-fixture.js): deterministic
  three-track/two-sample composition.
- [tests/instrument-browser-acceptance.js](../../../tests/instrument-browser-acceptance.js):
  Web Audio/WAV/routing, migration equivalence and fractional-offset checks.
- [tests/pattern-editor.test.js](../../../tests/pattern-editor.test.js),
  [tests/persistence-migration.test.js](../../../tests/persistence-migration.test.js):
  selected-editor, schema, archive and migration regressions.
- [tests/instrument-ui-acceptance.js](../../../tests/instrument-ui-acceptance.js),
  [tests/instrument-clean-browser.js](../../../tests/instrument-clean-browser.js),
  [tests/run-clean-browser.mjs](../../../tests/run-clean-browser.mjs): reproducible
  full UI, five-width touch and isolated native-browser acceptance.
- [README.md](../../../README.md), [IDEA.md](../../../IDEA.md),
  [EHS_FORMAT_SPEC.md](../../../EHS_FORMAT_SPEC.md), this report: honest capability,
  compatibility and continuation documentation.

## Next milestone

**Batch 005A.7 - Performance finalization**, not another instrument-model
integration milestone:

1. Measure long mixed-project preparation, export, memory and scheduling.
2. Bound decoded/preview caches and add safe chunked/streamed archive handling.
3. Improve interruption/quota recovery without silently raising archive limits.
4. Test latency, synchronization, accessibility and physical mobile devices.
5. Expand browser/export compatibility and background-stall testing.
6. Retain the measured fractional-rate limitation until a numerically verified,
   quality-preserving solution is available.

The future **Recording Studio - Vocal & Live Instrument Overdub Workspace**
is added to the roadmap only. It will reuse immutable audio assets, audio
clips and the Arrangement clock for latency-compensated takes; it is not
Session View and is not implemented here.
