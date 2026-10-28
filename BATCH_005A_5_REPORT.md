# Batch 005A.5 - Precise Sample and Arrangement Editing

## Status

**BATCH 005A.5 INCOMPLETE - REMAINING FUNCTIONAL REQUIREMENTS**

### Transport / live-control follow-up

The original checkpoint below recorded 141 passing tests. The follow-up now passes **152/152** with 11 added regressions in [live-transport.test.js](./tests/live-transport.test.js); changed-JavaScript syntax checks and `git diff --check` passed.

- Non-loop transport no longer stops at the last audio clip; it advances through silence until stopped, with ruler extension as needed.
- Enabled loops clamp playback into the selected range and repeat independently of audio presence or last-clip duration.
- A 25 ms scheduler fills a 150 ms audio-clock lookahead. Sources are scheduled at exact loop boundaries and capped at the range end; the old 70 ms stop/restart loop timer is removed. Position wraps from the audio clock, not the timer's callback time.
- Scheduler underrun recovery replaces existing voices before resuming, avoiding doubled audio. This is not a guarantee against background throttling or long main-thread stalls.
- Effect topology rebuilds preserve the track input used by playing sources. Track effect/fader/pan/mute/solo edits therefore affect live audio; mixer/effect-only edits do not restart sources.
- Clip, note-pattern, instrument and loop edits reschedule at the current position, including active gated-note source/envelope phase. The old restart-playback notification is removed.
- Piano Roll fixes both double horizontal scrolling and vertical row offsets. Notes use local row coordinates, move to the correct pitch lane during dragging, and editing preserves scroll position.
- Offline export remains content-duration based. Shared effects/clip scheduling and `.EHS` v1 are preserved; Sample Studio's separately bounced preview processing is unchanged.

New Chromium evidence:

| Check | Result |
|---|---|
| Live enabled loop | Recorded source starts at 0.312, 0.812, 1.312 audio seconds: exactly 0.5-second intervals |
| Empty loop beyond audio | Still playing, position 2.20133 within the 2.0-2.5-second range |
| Loop disabled afterward | Still playing beyond the old range at 2.50533 seconds |
| Two-second offline loop schedule, 44100 Hz | 88200 frames; RMS in 220-frame windows before/at/after 0.5, 1.0, 1.5-second seams ranged 0.09644-0.10408, with no silent seam |
| Actual UI volume and added Utility during playback | Baseline left RMS 0.07255; volume zero gave 0; restored volume plus -20 dB Utility gave 0.006573 while playback continued |
| Scrolled mouse placement | scrollLeft 640 retained; beat 20 / MIDI 71 rendered at x185 for click x184, centered within 1 px vertically |
| Mouse note move | Beat 20 / MIDI 71 moved to beat 21 / MIDI 73, preserving duration |
| Synthetic touch, 390 px | Beat 20 / MIDI 71 rendered at x176 for touch x175; correct row and scrollLeft 640 retained |

These are local Chromium and synthetic audio/touch checks, not physical-device evidence. Original project data was restored after disposable UI fixtures. Structural device changes can reset effect tails, and voice rescheduling is not guaranteed click-free. Waveform discontinuities can click even when loop timing is exact. The original remaining-work items about mandatory playback restart and UI-timer looping are superseded by this follow-up; instrument clip/range work and the other listed acceptance limitations remain open.

### Track setup / elapsed-time follow-up

The current full suite passes **159/159**, with seven added regressions in [track-setup.test.js](./tests/track-setup.test.js). Syntax checks for changed JavaScript and `git diff --check` passed.

