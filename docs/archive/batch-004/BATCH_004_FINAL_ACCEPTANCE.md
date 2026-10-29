# Batch 004 Final Acceptance

**BATCH 004 FUNCTIONALLY COMPLETE — READY FOR BATCH 005**

Batch 004 is closed for the tested browser workflow. A deterministic multi-track project passed portable archive, editing, playback, mastering, export and release-package checks. One portability defect found during acceptance—omission of inactive custom mastering presets from `.EHS` exports—was fixed. The changed worktree has not been committed, pushed or deployed.

This is functional acceptance, not formal mastering certification, physical-device verification, broad browser certification or a production deployment sign-off. The current true-peak figure is an estimate. See the Phase reports for details on earlier DSP and feature tests.

## Acceptance matrix

| Area | Status | Evidence and limits |
|---|---|---|
| Eight-track production project | **Implemented and functionally verified** | Deterministic fixture includes imported WAV/MP3, simulated microphone and processed samples, two Samplers, a 16-pad Drum Rack, multiple note/step patterns, arrangement clips, track effects, kick-to-bass sidechain, mastering, export settings, release metadata, artwork and a custom preset. |
| Sample Studio and instruments | **Functionally verified** | Chromium editing/save/reuse, Sampler creation, Piano Roll note insertion, Drum Rack pad trigger and step editing. The recording asset was simulated; no microphone hardware was tested. |
| Arrangement, mixing and sidechain | **Functionally verified for generated project** | Playback advanced the transport and track meters; the sidechain reference persisted. Mute/solo and prior sidechain/export fixtures are covered in earlier phase evidence. No physical loopback or universal live/offline null comparison was performed. |
| Mastering and audio exports | **Functionally verified for generated project** | 16-bit PCM, 24-bit PCM and 32-bit float WAV plus 320 kbps MP3 exported and decoded. In-app analysis reported matching loudness/peak values for the same stable render. WAV LIST/INFO and MP3 APIC metadata were inspected in the browser; this is not independent parser certification. |
| Portable `.EHS` round-trip | **Functionally verified** | Cleared app project localStorage and asset IndexedDB, imported the archive, restored seven referenced assets without the original local sample folder, played, edited and saved a second archive. The seven audio SHA-256 values were unchanged. |
| Archive and project safety | **Functionally verified** | Corrupt archive import failed without replacing the active project; cancelling project replacement preserved it; New Project retained the shared sample library; reload recovered the saved project. The app has one local active-project autosave slot, not a multi-project library, so cross-project inventory/deletion isolation was not testable. |
| Release ZIP | **Functionally verified** | ZIP included one mastered WAV, one MP3, `metadata.json`, `release-info.txt` and cover artwork. Both audio outputs were from the same render and were checked against metadata. The editable `.EHS` remained separate. |
| Responsive layouts | **Functionally verified by browser emulation** | Arrangement, Sample Studio, Mastering and Export Studio had no horizontal page overflow at 360, 390, 430, 768 and 1280 CSS px. This did not test real touch gestures. |
| Node regression suite | **Passed** | Portable Node.js 22.23.4: **110 passed, 0 failed**. Phase 6 added `tests/production-acceptance.test.js`; JavaScript syntax checks and `git diff --check` are final checks for this worktree. |
| GitHub Actions | **Configuration inspected; remote run not performed** | Workflow is configured for Node 22 and `npm test` on push/PR. No push or PR was made. |
| Static asset loading | **Locally verified, not release validated** | The local static server returned HTTP 200 for the app, CSS, JS, workers, AudioWorklets, LAMEJS and fflate. This is not a deployed GitHub Pages or repository-subpath test. |
| Physical-device, touch and microphone acceptance | **Not tested** | Browser context did not enable touch; physical iOS/Android devices, real microphone permissions/capture and audio-output loopback were unavailable. |
| Independent EBU/ITU standards vectors | **Not tested** | No independent published LUFS/LRA/true-peak reference-vector run was completed. The reported true-peak value remains an estimate, not certification. |
| Medium/large workload baseline and browser matrix | **Not tested** | 12-track/3-minute and 24-track/5-minute actual exports, native memory/RSS, initial load timing and cross-browser runs remain for Batch 005. |
| GitHub Pages deployment of this revision | **Not tested** | The current unpushed worktree was not deployed. |
| Critical functional failures | **None found in completed scope** | No claim is made about untested physical devices, standards compliance or workloads. The inactive-preset archive defect was fixed and regression-tested. |

## Measured browser results

Test host was Windows x64, Electron 43.7.7 / Chromium 150.0.7871.250, `hardwareConcurrency=24`, `deviceMemory=32`. This is a single desktop fixture/runtime, not a platform baseline.

