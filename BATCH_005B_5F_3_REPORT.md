# Batch 005B.5F.3 — Mobile Focus Workspaces & Instrument Lifecycle Safety

## Status

**BATCH 005B.5F.3 INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

This continuation implements workflow-stage navigation for the existing Sample
Studio, Mastering and Export workspaces, pins existing controls in Focus Mode,
and releases AudioEngine sources owned by removed or reconfigured instrument
tracks. It is not complete mobile-production acceptance. Connected recording
and recovery, meaningful-audio export, built-app workflows, live voice
removal/replacement, trusted pointer behavior, AudioContext recovery through a
trusted gesture and physical-device verification remain open.

No project format, project-state model, PWA update behavior, effect engine or
mastering DSP was replaced. No Session View was added. This report does not
claim physical-device compatibility.

## Requirement-by-requirement acceptance

| Area | Requirement | Status | Evidence / limitation |
|---|---|---|---|
| Lifecycle safety | Stop sources owned by a removed instrument track | Node verified only | AudioEngine cleanup uses track ownership; regression coverage verifies removal stops only that track's sources. No live UI removal while a voice is sounding was performed. |
| Lifecycle safety | Stop voices on Sampler source/settings replacement | Node verified only | Regression coverage changes the Sampler source signature and verifies its source is stopped. Live-browser replacement during active playback remains unverified. |
| Lifecycle safety | Stop voices on Drum Rack sample replacement and pad removal | Node verified only | Regression coverage changes an assigned pad sample and removes a pad while its source is registered. Live-browser pad replacement/removal during active playback remains unverified. |
| Lifecycle safety | Workspace switches, pointer cancellation/lost capture, AudioContext suspension/recovery | Blocked | Existing focus exit releases held instrument voices and cancellation is covered by existing tests. No connected lifecycle acceptance for active removal, native lost capture or trusted AudioContext recovery was completed. |
| Sample Studio Focus | Waveform/edit stage, record/import, effects and save navigation | Browser verified | Source-app Chromium checked Sample import, adding an effect, retaining the selected Effects stage, and keeping the existing transport visible. Exact frame-level edits, processed playback, save/cancel and original immutability were not tested as a complete workflow. |
| Sample Studio Focus | Persistent Play/Pause/Stop, A/B, loop preview and live effects | Implemented | Focus toolbar moves the existing controls, preserving their handlers and state. Full connected interaction coverage and meaningful audio measurements for each control are not accepted in this batch. |
| Recording Focus | Backing track, armed track, input meter, record, Emergency Stop, waveform, take review and recovery | Implemented | Focus pins the existing Recording Studio controls; capture and take buffering remain in the established controller. No end-to-end microphone recording/recovery browser workflow was completed. |
| Recording Focus | Orientation changes do not discard or interrupt buffered recording | Blocked | No recording was kept active through an orientation change in this continuation. Physical-device behavior remains untested. |
| Mastering Focus | One selected module, navigation and existing shared DSP/analysis controls | Browser verified | Source Chromium checked module navigation and Mastering mode selection without remounting Focus. Full EQ/FFT/A-B/mastering render and measured analysis acceptance was not repeated for this batch. |
| Export Focus | WAV/MP3, quality, metadata, actual progress, cancel/error recovery, download/review | Browser verified | Source Chromium completed a WAV render and showed the repeat-download link; an MP3 render completed but automation did not capture its native download event. The rendered project was empty and analysis reported silence (`-∞ LUFS`), so meaningful-audio export is not accepted. Progress cancellation and error recovery were not exercised. |
| Shared Focus | Reuse authoritative state/DOM, preserve undo/playback, clear Done/Back, touch layout | Browser verified | Existing DOM controls are moved, not cloned. Sample stage retention, Mastering navigation and Export stages were exercised. Export layout had no document-level horizontal overflow at 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390. These viewport checks are not complete workflows at every size. |
| Shared Focus | Orientation safety, recording/export safety, browser/PWA parity | Blocked | Emulated resizing left Focus mounted; landscape suggestion UI may appear. Recording, active export interruption, standalone PWA and physical orientation were not verified. |
| Connected acceptance | Complete Sample, Recording, Mastering and Export workflows at 390x844 | Blocked | Only partial source-app workflows were checked. Recording/recovery, Sample save/cancel and meaningful-audio export are outstanding. |
| Connected acceptance | Project persistence and clean-origin `.EHS` round trip for this batch | Node verified only | This continuation did not repeat the prior 5F.2 UI archive round trip. It must not be treated as new 5F.3 acceptance. |
| Built application | Run connected workflows against deterministic static build | Browser verified | Built app version `e3f438128b458fa086ef` loaded in Chromium. Export Focus stage navigation and 390x844 no-horizontal-overflow were checked; an empty-project WAV render completed and the app reported download verification. This is a smoke workflow, not acceptance of meaningful audio or the other workspaces. |
| Device acceptance | Trusted pointer/microphone and physical-device layout/audio | Blocked | Automation used synthetic browser interactions; no physical device or trusted microphone workflow was tested. |
| Regression | Full test suite, syntax checks, deterministic double build, diff check | Node verified only | Results are recorded below. These automated checks do not replace browser, device or connected-workflow acceptance. |

