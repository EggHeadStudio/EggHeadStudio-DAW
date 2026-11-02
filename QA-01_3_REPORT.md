# QA-01.3 — Sample Library, Arrangement and Master Track

## Status

**QA-01.3 INCOMPLETE — Arrangement gesture acceptance and physical-device
checks remain open.**

This continuation completes a hierarchical Sample Browser, adds a fixed
Arrangement Master row tied to the existing master bus, and makes Stop
repeatable: Stop while playing holds the current position; pressing Stop again
returns to the beginning. It does not complete mobile Arrangement acceptance
or physical-device certification.

## Sample Browser UX correction

The browser now returns to a compact, single-tree presentation. Its toolbar has
only **＋ Folder** and **＋ Files**; Folder opens the Create Folder, Import
Folder and Import ZIP Pack actions. Factory Library and My Samples, nested
folders, and sample rows appear together in one vertically scrolling tree.
Folder edit/import actions use a contextual menu; Factory folders expose only
read-only information. Sample rows retain Preview and snapped-playhead Add.

| UX acceptance | Status | Browser evidence and limits |
|---|---|---|
| Single Factory/User tree; nested expand/collapse; no duplicate sample listing | Implemented; source Browser verified | Source Chromium displayed Factory Library and My Samples in the same tree. A sample appeared under its imported nested folder only. |
| Toolbar contains Folder and Files only; search directly below | Implemented; source Browser verified | Direct toolbar children were exactly **＋ Folder** and **＋ Files** at tested widths. Folder menu actions were hidden until opened. |
| Create, rename, move and remove via contextual folder menu | Implemented; source Browser verified | In-browser disposable QA folders were created, renamed, moved to root and removed; the final QA folder list was empty. Existing sample folders were not removed. |
| Desktop right-click, touch long-press and discoverable accessible menu | Implemented; synthetic source/build Browser verified | Mouse right-click opened a folder menu in source Chromium and at 1280px in the build. A synthetic touch-pointer hold opened it at 390px in source and the deterministic build; the three-dot menu remains visible/keyboard reachable. This does not certify physical touch. |
| Factory folder protection | Implemented; source/build Browser verified | Factory folders showed read-only information; the current build also exposed no move/hide actions on Factory sample rows. |
| Individual audio import into selected folder | Implemented; source Browser verified | Imported a non-silent WAV into `Kits`; browser metadata recorded `folder: Kits`. |
| Nested desktop folder import | Implemented; source Browser verified | Directory-input fallback imported `directory-source/Sub/DirectorySample.wav` under `Kits/directory-source/Sub`. The File System Access API path and physical picker were not independently certified. |
| Nested ZIP import and safety preservation | Implemented; source Browser and Node verified | Imported `Pack/Nested/ZipSample.wav` under `Kits/Pack/Nested`. Re-importing the same ZIP left one visible row for that sample. Existing ZIP safety unit tests remain enabled. |
| Search, sample preview and insertion at playhead | Implemented; source Browser verified | Search isolated the nested ZIP sample; Preview was activated. Add created a clip on the selected Audio track (1→2 clips); Undo restored the original count (2→1). |
| Reload persistence and no project/audio asset loss | Implemented; source Browser and Node verified | Folder paths and four User asset records persisted through reload; duplicate ZIP re-import did not add another sample. Add/Undo restored the original Arrangement clip count. Folder removal preserves referenced audio by design; no referenced sample folder was deleted in this browser run. |
| Compact layout at 320px, 390px and 1280px | Implemented; source Browser verified | The two-button toolbar remained stable. The tree viewport measured 96px at 320/390 and 377px at 1280; document scroll width did not exceed the viewport. No physical-device result is claimed. |

## Requirement acceptance

