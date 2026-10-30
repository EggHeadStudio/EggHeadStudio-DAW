# Batch 005B.5F.5 — Mobile production acceptance and defect closure

## Final status

**BATCH 005B.5F.5 INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

The source and deterministic build both received real UI-created Arrangement
clips and Chromium touch-emulation checks at 390x844. Clip movement, both trim
edges, compatible and rejected cross-track drops, duplicate/delete and
gesture-history behavior were verified. The requested connected Sample,
Recording, Mastering and Export workflows, clean-origin `.EHS` project
acceptance, PWA regression, pointer-cancellation coverage, multi-viewport
gesture workflows and physical-device input were not completed. No live-audio
acceptance is claimed for this batch.

## Requirement-by-requirement acceptance

Statuses are limited to **Implemented**, **Browser verified**, **Node verified
only**, **Blocked** and **Not implemented**. Synthetic CDP touch is browser
automation, not trusted physical input.

| Phase | Requirement | Status | Evidence / remaining work |
|---|---|---|---|
| Arrangement | Single-tap clip selection and action bar | Browser verified | Source Chromium, 390x844; tapped the UI-created audio clip and confirmed selection/actions. |
| Arrangement | 350 ms long-press move | Browser verified | Source and built Chromium; built clip moved from bar 0 to 0.125. |
| Arrangement | Explicit Move mode | Browser verified | Source UI moved a clip from bar 1.25 to 1.5; Undo restored 1.25 and Redo restored 1.5. |
| Arrangement | Start-handle resize | Browser verified | Source UI changed source start 0.5→1.0 s and bar 1.5→1.75, preserving end 4.5 s. |
| Arrangement | End-handle resize | Browser verified | Source UI changed end 5→4.5 s while retaining start 0.5 s. Built UI changed end 5→4.5 s while retaining start 0 s. |
| Arrangement | Compatible cross-track movement | Browser verified | Audio clip moved between two Audio tracks. Its bar/source boundaries were retained during the initial move. |
| Arrangement | Reject incompatible destination | Browser verified | Dropping the Audio clip on the Sampler lane preserved its Audio-track identity and produced “Incompatible destination: audio clips require a matching track type.” |
| Arrangement | Duplicate and Delete | Browser verified | Mobile action bar duplicated the clip; Delete removed the selected duplicate. |
| Arrangement | Undo/Redo after move, resize, duplicate and delete | Browser verified | Persisted project state was inspected after each action: move 1.25→1.5→Undo 1.25→Redo 1.5; trim Undo/Redo restored end 5/4.5; duplicate Undo/Redo restored counts 1/2; delete Undo/Redo restored counts 2/1. |
| Arrangement | Double-tap opens clip editor | Blocked | Not exercised against the UI. |
| Arrangement | Pointer cancellation/lost capture during move and resize | Blocked | A source cancellation automation attempt did not return a result; neither rollback nor lost-capture behavior is accepted. |
| Arrangement | Pinch zoom and cancellation | Browser verified | Source Chromium at 390x844 was verified in the 5F.4 continuation. Built pinch was not verified here; one attempted built gesture hit the loop overlay and moved the playhead instead of zooming. |
| Arrangement | Horizontal/vertical scrolling at nonzero offsets | Blocked | Browser pages were programmatically positioned to expose targets; native scrolling gestures and offset-sensitive edit math were not accepted in this continuation. |
| Arrangement | Loop/playhead positioning and Sample Browser insertion | Browser verified | Snapped Sample Browser insertion and playhead positioning were verified in the 5F.4 continuation. Loop dragging and insertion at multiple zooms were not repeated here. |
| Source/build parity | Critical Arrangement interaction in source and `dist` | Browser verified | Source and built apps both accepted UI-driven movement and end trim at 390x844. |
| Source/build parity | Equivalent complete project state in source and `dist` | Blocked | Separate UI-created projects were used; their complete serialized states were not compared. |
| Viewports | 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900, 844x390 | Browser verified | Built app mounted Arrangement and had no document-level horizontal overflow at all seven sizes. This is layout-only evidence, not gesture acceptance. |
| Viewports | Selection, move, resize, zoom, scroll, Mixer and Focus entry/exit at every size | Blocked | The complete interaction matrix was not executed at each viewport. |
| Sample Studio | Import/edit/zoom/preview/effects/A-B/save/cancel/original integrity | Blocked | No connected Sample Studio workflow was run for 5F.5. Existing partial checks are documented in the 5F.3/5D reports. |
| Recording Studio | Backing/armed track, synthetic input, emergency Stop, saved take, review/recovery and orientation | Blocked | No connected recording/recovery workflow was run for 5F.5. |
| Mastering | EQ/FFT/module navigation/A-B/limiter/render and measured output | Blocked | No connected mastering workflow or output measurement was run for 5F.5. |
| Export | Meaningful WAV/MP3, progress, cancel, retry and metadata/artwork | Blocked | No connected export workflow was run for 5F.5. |
| Instrument lifecycle | Active Sampler/Drum Rack source/pad/track removal and workspace exit | Node verified only | Existing Node regressions cover source cleanup; active-voice browser decay and unrelated-track continuity were not measured here. |
| Project integrity | UI-created connected project `.EHS` save and clean-origin restore | Node verified only | Portable-format Node tests ran in the full suite. This batch did not produce and restore a connected project archive. |
| PWA | Offline shell, safe update, IndexedDB and installed-app regression | Blocked | No PWA/offline/update browser acceptance was run. No worker/storage code was changed. |
| Regression | Full Node suite | Node verified only | `npm.cmd test`: 344 passed, 0 failed. |
| Regression | Syntax and whitespace checks | Node verified only | `node --check` passed for 133 JavaScript files under `src` and `tests`; `git diff --check` passed. |
| Regression | Two deterministic static builds | Node verified only | Both builds produced version `f75f2f0b3aecb929d247`, 68 assets and identical 1,831-file manifests (SHA-256 `5b9565f4485b6b2dea7f09904e86a4a66877f7dd6d3b45263d911f824d2cf6c2`). |
| Device acceptance | Trusted pointer input, physical iOS/Android, microphone and audio latency | Blocked | Only synthetic Chromium touch input was used. No physical device/browser was tested. |

