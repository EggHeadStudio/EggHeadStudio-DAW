# Batch 005A.6 - Instrument Arrangement Clips

## Status

**BATCH 005A.6 INCOMPLETE - REMAINING FUNCTIONAL REQUIREMENTS**

This is a coherent, tested internal model/playback/editing milestone. It does
**not** enable independent instrument clips in the application interface.
The requested selected-clip editor workflow and portable project acceptance
must be completed before this batch can be called functionally complete.

No commit, push or deployment was performed. No dependencies were added.
Existing projects, sample assets, archive limits and `.EHS` format version 1
were not converted or replaced.

## Implemented architecture

### Separate instruments, patterns and Arrangement instances

[src/instrument-clips.js](./src/instrument-clips.js) defines:

- Instrument configuration remains on `track.sampler` / `track.drumRack`.
- `track.patterns` contains track-scoped stable pattern IDs, names, lengths
  in beats and independent note arrays.
- Each typed clip has its own ID, `kind: "instrument"`, `patternId`, bar
  position, `durationBeats`, `offsetBeats`, gain and loop state.
- Default duplication clones the pattern and note identities. An explicit
  linked-duplicate argument preserves the original pattern reference.
- Validation rejects missing references, duplicate identities, invalid notes
  and invalid clip geometry.

The opt-in legacy migration helper converts a whole-track pattern to a named
pattern and looping instance. It preserves instrument settings and existing
audio clips, fills legacy note defaults and is idempotent. Migration stages
all changes before replacement, so invalid notes do not partially convert
earlier tracks. **It is not called by application startup/import.** Final-note
tail equivalence and empty-pattern duration require further acceptance before
automatic migration is enabled.

### Unified editing helpers

[src/arrangement.js](./src/arrangement.js) now supports typed clips in split,
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

These are model APIs; existing workspace guards and clip gestures have not
yet been connected to the typed model.

### Shared live/offline scheduling

[src/instrument-playback.js](./src/instrument-playback.js) replaces duplicated
instrument scheduling in [src/audio.js](./src/audio.js).

- One event generator resolves patterns, clip boundaries, loop cycles,
  source offsets, notes, velocities and pad/sample configuration.
- One voice scheduler applies pitch, pan, gain and sampler envelopes in both
  live-compatible scheduling and offline rendering.
- Lookahead enumerates relevant cycles, including sustained/tail overlap;
  subsequent windows do not restart already scheduled notes.
- Seek/edit resume advances both the source and envelope. Transport-loop
  boundaries stop voices at the scheduled audio time.
- Typed clip voices stop at their clip boundary. The legacy fallback retains
  whole-track playback and final-note tails.
- Render duration includes positioned instrument clips and effect tails.
- Pattern edits enter the live playback signature, triggering the existing
  current-position rescheduling mechanism.

The existing **25 ms interval / 150 ms lookahead**, stable track inputs,
continuous silent transport, mixer/effect routing and mastering architecture
remain in place. No UI-timer loop restart was reintroduced.

## Verification

### Node, syntax and whitespace

- Baseline: **159 passed, 0 failed**.
- Final: **182 passed, 0 failed**; 23 added regressions. No tests removed.
- All seven changed/new JavaScript modules pass `node --check`.
- `git diff --check` passes.
- Existing GitHub Actions configuration uses Node 22 and `npm test`.
  The remote workflow was inspected, not executed or claimed passing.

Run from the repository root with Node 22:

```powershell
node --test --test-reporter=spec tests/*.test.js
```

New tests cover independent melodies/drums, stable references, defaults and
atomic migration failure, independent/shared duplication, compatible moves,
destination rejection, split/trim, mixed clipboard snapshots, gaps, partial
sustained notes, loop phase, undo/redo, voice boundaries, transport-loop
cutoff, bounded lookahead, current-position edits and render duration.

### Executed Chromium engine acceptance

Environment: Windows, VS Code integrated browser reporting Chromium
150.0.7871.250 / Electron 43.7.7. Node v22.23.4. This is browser automation,
not physical-device or microphone testing.

The deterministic fixture contains three tracks: imported-style audio,
a Sampler with separate Verse/Chorus patterns, and a Drum Rack with distinct
Kick/Fill clips. Fixtures and render engines live in memory; no test replaced
the user's active project or cleared IndexedDB.

Reproduction:

1. Serve the repository with `python -m http.server 8765`.
2. Open `http://localhost:8765`.
3. In the browser console:

