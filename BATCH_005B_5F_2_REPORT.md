# Batch 005B.5F.2 — Performance instrument functional completion

## Status

**BATCH 005B.5F.2 INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

Real-time Sampler and Drum Rack audio, effect routing, an instrument-project
`.EHS` round trip, and several voice-release cases were verified in Chromium.
The available automation did not provide trusted native pointer events, so
native pointer capture and AudioContext resume after suspension could not be
accepted. Active-voice removal/sample-replacement safety and physical-device
input/audio latency also remain unverified. This report does not treat offline
PCM or Node scheduling tests as live-audio acceptance.

## Test setup

- Served the unbuilt source app locally at `127.0.0.1:8772`, then used fresh
  origins at `127.0.0.1:8773`, `localhost:8773` and `127.0.0.1:8774`. No
  existing browser tab or user project was used.
- Imported two temporary mono PCM tones through the app's sample import
  control: `tone-a-220.wav` and `tone-b-440.wav`. The automation-only fixtures
  were kept outside the repository.
- Added Sampler and Drum Rack tracks, assigned the sample assets, set the
  Sampler root and ADSR, edited Drum Rack pad parameters, expanded the rack to
  32 pads, added a track EQ and set its low-cut to 1 kHz through the app UI.
- Captured real-time output with a temporary in-page analyser tap on the
  application's Web Audio output. The context was running at 48 kHz. No
  application source or DSP code was changed for instrumentation.
- Performance keys and pads received synthetic PointerEvents on their actual
  UI elements. Pointer-capture methods were stubbed in the instrumented page;
  this tests the application handlers/audio graph, not browser-native capture.

## Acceptance table

| Requirement | Status | Evidence / limitation |
|---|---|---|
| Sampler note-on, pitch and ADSR through Performance Mode | Browser verified | Restored `tone-a-220.wav`, root MIDI 57, loop mode and ADSR (0.12/0.10/0.40/0.20). MIDI 57 produced a 222.66 Hz FFT peak. At 45 ms into attack RMS was 0.0107; at 155 ms it was 0.113. |
| Sampler note-off, sustain and simultaneous notes | Browser verified | Note-off RMS was 0.000204 at 360 ms; cancellation fell to 2.7e-8 after 330 ms. Focus exit fell to 6.9e-9 after 350 ms. Sustain hold/off and simultaneous MIDI 57/69 were measured in the live browser run: peaks 222.66/439.45 Hz, combined RMS 0.183. |
| Drum Rack live triggering and simultaneous pads | Browser verified | Performance controls produced live output. Simultaneous pads showed 222.66 Hz and 878.91 Hz peaks, with combined RMS about 0.064. |
| Pad assignment, gain, pitch and pan | Browser verified | Pad 1 restored the 440 Hz sample, gain 0.5, pitch +12 and pan +0.8; live output was about 879 Hz. Pad 17 restored the 220 Hz sample, gain 0.7, pitch 0 and pan -0.8; live output peaked at 222.66 Hz. An earlier stereo analyser check measured Pad 17 left RMS 0.2127 versus right RMS 0.0337. |
| Pad mute and effect routing | Browser verified | Muting Pad 17 disabled its performance control and produced zero measured RMS; it was restored to unmuted afterward. The track low-cut EQ remained enabled at 1 kHz after import. Before export, 220 Hz output RMS was 0.00874 with EQ enabled and 0.17319 bypassed. |
| 1–32 pads and 16-pad bank mapping | Browser verified | The editor contained 32 pads. Performance Bank 2 displayed Pads 17–32; its first pad was the assigned Pad 17, MIDI note 52. Switching banks while its voice was active reduced RMS from 0.00610 to 1.26e-7 in 200 ms. |
| Pointer cancel/lost-capture handling and stuck-voice prevention | Browser verified | Synthetic pointer-cancel/lost-capture handler cases reached analyser floor; bank change, focus exit and note-off released voices. Native pointer capture/lost capture remains unverified. |
| Focus exit and orientation/layout behavior | Browser verified | Exiting Piano Performance Mode released a held note. A held key remained audible through emulated 390x844 portrait to 844x390 landscape resizing, then released. Earlier pad layout measurements were approximately 89x118 px portrait and 198.5x64 px landscape. This is viewport emulation, not physical orientation. |
| AudioContext suspension/resume through the performance UI | Blocked | Suspension was reproducible. The automation could not deliver a trusted pointer event; synthetic dispatch did not resume the context, and the locator helper did not produce a trusted pointerdown. `AudioEngine.init()` calls `resume()`, but this interaction still needs a real browser gesture. |
| Active-voice behavior on instrument removal/sample replacement | Blocked | Not verified through the UI while a voice was active. Focus exit/navigation release was verified; removal and replacement remain separate lifecycle cases. |
| Create a project, import two samples, create/assign instruments through UI | Browser verified | Samples and instruments were created/assigned through application controls. The tested session began with the app's default `Untitled Project`; the explicit New Project dialog was not exercised. |
| Save `.EHS` and import on a clean origin | Browser verified | The UI's Save .EHS action generated an 181,225-byte archive. A fresh origin with no localStorage keys used Open .EHS and reported “2 audio assets verified and restored.” The harness did not emit a native download event; it passed the app-generated Blob unchanged to the actual import file input. No project state was injected. |
| Reopened assignments, settings and playback | Browser verified | Clean-origin import restored the two samples, Sampler ADSR/root, 32-pad rack, Pad 17 parameters and enabled 1 kHz EQ. Realtime Sampler and Drum output was then measured on the imported project. |
| Full Node tests, syntax, deterministic build and diff check | Node verified only | See Validation below. Node/build checks do not certify live native input, device latency or browser lifecycle behavior. |
| Physical multitouch, native pointer capture, device latency and other browsers | Blocked | No physical device, Edge, Firefox or Safari live-audio acceptance was performed. |