- New tracks can be named, colored and configured as Audio, Sampler or Drum Rack through a keyboard/touch-sized dialog. Existing + Sampler/+ Drum Rack shortcuts preselect the appropriate type. As confirmed by the user, Bass/Synth remain names, not new engine types.
- Sampler requires a decoded sample and uses existing pitch detection. Drum Rack supports empty pads or an optional starting sample. Shared factory defaults retain the direct Sample Studio instrument workflows.
- Track header/right-mixer Edit buttons change name/color. Type is intentionally fixed after creation to avoid destructive conversion of clips, note patterns or instruments.
- The global transport displays Arrangement position as `MM:SS.mmm` beside musical position, including minutes beyond 59. It updates from the same playhead tick for playback, seeks, loops, Stop and Return to Start, rather than a separate wall clock.
- Existing name/color/instrument fields persist through autosave, JSON and `.EHS` v1; no new schema or format change.

Executed Chromium checks created a colored Audio track, renamed/recolored it from the right mixer, created an empty 16-pad Drum Rack and created a pitched Sampler using the loaded fixture sample. Both header and mixer showed the new name; all three types/appearance settings survived reload. Cancel and Escape left no new track. Setup dialogs and elapsed-time readout fit 360/390/430/768/1280 px without page-level overflow.

Clock verification sought to about 65.125 seconds, displayed `01:05.135`, advanced to `01:05.346` while playing, froze at `01:05.455` after Stop, and reset to `00:00.000`. This uses current playhead position, not cumulative listening time. Original project tracks were restored exactly afterward; shared audio assets were not deleted. Browser measurements are not physical-device verification.

Additional changed files: [track-ui.js](./src/track-ui.js), [track-setup.test.js](./tests/track-setup.test.js), plus the existing app/model/timeline/workspace/styles/documentation surfaces.

This is a tested audio-editing checkpoint, not completion of the entire requested workspace. Existing Sampler/Drum Rack patterns remain functional, but independent instrument Arrangement clips and instrument time-range editing are not implemented. No commit, push or deployment was performed. Earlier Batch 005A performance changes in the worktree were preserved.

The audit followed the relevant editing, timeline, scheduling, persistence and layout paths; it was not a complete source-repository audit. The supplied attachment contained text, not accessible screenshot files.

## Implemented

### Sample Studio

- Zero-crossing snapping preserves exact Start frame 0 and exclusive End frame N.
- Numeric, fine and frame-nudge boundary controls use integer frames without unwanted interior zero snapping.
- End time is not rounded before being passed back to the editor.
- Endpoint handles point inward; waveform-wrapper overflow no longer changes scroll geometry during a boundary drag.
- Faint/translucent marker backgrounds remain visible without obscuring the waveform.
- Space invokes the actual selection-preview button when the workspace/waveform has focus.
- Preview/save continue to process a new buffer without changing the source.

Two endpoint defects were found: zero snapping chose an interior crossing, and the outward End handle enlarged/clamped the scrollable area during the gesture. Both were fixed rather than masking the displayed numeric value.

### Arrangement and workspace

- Beat ruler, insertion marker distinct from playback, Play from Marker, Follow, and Stop preserving position.
- Movable/resizable loop brace, Loop from Range and Select Loop; loop edits participate in undo.
- Pointer capture and cancellation for mouse/touch edits.
- Clip movement preserves the original pointer-to-left-edge offset and snaps the intended left edge.
- Audio edge trims preserve source offsets, rate and the opposite boundary.
- Full-height waveform canvases, including repeated loop-source phase; bitmaps cover only the visible source window, redraw on scroll/resize and release offscreen storage.
- Beat/track rectangular audio selection, boundary handles and numeric beat adjustment.
- Multi-track audio range copy, paste, duplicate, cut and non-ripple delete.
- Partial clips, empty gaps, relative track positions, source references, loop phase and fade positions survive slicing.
- Overlapping clips remain separate audible layers; paste does not silently deduplicate them.
- Clipboard operations reference audio assets rather than copying PCM.
- Project replacement clears history/clipboard so Undo cannot restore another project's clips.
- Undo does not erase a newly created track that was absent from its checkpoint.
- Right-side mixer strips share their track's scroll row and retain existing meter/fader/pan/M/S/FX handlers.
- Collapsible Samples, Mixer and bottom Devices surfaces; selected-track effects remain independent.
- Mobile defaults hide Samples/Mixer; explicit Select Range and Edit Clips (touch) modes leave ordinary touch scrolling available outside editing.

