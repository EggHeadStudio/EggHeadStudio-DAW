# Batch 005A.7 Report — UX Completion & Reliability (checkpoint)

**BATCH 005A.7-UX: COMPLETE for the emulated-browser scope (see limitations).**
**BATCH 005A.7: INCOMPLETE — recording browser acceptance, benchmarks, streaming .EHS, storage/scheduler fault injection not executed.**

Batch 005B is NOT recommended yet.

## Superseding 005A.7B reliability checkpoint

See [BATCH_005A_7B_REPORT.md](./BATCH_005A_7B_REPORT.md) for the latest results. Synthetic recording browser acceptance, recorded-project clean-origin restoration/export, five-width Drum Rack/velocity touch, storage quota/corrupt-recovery, archive cancellation and actual live/offline processor-crash checks have now been executed. ZIP output is chunked, not end-to-end streamed. The stale instrument workflow script has been updated. The historical outstanding-items lists below describe the earlier checkpoint, not the current state; long-project export/native-memory closure still blocks full 005A.7 sign-off.

## 1. Implemented functionality
- Piano Roll velocity lane (`src/piano-layout.js`, `src/sampler-ui.js`, `src/sampler.css`): collapsible, one bar per note, shares the Piano Roll scroll/zoom coordinates, mouse + touch vertical drag, multi-note drag (anchor delta applied to all selected, clamped), one Undo step per gesture, writes `note.velocity` (the single velocity model), syncs the toolbar slider (which remains the default for new notes).
- Fix: `.note-resize` is `min(10px,35%)` wide so short notes can be moved by touch.
- Dynamic Drum Rack, key column and clip workflow from the earlier 005A.7-UX segment are unchanged.

## 2. Modified files
`src/piano-layout.js`, `src/sampler-ui.js`, `src/sampler.css`, `tests/velocity-lane.test.js` (new), plus the files listed in `BATCH_005A_7_UX_REPORT.md`.

## 3. Automated tests
`node --test tests/*.test.js`: **241 / 241 pass** (234 baseline + 7 velocity-lane). `node --check` on changed JS passes. `git diff --check` reports only CRLF notices.

## 4. Browser tests (integrated Chromium, fresh `*.localhost` origins; emulated, no physical device)
- Drum Rack acceptance (real UI): 1 empty pad; Add Pad x3; 4 samples assigned; steps; all pads previewed; unreferenced removal has no dialog; referenced removal shows Cancel/Keep/Delete; Cancel changes nothing; Keep leaves the note unmapped without remapping; new pad takes a fresh note; Delete removes the notes; step rows follow pad count.
- Velocity lane: bars align with notes at 1280 px; mouse drag 0.85→0.25; Undo/Redo verified; toolbar slider syncs.
- Touch (CDP `Input.dispatchTouchEvent`, 360 px): note create, resize, move (+1.5 beat, +2 pitch), velocity drag, vertical scroll, horizontal scroll with velocity lane following; no accidental edits.
- No page horizontal overflow at 360/390/430/768/1280 px (Piano Roll view).
- NOT done by touch: Drum Rack pad select, Add/Remove Pad and step toggling at every width.

## 5. Audio verification
WAV export of the test project (Kit + Lead sampler + utility effect): 8.30 s, peak 0.521, 227k non-silent samples. The clean-profile re-export matches (peak 0.52117 vs 0.52117, RMS 0.0726, 4 samples differ in the 0.001 threshold count, consistent with TPDF dither). Not a bit-exact claim.

## 6. .EHS verification
Project (dynamic Drum Rack with 3 pads, independent patterns, Lead sampler with velocities 0.25/0.85/0.85/0.40, utility effect, clips) exported to .ehs (137 KB) and imported into a fresh origin. All 6 tracks compared via JSON: identical (pad ids, notes, velocities, clip positions, effects). Container v1 unchanged.

## 7. Performance measurements
Not executed (4 tracks/30 s, 12/3 min, 24/5 min benchmarks outstanding). No claims made.

## 8. Known limitations / remaining
- Recording browser verification (punch, pre-roll, calibration, permission denial, interrupted recording, save retry, WAV download, .ehs restore, export with recording): only Node-tested.
- Benchmarks and bottleneck optimisation; large-.ehs streaming/worker/cancellation (limits not raised); autosave, IndexedDB quota, AudioContext suspension, background-tab fault injection.
- Touch acceptance for Drum Rack controls; other browser engines not tested.
- After reload the sample library lists only assets referenced by the project (pre-existing); unreferenced imports stay in IndexedDB.
- `tests/instrument-workflow-ui.js` is a stale browser script using removed selectors.

## 9. Physical-device verification
None. All touch tests are emulated Chromium events.

## 10. Readiness for Batch 005B
Not ready: finish recording browser acceptance, benchmarks and large-project/storage reliability first.