## Live audio measurements

The measurements below are output analyser readings from the real-time
application graph, not `OfflineAudioContext` rendering:

- Sampler MIDI 57: 222.66 Hz peak from the 220 Hz source. Attack RMS rose from
  0.0107 at 45 ms to 0.113 at 155 ms. After release it measured 0.000204 at
  360 ms. Pointer cancellation and focus exit decayed below 3e-8 and 7e-9.
- Simultaneous Sampler MIDI 57 and 69: peaks at 222.66 Hz and 439.45 Hz,
  combined RMS about 0.183. Sustain remained audible after pointer-up and
  decayed after Sustain Off.
- Simultaneous Drum Rack pads: peaks at 222.66 Hz and 878.91 Hz; combined RMS
  about 0.064. Pad 17 in Bank 2 produced a 222.66 Hz peak through the restored
  Pad 17 mapping/settings.
- EQ A/B: with the 1 kHz low-cut active, the 220 Hz test-pad RMS was 0.00874;
  bypassed it was 0.17319. This confirms live effect order/routing is audible
  and that the setting survived the portable-project import.
- Pad mute: the muted Pad 17 control was disabled and output RMS was zero.
  Active Pad 17 bank-switch release fell from 0.00610 to 1.26e-7 in 200 ms.

These are synthetic-event browser measurements. They establish that the real
AudioContext clock and production audio graph generated measurable signal;
they do not establish hardware latency, trusted physical input or audible
acceptance on a phone.

## `.EHS` clean-origin workflow

1. Imported the two WAV fixtures, created/assigned the Sampler and Drum Rack,
   set their parameters, expanded to 32 pads and added/adjusted the track EQ
   using the application UI.
2. Used the Project menu's Save .EHS action. The app reported the portable
   export complete and created an 181,225-byte archive Blob.
3. Opened a new origin with no project localStorage keys, selected Open .EHS,
   and supplied that Blob as a File to the app's actual hidden `.EHS` input.
4. The app validated and restored two audio assets and the project. Opened the
   restored Sampler and Drum Rack through Arrangement, verified the settings,
   and triggered both performance surfaces.

The default `Untitled Project` was the starting project; the explicit New
Project dialog and a disk-mediated download/reselection were not tested. The
archive format was not altered.

## Validation

- `npm.cmd test`: **341 passed, 0 failed**.
- `node --check` passed for all **133 JavaScript files** under `src` and
  `tests`.
- Two consecutive `npm.cmd run build` executions produced version
  `0b0898958eda813c20ba` and 68 source assets. All **1,695** generated `dist`
  files had matching SHA-256 manifests.
- `git diff --check` passed for tracked changes. The newly created report files
  are untracked, so they were also checked directly for trailing whitespace.

## Manual follow-up procedure

Use a real Chromium/Edge browser with speakers or headphones and a touch device
when available:

1. Open a copy of the test `.EHS`, enter Piano Performance Mode, hold two keys,
   release them separately, test Sustain, cancel one contact, rotate the
   device, then exit while a key is held. Confirm no voice remains.
2. Enter Drum Performance Mode on a 32-pad rack, trigger two assigned pads,
   switch banks while a pad is held, test a muted pad, and verify Pad 17 sample,
   pitch, gain and pan. Confirm release after cancel and workspace navigation.
3. Suspend/resume the browser AudioContext using the browser's real UI/system
   lifecycle, then trigger a key and pad from a trusted touch/mouse gesture.
4. Replace a sample and remove an instrument after a held voice has been
   started. Confirm the old source is released and no project data is lost.
5. Repeat in Edge/Firefox and on physical devices; record actual latency and
   orientation behavior separately from browser emulation.

## Remaining blockers

- Trusted browser-native pointer capture/lost-capture and UI-driven
  AudioContext resume after suspension.
- Active-voice behavior during instrument removal and sample replacement.
- Explicit New Project workflow, disk-mediated download/reselection, and
  broader recording-recovery/portable-project scenarios.
- Physical-device, Edge/Firefox/Safari live audio, latency and orientation.
- Full cross-workspace mobile acceptance remains outside this focused batch.

No application source, project schema, DSP implementation, `.EHS` format,
PWA behavior or audio threshold was changed in this continuation. No commit,
push or deployment was made.