Instrument-containing time ranges and incompatible audio destinations report a warning rather than silently dropping notes. Instrument controls link to the existing instrument editor, not a new fully inline implementation.

## Architecture and compatibility

[timeline.js](./src/timeline.js) owns shared beat/time/pixel conversion and quantization helpers. Pointer coordinates use the ruler's current bounding rectangle, including scroll displacement exactly once. Dragging subtracts the original grab offset before quantizing the clip start.

[arrangement.js](./src/arrangement.js) owns non-destructive audio slicing, range clipboard operations, resize calculations and bounded clip/loop history. Workspace state contains a normalized beat/track rectangle and its intersections; the clipboard contains duration, track count and relative entries. Paste validates destinations before adding clips. Delete splits intersections without ripple.

[arrangement-workspace.js](./src/arrangement-workspace.js) mounts the gestures and workspace onto the existing application instead of replacing its audio engine, mixer handlers or instrument editors.

[audio.js](./src/audio.js) uses one clip-source scheduling helper in live/offline paths. Optional `loopOffset`, `envelopeOffset` and `envelopeDuration` preserve loop phase and original fade position after slicing. Legacy defaults and older-renderer caveats are documented in [EHS_FORMAT_SPEC.md](./EHS_FORMAT_SPEC.md). Archive/schema version remains 1; limits were not increased.

Audio edits do not replace the source buffer or delete library assets. Shared samples/IndexedDB were not cleared during this checkpoint. The pre-existing sidechain/mastering pipeline remains in use.

## Executed automated validation

Portable Node.js **22.23.4**:

```text
tests 141
pass 141
fail 0
cancelled 0
skipped 0
```

All 119 prior tests remain, plus 22 editing regressions in [arrangement-editing.test.js](./tests/arrangement-editing.test.js). Coverage includes:

- Exact 0/N endpoints, numeric frames and complete-frame render/WAV.
- Zoom/scroll coordinates, grab offsets, snap and loop edits.
- Source-aware trims, reveal, rate and fixed opposite edges.
- Selection normalization, partial multi-track clipboard, gaps and atomic failed destinations.
- Non-ripple deletion, undo/redo, loop snapshots and project history clearing.
- New-track undo safety and overlapping-layer cut/re-paste.
- Viewport-bounded waveform windows and scrolled source fractions.
- Loop phase/fade slicing and shared scheduler automation.
- Optional metadata `.EHS` round trip and legacy loop defaults.

JavaScript syntax checks passed for all top-level `src` and `tests` JavaScript files. `git diff --check` passed; Git reported only working-copy LF/CRLF conversion notices. The existing Node 22 GitHub Actions test command includes the new test file through its glob; remote CI was not executed.

## Executed Chromium checks

Tests ran against a local static server on Windows. The deterministic browser fixture uses four **audio tracks** named Drums/Bass/Synth/Audio and an eight-second 220 Hz source; these names do not imply actual instrument-pattern coverage. Fixture module: [arrangement-browser-fixture.js](./tests/arrangement-browser-fixture.js).