| Measurement | Result |
|---|---|
| Fixture | 8-track source project and 9-track edited project; approximately 34.6-second stereo render at 44.1 kHz |
| Export duration | 7.4–7.7 seconds for the tested 34.6-second project |
| `.EHS` import / save | 229 ms / 252 ms |
| Peak observed JavaScript heap | 70.2 MiB; excludes Web Audio/native allocations and is not process RSS |
| 16-bit PCM WAV | 6,101,110 bytes; 34.585714 s; stereo, 44.1 kHz |
| 24-bit PCM WAV | 9,151,570 bytes; 34.585714 s; stereo, 44.1 kHz |
| 32-bit float WAV | 12,202,030 bytes; 34.585714 s; stereo, 44.1 kHz |
| MP3 | 1,384,805 bytes; CBR 320 kbps; stereo, 44.1 kHz; decoded duration 34.612245 s due to encoder frame padding |
| Decoded-file analysis | -21.1 LUFS, -7.5 dBFS sample peak and -7.5 dBTP estimated for the stable project |
| Release ZIP | 6,616,772 bytes; five expected entries (WAV, MP3, metadata, release notes and artwork) |
| Memory estimator (not a measured allocation) | 230.5 MiB for 12 tracks/3 minutes and 341.6 MiB for 24 tracks/5 minutes, stereo 24-bit/44.1 kHz; warning threshold is 192 MiB |

## Test and reproduction notes

### Automated tests

Run the full suite from the repository root with Node.js 22:

```powershell
npm test
```

The Phase 6 archive fixture is in `tests/production-acceptance.test.js`. It generates eight editable tracks, six source audio assets and a custom preset, writes/opens a portable archive in memory, and checks project state, references, artwork, MP3/WAV properties and per-asset SHA-256 equality.

### Browser workflow covered

The acceptance browser used a deterministic multi-track `.EHS` fixture and followed this sequence:

1. Import the project and check its eight tracks and referenced assets.
2. Open and edit an audio sample in Sample Studio; preview and save a new sample.
3. Create a Sampler from the saved sample, add a Piano Roll note, trigger a Drum Rack pad and add a sequencer step.
4. Play the arrangement and check transport/meter activity and the bass compressor's kick sidechain reference.
5. Open Mastering, render and export the same project in 16-bit, 24-bit and float WAV and 320 kbps MP3; inspect and decode each output.
6. Create the Release ZIP and inspect its audio, metadata, notes and cover entries.
7. Clear the app project localStorage key and asset IndexedDB store, reload, import the `.EHS` without the original sample folder, and verify media/playback.
8. Edit the restored project, save a second `.EHS`, reopen it from another clean state, compare audio SHA-256 values and confirm settings persist.
9. Attempt a corrupt archive import and cancel project replacement; confirm the active project remains intact. Create a new project and confirm shared sample-library assets remain.
10. Reload to check autosave recovery; repeat layout inspection at 360, 390, 430, 768 and 1280 CSS px.

The browser fixture and measurements above were generated for this acceptance run and are not committed as test media. The automated test reproduces the project/archive integrity checks; browser UI steps require a locally prepared/importable fixture.

## Remaining release-validation work and reproduction steps

These are explicit unverified gates, not reported failures:

1. **Physical touch and mobile audio:** On real iOS Safari and Android Chrome devices, open a secure deployment, repeat the arrangement/sample/mixer/mastering/export flow, use touch gestures at narrow viewport widths, deny/grant microphone permission, record and save a take, and capture audio output. Record device, OS, browser, viewport, permission state and any missed gestures/dropouts. Do not substitute emulation for device evidence.
2. **Live audio and sidechain loopback:** With an audio output and approved loopback/line capture, use deterministic kick and bass WAVs. Compare bass transient and release RMS with sidechain disabled, source muted with Ghost off, and source muted with Ghost on; then compare aligned live and offline captures. Record device, browser, rate, RMS, latency and interruptions. UI telemetry alone is not proof of signal level.
3. **Independent loudness certification:** Run the analyzer and limiter against independently sourced published BS.1770 / EBU Tech 3342 loudness, LRA and true-peak reference vectors. Record vector provenance, sample rate/channel layout, expected values, measured values and tolerances. Do not label the current 4× estimate certified.
4. **Medium/large performance:** Build 12-track/3-minute and 24-track/5-minute projects including clips, Sampler, Drum Rack, effects, sidechain and mastering. Measure cold/warm load, preparation, render/export, archive import/export, browser responsiveness, process RSS/native audio memory and archive size. Repeat on a representative midrange phone; compare against current 192 MiB warning and 768 MiB block thresholds without increasing limits absent a safe memory strategy.
5. **Browser compatibility and recovery:** Repeat the clean `.EHS` import/edit/save/reopen, corrupt-import preservation, recovery and export scenarios in current Chrome/Edge, Firefox, Safari, iOS Safari and Android Chrome. Record any browser-specific worklet, worker, audio or storage failures.
6. **GitHub Pages release check:** After explicit approval to publish, deploy the reviewed revision and verify app entry, relative assets, workers, worklets and vendor modules under the repository subpath, then run a small import/play/export smoke test. Local HTTP 200 responses are not a substitute.
7. **Remote CI:** After an approved push/PR, confirm the configured Node 22 GitHub Actions workflow passes the full suite.

## Batch 005 recommendation

**Batch 005 — Performance, Mobile Experience & Production Reliability** should start with real-device touch/audio and latency testing, followed by long-project performance and memory profiling, large `.EHS` archive handling, project recovery, browser compatibility, audio-engine stability, accessibility and responsive workflow improvements. Keep this phase separate from Batch 004; no Batch 005 implementation is included here.