## Browser evidence

All new UI acceptance in this report used a generated 5-second, 48 kHz,
440 Hz WAV imported through the browser file picker on disposable local
origins. The app created the tracks and clips through its UI; project state was
read back from the app's persisted project after operations. The source project
was reopened on the same origin and retained its clip data.

At 390x844, source Chromium verified selection, explicit movement, both trim
edges, compatible and incompatible cross-track moves, duplicate/delete and
Undo/Redo. At the same viewport, the deterministic `dist` app verified
long-press movement, Undo/Redo and end trim. These checks exercise real app
handlers with synthetic pointer/touch events. They do not establish trusted
input, phone ergonomics, live audio, or full source/build project parity.

Built-app layout checks at all seven requested sizes only measured
document-level width and Arrangement presence. A built pinch attempt landed on
the loop control; the playhead moved to 2.375 seconds while zoom remained at
100%, so that attempt is explicitly not counted as pinch acceptance.

No measured audio artifact was produced for 5F.5. Earlier live Sampler/Drum
Rack evidence remains in [the 5F.2 report](./BATCH_005B_5F_2_REPORT.md) and
does not substitute for the connected workflows required by this batch.

## Test-fixture correction

The host-side mobile browser fixtures set their viewport after the app had
already initialized. In Chromium, that left desktop-initialized Arrangement
state in place until reload. The mobile arrangement, workspace, production
and closure fixtures now reload immediately after setting 390x844, so the app
initializes with the intended media query. Reload preserves the disposable
origin's local project data; these fixture changes do not clear storage.

## Changed files

- `tests/mobile-arrangement-browser.js`
- `tests/mobile-workspace-browser.js`
- `tests/mobile-production-browser.js`
- `tests/mobile-closure-browser.js`
- `BATCH_005B_5F_5_REPORT.md`
- `MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md`
- `BATCH_005B_5F_REPORT.md`
- `BATCH_005B_5F_4_REPORT.md`
- `MOBILE_ARRANGEMENT_GESTURES.md`
- `MOBILE_PERFORMANCE_MODES.md`
- `README.md`
- `IDEA.md`

No application DSP, project schema, `.EHS` format, service worker, or audio
quality thresholds were changed. No commit, push or deployment was made.

## Exact blockers

Batch 005B.5F.5 cannot be accepted until the following are completed:

1. Verify double-tap clip editing, pointer cancellation/lost capture, pinch
   zoom/cancellation, native scrolling, loop/playhead operation and snapped
   insertion with nonzero offsets in source and `dist`.
2. Execute Arrangement/Mixer gestures at every requested viewport and compare
   equivalent source/build project results.
3. Complete the connected Sample Studio, Recording Studio, Mastering and
   Export workflows using one non-silent project; record measured outputs and
   recovery/cancellation results.
4. Measure active instrument voice cleanup through the browser and verify
   unrelated tracks continue playing.
5. Save the connected project as `.EHS`, restore it on a clean origin, and
   verify identities, clips, patterns, sample assignments, effects, recording,
   mastering settings, playback and WAV export.
6. Exercise PWA offline/update safety and IndexedDB persistence without
   clearing user data.
7. Leave all trusted-input and physical iOS/Android checks to actual-device
   testing; do not infer them from Chromium emulation.

Use the practical [physical-device checklist](./MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md)
for the separate user-led device gate.