| Workflow | Measured result |
|---|---|
| Mouse clip grab at 10%, 50%, 85% | All snapped the intended 2.14-beat left edge to 2.25 beats; preview and committed 87.75 px matched |
| Mouse range/loop/history | Beats 2-10 on tracks 1-2 copied/duplicated; loop saved as bars 0.5-2.5; undo/redo restored content |
| Sample endpoints, zero snap on | Zoom 1 and zoom 6/scrolled: Start 0, End 384000/384000; displayed end 8 seconds |
| Sample touch at 390 px | Exact 0/N, no horizontal page overflow |
| Actual selection preview | 384000 decoded frames, 48000 Hz, eight seconds; start arguments `[0,0,8]` |
| Actual processed WAV save | 384000 frames, 48000 Hz, 768044 bytes |
| Space keyboard preview | Focused workspace displayed Playing processed selection, then Stopped |
| Touch range/loop | Beats 1-5, tracks 1-2; resize/move yielded loop bars 0.5-1.75 |
| Touch move/trim | Rate 1 retained; right then left trim yielded source 1.375-2.375 seconds at bar 1.5 |
| Zoom/scroll/Snap Off | At zoom 1.25, scrollLeft 200, clip placed at about 8.123 beats without changing source duration |
| Ruler seek | Restored 0.25-beat snap: raw 6.13 beats became 6.25 beats / 3.125 seconds |
| Mixer independence | Bass volume 0.42, pan -0.3 and one EQ; selecting Synth showed zero devices |
| Loop playback/Stop | Observed wrap from 3.5013 to 1.0 seconds; Stop retained 1.0587 seconds |
| Actual UI WAV export | 24-bit stereo/44100 Hz; decoded 410131 frames / 9.30002 seconds, peak 0.296004, RMS 0.126410 |
| Export UI analysis | -14.6 LUFS, -10.6 dBTP estimated; application estimates, not independent certification |
| Actual UI `.EHS` save/reopen | 708341 bytes; restored original tracks and loop fields exactly after an intervening edit; Undo disabled after import |

The `.EHS` reopen used the same browser context, not a new clean IndexedDB environment. The full WAV/MP3/Release ZIP matrix was not repeated for this checkpoint. Earlier batches' results remain historical evidence, not newly executed coverage.

Final review found a new memory risk from song-wide waveform canvases. Rendering now crops each canvas to the visible source interval, including loop phase, and uses animation-frame-throttled scroll/ResizeObserver updates. Hidden clips release bitmap storage. A Chromium stress check used four five-minute loop clips referencing existing short audio, at scrollLeft 12000: three visible canvases were at most 995 pixels wide in a 995-pixel desktop timeline, totaling 1,146,240 RGBA bitmap bytes; at a 390-pixel viewport, the 360-pixel timeline used at most 360-pixel canvases and 414,720 bitmap bytes. Visible waveforms contained rendered signal; the fourth offscreen canvas was zero-sized. The original project was restored afterward. These are canvas bitmap sizes, not total browser/native memory measurements or five-minute audio-export acceptance.

The keyboard range check initially appeared to add an extra clip after cut/re-paste. Inspection showed two legitimate overlapping intersections: an existing source tail and the newly pasted layer. Re-paste preserved both; the new regression checks equivalent summed source values rather than assuming unchanged clip counts after splitting.

### Sliced-loop offline measurements

Shared `AudioEngine.render` with mastering bypassed compared one four-second loop/fade clip against three slices at 1.5 and 2.25 seconds. Each result had 366031 frames at 44100 Hz, including the existing render-length/tail behavior.

| Playback rate | Maximum absolute error | RMS error |
|---|---:|---:|
| 1 | 4.49218e-14 | 1.16434e-16 |
| 1.25 | 0.00155142 | 0.000390853 |

The rate-1 result is effectively identical for this fixture. The fractional-rate result failed an initial 0.001 maximum-error target. Native source-offset/sample quantization is a possible cause, not a confirmed diagnosis. Fractional-rate slices are **not claimed sample-identical**; investigate before closing sample-accurate split acceptance.

## Mobile acceptance

Chromium layout checks at **360, 390, 430, 768 and 1280 CSS px**, height 1000, found no page-level horizontal overflow. Narrow layouts hid Samples/Mixer by default. Desktop mixer/lane top positions matched at 368, 492, 616 and 740 px.

Synthetic CDP touch exercised Sample Studio endpoints, range creation, loop resize/move and audio clip movement/both trims at 390 px, including horizontal scroll. This is actual browser touch-event automation, **not physical-device verification**. Piano Roll/Drum Rack touch, a complete mixer bottom sheet, accessibility and all controls at every width were not comprehensively accepted.

## Reproduction