| Requirement | Status | Evidence and limitations |
|---|---|---|
| Factory and User library hierarchy | Implemented; Browser verified | Source Chromium browsed Factory `/drums`; the five drum samples appeared under the category. User samples appear in their nested folder. |
| Create, move, rename and remove User folders | Implemented; Browser verified; Node verified only | Source and deterministic `dist` Chromium created `Alpha` and `Beta`, moved `Alpha` into `Beta`, renamed it to `Gamma`, removed it, reloaded with `Beta` persisted, then removed `Beta`. Node tests verify that folder moves/removals retain asset IDs; browser removal of a populated folder was not run. |
| Import nested ZIP sample packs | Implemented; Browser verified; Node verified only | Source and `dist` imported a generated non-silent `Kits/QA-Import.wav` ZIP pack. The nested folder and asset SHA-256 metadata persisted through reload. Node tests cover traversal, compression-ratio and checksum rejection. ZIP64/encrypted entries and unsupported compression are rejected. |
| Legacy content deduplication | Implemented; Not fully verified | Missing fingerprints are computed lazily for same-size legacy User assets during a new import. No browser acceptance was completed against a pre-existing legacy library with duplicate bytes. |
| Master row and selected-device context | Implemented; Browser verified | Source and `dist` displayed a fixed 84 px Master row and selected it at 390x844. The Master volume slider reduced the built output peak meter from 27.2271% at unity to 13.6136% at 0.5, then was restored to unity. Source layout checks at 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390 found no page-level horizontal overflow and kept the Master label visible. |
| Master output meter uses the shared bus | Implemented; Browser verified | Playing a UI-inserted factory Kick updated both Master meter channels. Source displayed 15.0533% per channel at the sampled instant; `dist` displayed 35.7324% at 50 ms, then decayed toward zero. These are UI peak-meter percentages, not an exported-PCM or calibrated SPL measurement. |
| Stop and second-Stop behavior | Implemented; Browser verified | Source: first Stop held at 0.2587 s and second Stop reset to 0 s. `dist`: first Stop held at 0.0613 s and second Stop reset to 0 s. To Start remains available. |
| Mobile clip tap, pan, long-press/explicit move, resize and cancellation | Implemented; Blocked | The source Chromium touch attempt produced a `pointercancel` after the first move and left the clip unchanged. No move/resize acceptance is claimed from that attempt. Existing gesture unit tests and previous reports do not replace this required connected source/build gesture acceptance. |
| Scrolled timeline seek, pinch, cancellation and cross-track rejection | Node verified only; Blocked | Prior QA reports cover selected pinch behavior. This continuation did not complete the required nonzero-scroll, source-and-build gesture matrix or verify all compatibility boundaries. |
| Physical iPhone/Android and installed PWA | Blocked | No physical device or installed-PWA tests were available in this run. Synthetic browser input is not trusted physical touch. |
| `.EHS` compatibility and regression | Node verified only | The existing portable-project, archive, mastering and audio tests passed in the full Node suite. A new connected clean-origin `.EHS` round trip was not run for this continuation. |
| Official competitor-product documentation review | Blocked | The web-search service returned HTTP 504. No REAPER, Cubasis, Logic Pro, FL Studio Mobile, BandLab or Soundtrap guidance is claimed as reviewed. |

## Validation

- Full Node suite: **359/359 passed**.
- `node --check` passed for the changed UI modules, `src/app.js` and
  `src/workspace-ui.js`.
- Deterministic static build: two consecutive builds produced version
  `92452f71af3d997379cc` with 80 assets.
- `git diff --check`: passed.
- Source Chromium, Sample Browser UX correction: right-click and synthetic
  touch long-press menus; folder create/rename/move/remove; individual file,
  nested directory and ZIP imports into the selected folder; search, preview,
  Add/Undo, reload persistence, duplicate ZIP re-import and 320/390/1280px
  layout checks.
- Deterministic-build Chromium: current `92452f71af3d997379cc` build at 390px;
  toolbar/tree, Factory sample immutability, synthetic touch long-press and
  folder creation/removal. Full import parity against the build was not rerun
  for this UI correction.
- Previous source/build checks for the Master row, output metering and Stop
  behavior remain recorded above; they were not repeated as part of this UI
  correction.
- Chromium viewport/automation checks are not physical-device acceptance.

## Changes

- [src/sample-library.js](./src/sample-library.js): versioned local folder
  metadata, nested hierarchy, folder/sample operations, SHA-256 duplicate
  lookup and bounded ZIP-pack inspection/extraction.
- [src/portable-project.js](./src/portable-project.js): optional directory and
  archive limits for ZIP inspection; `.EHS` continues to use its existing
  stricter defaults.
- [src/app.js](./src/app.js): persistent sample organization, legacy
  fingerprint migration, ZIP/file import progress and cancellation,
  unified Sample Browser tree, folder/sample contextual actions and
  selected-folder imports, Master context selection and repeat-Stop behavior.
- [src/arrangement-workspace.js](./src/arrangement-workspace.js) and
  [src/arrangement.css](./src/arrangement.css): mobile clip interaction
  behavior and Arrangement trim/track-header styling.
- [src/workspace-ui.js](./src/workspace-ui.js) and
  [src/workspace.css](./src/workspace.css): persistent fixed Master row,
  Master volume and final stereo meter presentation, compact single-scroll
  Sample Browser layout.
- [src/audio.js](./src/audio.js) and [src/mastering.js](./src/mastering.js):
  left/right analyzers after the existing mastering chain, connected through a
  zero-gain sink so the output meter is rendered without adding audible signal
  or a second DSP path.
- [tests/sample-library.test.js](./tests/sample-library.test.js) and
  [tests/mastering.test.js](./tests/mastering.test.js): folder, ZIP security,
  factory-category and silent Master meter-sink regressions.
- Documentation: `SAMPLE_LIBRARY.md`, this report and linked status/acceptance
  updates.

## Remaining blockers

1. Reproduce and complete tap, pan, move, both trim handles, pinch/cancel,
   nonzero-scroll seek, undo/redo and compatible/incompatible cross-track
   operations against both source and `dist`. The touch run in this continuation
   ended in pointer cancellation before moving the clip.
2. Re-run connected production workflows and clean-origin `.EHS` round-trip
   acceptance for this continuation.
3. Perform physical-device browser/PWA testing using the checklist. Do not
   interpret Chromium emulation as trusted phone input.
4. Repeat official product-documentation research when the search service is
   available.

No commit, push or deployment was performed.
