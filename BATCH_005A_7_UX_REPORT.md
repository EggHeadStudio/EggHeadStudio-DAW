# Batch 005A.7-UX Report — Instrument Workflow Cleanup, Dynamic Drum Pads & Piano Roll

## Changed files
- New: `src/drum-pads.js`, `src/piano-layout.js`, `tests/drum-pads.test.js`
- Modified: `src/app.js`, `src/project-state.js`, `src/portable-project.js`, `src/arrangement-workspace.js`, `src/drum-rack-ui.js`, `src/sampler-ui.js`, `src/sampler.css`, `README.md`, `IDEA.md`, `EHS_FORMAT_SPEC.md`
- Existing tests adjusted for intended behaviour changes only: `tests/instrument-workflow.test.js` (new rack has 1 pad; further pads via `addPad`), `tests/pattern-editor.test.js` (Piano Roll world width now includes the 56 px key column).

## Workflow cleanup
- Track-header "Instrument" button removed; `+ Pattern` kept. Device Panel keeps a setup action ("Drum Rack Setup" / "Sampler Setup") for tracks with no clips.
- "Open Piano Roll" removed from the Drum Rack; the Piano Roll has no Drum Rack link. Drum tracks always open the Drum Rack editor.

## Pad architecture
- Pads have stable string ids and an explicit `note` mapping (default 36+index); array position is display order only.
- A new rack has one empty pad. Add (max 32), remove, rename, assign, replace, clear, preview and reset are supported. `nextFreeNote` never reuses a note used by a pad or a stored pattern note.
- Removing a pad referenced by notes asks: Cancel / keep notes (silent orphans) / delete notes. The last pad cannot be removed.
- Step Sequencer shows one row per visible pad; new step notes also carry `padId`.
- Legacy 16-pad projects: nothing is deleted. Leading pads that hold a sample, custom name/settings or a referenced note stay visible; trailing untouched defaults are hidden and revealed by Add Pad. `drumRack.visibleCount` persists the floor.

## Piano Roll coordinate system
One module (`piano-layout.js`): rows run from MIDI 108 (top) to 24; `rowTop = (108 - midi) * rowHeight`, `midiAtY = 108 - floor(y/rowHeight)`. A sticky 56 px key column sits left of the lanes inside the same scroller, so keys stay horizontally fixed and scroll vertically in sync. Clicking/tapping a key previews it and highlights the key and lane. Key zoom slider is vertical pitch zoom. The pitch scroll position is remembered across re-renders (initially top = G5 region, C4 visible).

## Sample hint
Samplers without a sample show "Choose Sample" and "notes you place become audible after you assign a sample". Nothing is auto-assigned; changing the sample does not touch notes.

## Test evidence
- Node suite: 234/234 passing (224 preserved + 10 new in `tests/drum-pads.test.js`). `git diff --check` clean (only CRLF notices).
- Chromium (integrated browser, desktop emulation via viewport resize) on a fresh `.localhost` origin: Drum Rack starts with 1 pad, Add Pad → 3 pads, step rows follow pad count, no "Open Piano Roll"; Sampler Piano Roll shows 85 keys, C4 key row aligned with C4 lane (offset 0 px), C#4 directly above, keys fixed at the left after horizontal scroll, vertical sync offset 0, key click highlights key and lane — at 360, 390, 430, 768 and 1280 px, no horizontal page overflow.

## Historical limitations at the original 234-test checkpoint
- The velocity editor and browser checks below were outstanding then; see the superseding updates.
- Dropping notes on a removed pad ("keep") leaves them silent orphans.
- Not tested in this pass: synthetic touch note creation, pad removal dialog in browser, `.ehs` browser round trip with dynamic pads (Node JSON round-trip covered), pad-grid visual screenshots at all widths, live/offline equivalence test for a dynamic rack beyond existing instrument tests.
- Firefox/Safari and physical devices were not tested.

Original checkpoint status: incomplete. Superseded by the velocity-lane checkpoint and 005A.7B evidence below.

## Update (velocity lane & acceptance)
- Velocity lane implemented; Drum Rack browser acceptance, 360 px emulated touch editing and a clean-profile .ehs round trip verified. See BATCH_005A_7_REPORT.md. Status: complete for emulated-browser scope; touch checks for Drum Rack controls outstanding.

## Batch 005A.7B acceptance update

**BATCH 005A.7-UX COMPLETE for the tested Chromium scope.** The maintained `tests/instrument-workflow-ui.js` now exercises dynamic pad creation, current editor selectors and reload. Synthetic CDP touch verified pad selection, Add Pad, referenced removal Cancel/Delete and step editing at 360/390/430/768/1280 px, without page overflow. At the same widths, velocity touch edits changed the stored values and max-scroll positions matched exactly at 2.5x time zoom (1358/1328/1288/950/456 px). Velocity bars now refresh their accessible names during dragging as well as their heights/titles. Physical touch devices and non-Chromium engines remain unverified. Full reliability/performance status is separate in `BATCH_005A_7B_REPORT.md`.