1. Serve the repository statically and open the Arrangement workspace.
2. In a browser module context, call `createArrangementEditingFixture()` from `tests/arrangement-browser-fixture.js`; its result includes `archive`, `audio` and `project`.
3. Import `archive` through Open `.EHS`, accepting replacement only for a disposable test project.
4. Grab an audio clip at different horizontal offsets; move, snap, resize both boundaries and undo.
5. Enable Select Range; drag across two audio tracks, copy, seek the insertion marker, paste, duplicate, cut/delete and undo/redo. Include overlapping clips and empty gaps.
6. Set Loop from Range; drag the whole brace and each end. Use Play from Marker and verify Stop preserves position.
7. In Sample Studio load fixture `audio`; drag Start to 0 and End to N with zero snap on, then repeat at zoom 6 with scrolling. Preview and save a new processed sample.
8. Select different right-mixer tracks, adjust fader/pan and add a track EQ; confirm the bottom panel follows the selected track.
9. Export/decode WAV; save `.EHS`, edit, reopen and compare tracks/loop metadata. Undo must not bring back the replaced project.
10. Repeat the relevant pointer gestures with touch enabled at narrow widths; do not describe emulation as physical testing.

## Remaining functional work / limitations

1. **Instrument Arrangement clips:** Sampler/Drum Rack still repeat a whole-track pattern. Independent pattern clips, drag/resize/copy/delete and mixed audio/instrument ranges need an explicit compatible model and live/offline scheduler implementation.
2. **Live editing:** current-position rescheduling is implemented in the follow-up above. It is not guaranteed click-free, and structural device edits can reset tails.
3. **Loop engine:** audio-clock lookahead replaces the timer-restart design in the follow-up above. Physical timing, prolonged-stall behavior and discontinuous waveform seam quality remain validation concerns.
4. **Fractional rate:** investigate the measured slicing mismatch above; do not claim exact sample alignment.
5. **Devices/mobile:** instrument controls still open existing editors. Fully inline instruments, a fully integrated mobile mixer sheet and broader accessible touch/keyboard workflows remain.
6. **Release acceptance:** physical devices, Firefox/WebKit, physical audio output, complete new instrument workflow, full export-format matrix and a fresh-context archive round trip were not rerun here.
7. **Performance:** no new long-project export/memory claim. Batch 005A's streaming/chunked archives, bounded cache policy, long-project scheduling/virtualization and quota/interruption recovery remain open; see [BATCH_005A_REPORT.md](./BATCH_005A_REPORT.md).

These are not all external certification gates: the instrument and live-edit/workspace items are actual unfinished functionality. Batch 005A.5 cannot be marked complete.

## Changed files for this checkpoint

- UI integration/styles: [app.js](./src/app.js), [arrangement-workspace.js](./src/arrangement-workspace.js), [arrangement.css](./src/arrangement.css), [index.html](./index.html), [sampler.css](./src/sampler.css).
- Editing/DSP/persistence: [sample-editor.js](./src/sample-editor.js), [arrangement.js](./src/arrangement.js), [timeline.js](./src/timeline.js), [audio.js](./src/audio.js), [project-state.js](./src/project-state.js), [portable-project.js](./src/portable-project.js).
- Tests: [arrangement-editing.test.js](./tests/arrangement-editing.test.js), [arrangement-browser-fixture.js](./tests/arrangement-browser-fixture.js).
- Documentation: [README.md](./README.md), [IDEA.md](./IDEA.md), [EHS_FORMAT_SPEC.md](./EHS_FORMAT_SPEC.md), this report.

Some listed files also contain the preserved earlier 005A changes. Archive Worker/waveform-cache/sidechain performance changes and their tests/report belong to that earlier checkpoint; this report does not reattribute or overwrite them.

## Continuation

Finish compatible instrument clips and mixed-range scheduling first, then fractional-rate alignment, long-stall/click-free live-edit behavior and the remaining device/mobile acceptance. Continue the existing 005A performance backlog separately. Batch 005B should retain real-device touch/audio, browser compatibility, latency, accessibility and production-reliability priorities; no new major batch was implemented here.