```js
const checks = await import('./tests/instrument-browser-acceptance.js');
await checks.runInstrumentAcceptance();
await checks.runInstrumentRoutingAcceptance();
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
| Independent Sampler/Drum Rack model | Yes, internal | Node + browser signals | App creation/selection/editor binding |
| Pattern identity and independent/shared copies | Yes, helpers | Node | Shared-state indicators/actions in UI |
| Split/move/resize/duplicate/delete | Yes, helpers | Node | Typed-clip gestures and controls |
| Mixed section copy/paste, phase and sustained notes | Yes, helpers | Node | Remove workspace guards; mouse/touch UX |
| Pattern-aware Undo/Redo | Yes, helpers | Node | Editor/workspace history integration |
| Shared live/offline voices | Yes | Node + real OfflineAudioContext | Actual UI composition/live audition |
| Sidechain, mute/solo and mastering routing | Existing graph reused | New browser signal assertions | Full new-clip export matrix |
| Legacy migration | Opt-in helper | Identity/defaults/failure safety | Tail/empty-duration equivalence; startup/import activation |
| Existing legacy projects and `.EHS` v1 | Preserved | Existing regression suite | New-model archive validation/round trip |
| New-model project persistence | Not wired | Not tested end-to-end | Schema/feature signaling and clean-context round trip |
| Typed clip visuals/editor navigation/touch handles | No | Not tested | Required |
| New-clip MP3 export | Existing encoder unchanged | Not executed for new model | Required |
| Fractional-rate boundary precision | Investigated | Controlled numerical reproduction | Not fixed |
| Physical mobile devices / deployed GitHub Pages | No new verification | Not tested | Separate release validation |

The eight user-facing final acceptance steps are **not collectively passed**.
In particular, double-clicking the current whole-track instrument block still
opens its legacy editor, not an independent selected clip. This is the exact
visible limitation to reproduce in the current app.

## Compatibility and persistence boundary

Archive format and project schema remain version 1. No automatic migration
or new typed-clip archive acceptance is enabled. The current `.EHS` validator
rejects typed instrument clips because they do not carry audio-clip source
fields; it must not be bypassed to claim portability.

Before activation, coordinate project normalization, track creation, selected
pattern editors, typed-clip validation and archive reference limits. Decide
and document required-feature/minimum-app behavior rather than letting an
older renderer silently ignore independent patterns. Keep existing archives
and all referenced sampler/pad/audio assets valid. Preserve source buffers
and deduplicate PCM rather than embedding audio into pattern data.

## Changed files

- [src/instrument-clips.js](./src/instrument-clips.js): model, validation,
  migration, identity and source-phase helpers.
- [src/instrument-playback.js](./src/instrument-playback.js): shared event
  expansion and voice scheduling.
- [src/arrangement.js](./src/arrangement.js): typed editing, snapshots,
  clipboard, destination checks and history.
- [src/audio.js](./src/audio.js): shared scheduling integration, duration and
  playback-signature support.
- [tests/instrument-clips.test.js](./tests/instrument-clips.test.js): 23 tests.
- [tests/instrument-fixture.js](./tests/instrument-fixture.js): deterministic
  three-track/two-sample composition.
- [tests/instrument-browser-acceptance.js](./tests/instrument-browser-acceptance.js):
  reproducible Web Audio/WAV/routing and fractional-offset checks.
- [README.md](./README.md), [IDEA.md](./IDEA.md),
  [EHS_FORMAT_SPEC.md](./EHS_FORMAT_SPEC.md), this report: honest capability,
  compatibility and continuation documentation.

## Next milestone

1. Wire selected instrument clips into Piano Roll/Drum Sequencer with the real
   track ID retained for preview routing, per-pattern editor history/length,
   selected-pattern names and clear shared-reference feedback.
2. Replace the whole-track block with viewport-bounded typed-clip previews;
   add creation, open, loop, numeric and touch resize controls. Route both
   single-clip and range actions through the unified clipboard APIs.
3. Finalize legacy migration tails/empty-track semantics, then activate it
   atomically during project loading and track creation.
4. Implement JSON/`.EHS` reference validation, note/pattern limits and explicit
   compatibility signaling. Execute fresh-context archive round trips.
5. Execute the full mixed user workflow, live controls, WAV/MP3 decode and
   editing/reopen acceptance at 360/390/430/768/1280 px with synthetic touch,
   keeping physical-device validation separate.
6. Only after these pass, proceed to 005A performance finalization:
   reference-aware caches, chunked/streamed archives, long-project scheduling,
   native memory measurements and interruption/quota recovery.

The future **Recording Studio - Vocal & Live Instrument Overdub Workspace**
is added to the roadmap only. It will reuse immutable audio assets, audio
clips and the Arrangement clock for latency-compensated takes; it is not
Session View and is not implemented here.