## Implementation summary

- `src/mobile-focus.js` adds workflow navigation for Sample Studio, Mastering
  and Export and moves existing action/transport nodes into the focus toolbar.
  Existing nodes are returned to their original locations on exit; state and
  event handlers are not cloned.
- `src/app.js` adds the repeat-download link for a completed Export render and
  keeps Mastering mode changes in-place so they do not remount Focus.
- `src/mobile.css` and `src/workspace.css` style the workflow navigation and
  compact focus presentation.
- `src/audio.js` associates live sources with their owning track and compares
  Sampler/Drum Rack source settings during track synchronization. Removed or
  reconfigured instruments release the sources for that track; unrelated
  tracks are not stopped.
- `src/recording-studio.js` tags take-preview sources with their owning track.
- `tests/audio.test.js` covers track-scoped cleanup for Sampler replacement,
  Drum Rack sample replacement, pad removal and track removal.

## Browser evidence and limitations

Source-app Chromium checks were made against the latest focused UI on a fresh
origin to avoid stale module responses. At 390x844, Sample import and an
effect-stage transition preserved Focus and kept the transport accessible.
Mastering module selection and mode changes were exercised in Focus. Export
Focus completed an empty-project WAV render and showed its review/download link;
the empty project's measured analysis was near-silence. An MP3 render
completed, but no native download event was observed. Neither render
demonstrates musical-content quality or parity.

The deterministic built application was also served from `dist` and opened in
Chromium. At 390x844, Export Focus exposed all five stages without document
horizontal overflow. Clicking **Render & Export** completed the actual empty
project WAV render; the app reported `-Infinity LUFS`, `-133.3 dBTP estimated`
and `WAV export verified and downloaded`. This establishes a built-app export
smoke check only, not a meaningful audio or release-quality result.

At 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390, the
Export focus layout retained its render action and showed no document-level
horizontal overflow. This was responsive layout inspection, not complete
connected-workflow acceptance at each viewport. The 844x390 check was an
emulated resize, not a physical orientation change.

Prior Batch 005B.5F.2 live Sampler/Drum measurements and clean-origin `.EHS`
results are documented in [BATCH_005B_5F_2_REPORT.md](./BATCH_005B_5F_2_REPORT.md);
they are not new evidence for the 5F.3 recording, mastering or export gates.

## Validation

Validation completed:

- `node --test tests/*.test.js`: **342 passed, 0 failed**.
- `node --check` passed for all JavaScript files under `src`, `tests` and
  `scripts`.
- Two consecutive static builds both produced version
  `e3f438128b458fa086ef` with 68 source assets; SHA-256 hashes of all files
  under `dist` matched between runs.
- `git diff --check` passed.
- Built-app browser evidence is limited to the empty-project Export Focus
  smoke workflow described above.

Browser/device limitations above remain regardless of automated test results.

## Changed files

- `src/audio.js`
- `src/recording-studio.js`
- `src/mobile-focus.js`
- `src/mobile.css`
- `src/workspace.css`
- `src/app.js`
- `tests/audio.test.js`
- `BATCH_005B_5F_3_REPORT.md`
- `BATCH_005B_5F_REPORT.md`
- `MOBILE_PERFORMANCE_MODES.md`
- `README.md`
- `IDEA.md`

The worktree also contains pre-existing untracked Batch 005B.5F reports,
performance-mode code and tests. They were not removed or rewritten as part of
this continuation. No commit, push or deployment was performed.

## Final status

**BATCH 005B.5F.3 INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

The blockers are end-to-end recording/recovery, complete Sample Studio
save/cancel and preview acceptance, Mastering analysis/render acceptance,
meaningful-audio WAV/MP3 export with progress/cancellation/error recovery,
built-app workflow checks, active live instrument removal/replacement,
trusted-pointer/AudioContext recovery checks and physical-device testing. Do
not treat this 5F.3 report as acceptance of later work. The separate 5F.4
continuation and its remaining blockers are documented in
[BATCH_005B_5F_4_REPORT.md](./BATCH_005B_5F_4_REPORT.md).
