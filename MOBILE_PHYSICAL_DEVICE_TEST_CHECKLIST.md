# Mobile Physical-Device Test Checklist

## Test record

- Tester: ______________________________
- Test date/time and time zone: ______________________________
- Device manufacturer/model: ______________________________
- OS and version: ______________________________
- Browser and version: ______________________________
- Installed PWA or browser tab: ______________________________
- App/source or build version: ______________________________
- Screen size, orientation and display scale: ______________________________
- Audio output/headphones and interface: ______________________________
- Microphone/input and permission state: ______________________________
- Network/offline state: ______________________________
- Project/archive copy used (never a personal-only original): ______________________________
- Evidence location (screenshots, screen recording, audio, logs): ______________________________

## How to run and report

QA-01.2's Chromium measurements do not populate any physical Pass result here.
Retest the approved deployed build, not merely the older user-tested release;
record the footer's full build ID and actual browser/PWA version. See
[QA-01.2 scope and open gates](./QA-01_2_REPORT.md).

1. Use a disposable project or a verified `.EHS` backup. Do not clear browser
   storage, uninstall the PWA, or overwrite the only copy of user work.
2. Record the device, OS, browser, app version, viewport/orientation and
   whether the test used a browser tab or installed PWA.
3. Perform the actions in order. Record **Pass**, **Fail** or **Not tested** for
   each row, plus the exact reproduction steps and evidence file.
4. For a failure, note the first incorrect result, whether it is repeatable,
   severity (**Critical / High / Medium / Low**) and whether audio/project data
   was affected. Stop if the next action could overwrite or discard work.
5. A browser page load or screenshot alone is not workflow acceptance. Verify
   the expected saved project state, actual audio or export where applicable.

## Arrangement and Mixer

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Clip selection and actions | Open Arrangement; tap one audio clip once, then tap it again after selection. | One tap selects only that clip and reveals Move, Trim, Duplicate and Delete without opening the editor. | High | Not tested | |
| Long-press move | Hold a clip body for at least 350 ms; drag horizontally by one grid step; release. | Clip moves to the snapped beat; source offset and duration stay unchanged; Undo/Redo restore both positions. | High | Not tested | |
| Explicit Move | Select a clip, choose Move, drag it without a long hold. | Clip moves once, snaps to the selected grid and is undoable. | High | Not tested | |
| Start/end trim | Select Trim; move each handle by one grid step; inspect clip editor values. | Start trim changes source offset and preserves the far edge; end trim preserves the near edge; Undo/Redo restore exact values. | High | Not tested | |
| Cross-track compatibility | Move an audio clip to another Audio track, then attempt an Audio-to-instrument drop. | Compatible move preserves source range; incompatible drop is rejected with a clear message and no project change. | High | Not tested | |
| Duplicate/Delete | Duplicate a selected clip; Undo/Redo; Delete the duplicate; Undo/Redo. | Exactly one copy is added/removed at each operation; history restores the prior state. | High | Not tested | |
| Double-tap and cancellation | Double-tap a clip; then separately cancel a move and a trim using OS/app pointer cancellation or by interrupting capture. | Double-tap opens the existing editor. Cancelled gestures leave clip data and history unchanged; no stuck gesture state. | High | Not tested | |
| Timeline gestures | Pinch on blank lane; cancel a second pinch; pan horizontally and vertically at nonzero scroll; set loop and seek playhead. | Pinch zoom anchors at the fingers; cancellation restores prior zoom; panning does not edit clips; loop and playhead align with the grid. | High | Not tested | |
| Pinch hit zones and page zoom | Pinch starting on a clip, the ruler and the loop control; cancel one pinch; then pinch/zoom a non-Arrangement page area. | Arrangement zoom works from each timeline surface, cancellation restores prior zoom, and browser/page zoom remains usable outside Arrangement. | High | Not tested | |
| Downward drag visibility | Select Move; drag a clip down across several compatible lanes, then release on one. | Floating preview stays above lane contents; destination remains visible; only the selected destination receives the clip. | High | Not tested | |
| Sample insertion | Select an Audio track, set a non-default grid, seek to a nonzero beat, use Sample Browser **+**. | New clip appears on the selected track at the snapped playhead and retains the correct source. | High | Not tested | |
| Mixer access | Select a track; open Selected track Mixer; adjust volume/pan; mute/solo; return to Arrangement. | Selected controls remain usable; mute/solo affect playback; opening/closing Mixer does not move clips or hide essential controls. | High | Not tested | |
| Device Panel resize/compact | Drag the Device Panel separator up and down; use Arrow keys/Home/End; enable Compact devices and open a long effect editor. | Panel follows the pointer and keyboard within its bounds; compact cards remain horizontal without nested vertical scrolling; full parameters remain reachable in the expanded editor. | Medium | Not tested | |
| Live pinch geometry | At nonzero scroll, pinch on a clip/ruler/loop; watch labels and markers during the gesture; cancel another pinch. | Clip/ruler/grid/loop/playhead scale together without stretched fonts; Zoom % updates; midpoint stays anchored; cancellation restores zoom and scroll. | High | Not tested | |
| Graphical EQ and all bands | Add EQ; play non-silent audio; select and drag every band plus Low/High Cut; edit Frequency/Gain/Q; toggle band/device bypass; scroll the rack to Expand; repeat after rotation. | Response curve and actual FFT remain visible; axes/nodes stay aligned; applicable numeric controls synchronize and audio changes; full editor is reachable with no distorted coordinates. | High | Not tested | |
| Few/many-parameter card fit | Add Reverb, Delay, Compressor, Utility and EQ; scroll horizontally; open sidechain/expanded controls; fold/reorder/remove a disposable effect. | Compact controls fit inside equal-height cards without hidden spill or vertical body scrolling; graphs/meters remain useful; complex settings remain accessible and order affects audio. | High | Not tested | |
| Viewports/orientation | Repeat representative selection, move, trim, scroll, Mixer and Focus entry/exit at 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390 landscape where available. | Essential controls remain visible, no page-level horizontal overflow, editing remains accurate after rotation. | Medium | Not tested | |

## Sample Browser

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Import and search | Import a disposable audio file through the picker; search by part of its filename. | Sample appears once, search returns the correct item, and the library remains available after workspace changes. | Medium | Not tested | |
| Immediate refresh and repeat import | Import a sample while the browser is open; repeat the same import and keep a search filter active. | New item appears immediately without changing workspaces; repeated import does not create duplicate visible entries; filter remains useful. | Medium | Not tested | |
| Preview and insertion | Preview the sample; choose an Audio track; set a nonzero playhead and grid; tap **+**. | Preview is audible; insertion uses the selected track and snapped playhead. | High | Not tested | |
| Non-destructive library removal | Add a sample to a clip or instrument, use its Remove action, then play the project and reload. | Library entry is hidden; a reference warning is shown; the active project and stored audio remain playable and unchanged. | Critical | Not tested | |
| Touch and scroll | Scroll a long library, change categories, use search and operate preview/add controls. | Rows remain tappable; scrolling does not trigger neighboring actions or page zoom. | Medium | Not tested | |
| Factory/User and offline | Inspect Factory/User entries; preview Kick, Snare and pitched factory sounds; go offline after shell installation; insert Sub Bass C2 on an Audio track and play it. | Factory sounds appear without file import, are distinct from User audio, and remain audible offline without duplicate library rows. | High | Not tested | |
| Reload after picker | With a filter active, import two files, immediately preview/add one, reload and reopen the library. | Per-file results appear without workspace/recording workarounds; filter and referenced audio remain valid; no duplicates or storage clearing. | High | Not tested | |

## Sample Studio

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Import and edit | Open a copy of a non-silent sample; set start/end handles, zoom and exact numeric boundaries. | Waveform updates, boundaries are frame-accurate, zoom/scroll does not change the selection unexpectedly. | High | Not tested | |
| Preview and effects | Start preview; change an effect and gain; compare Original/Processed; try loop preview. | Transport stays accessible while editing effects; live preview changes; A/B and loop affect actual audio. | High | Not tested | |
| Save and cancel | Save as a new name, then reopen the original; separately cancel/discard another edit. | Saved asset contains processing; original remains intact; Cancel preserves the original and does not lose unrelated edits. | Critical | Not tested | |
| Recording/replacement safety | Record a short take; attempt a sample replacement with unsaved edits; cancel once and confirm once. | Declining replacement preserves edits; confirmed replacement is explicit; no buffered recording or sample is silently discarded. | High | Not tested | |

## Recording Studio

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Arm and backing | Select backing track and recording track; arm; grant microphone permission after the prompt. | Correct track is armed; input meter responds only to the actual input; backing remains audible at the selected level. | High | Not tested | |
| Record and emergency Stop | Record a short real take; rotate the device during capture; press Emergency Stop. | Rotation does not interrupt capture; Stop ends capture promptly and preserves buffered audio for review/recovery. | Critical | Not tested | |
| Review and recovery | Preview the take; save it; simulate an interruption using a disposable project and follow recovery prompts. | Saved take is non-silent and correctly placed; recovery offers the buffered take without overwriting existing project data. | Critical | Not tested | |

## Sampler and Piano Roll

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Performance keyboard | Assign a sample; enter Performance Mode; play one note, release, then play two notes simultaneously. | Correct pitch, polyphony and note-off; no stuck voice after pointer cancellation or focus exit. | High | Not tested | |
| Piano Roll and sustain | Create/move/resize a note; change velocity; use Sustain and octave controls. | Note geometry and velocity persist; playback follows note edits; sustain and octave changes release or retain voices correctly. | High | Not tested | |
| Lifecycle | During a sounding note, replace the sample, remove the instrument track and leave the workspace; keep an unrelated track playing. | Old voice decays/releases; no orphaned node remains; unrelated playback continues. | Critical | Not tested | |
| Empty onboarding and native long press | Create an empty Sampler, choose Soft Saw C4, preview/assign it, create a pattern/note; long-press and move the note; play multiple keyboard fingers and interrupt/cancel capture. | No automatic unrelated sample; contextual setup works; no native callout/magnifier or accidental page zoom; note edit is correct and voices release. | High | Not tested | |

## Drum Rack

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Pad assignment and sound | Assign two different samples to pads; trigger each in the editor and Performance Mode. | Each pad plays its assigned sample with its own gain, pitch, pan and mute settings. | High | Not tested | |
| Banks and touch | Expand to 32 pads; switch banks while triggering pads; rotate portrait/landscape. | Bank 1 and 2 map to Pads 1–16 and 17–32; controls remain reachable and bank changes release active voices. | High | Not tested | |
| Active-pad lifecycle | Remove/replace an active pad sample, remove the pad or rack track, and leave the workspace. | Triggered voice stops/releases safely; no stuck sample; other tracks continue. | Critical | Not tested | |
| Empty factory rack | Create an empty Rack; choose Kick/Snare for two pads; create a step pattern; long-hold and simultaneously trigger pads; interrupt capture. | Correct assignments and actual audio; no native text/callout interference or stuck voices; fields remain normally editable. | High | Not tested | |

## Mastering

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| EQ, FFT and modules | Load a non-silent project; inspect FFT; change EQ; navigate modules; audition A/B. | FFT and analysis are measured; parameter changes affect actual audio; A/B returns to the matching state. | High | Not tested | |
| Limiter and render | Adjust limiter; render; review peak/loudness and listen to the result. | Render uses the existing mastering DSP order; reported metrics match the rendered audio; no decorative/fake meter. | High | Not tested | |

## Export

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| WAV and MP3 | Export the same non-silent project as WAV and MP3; decode/listen to both. | Correct format and quality; both decoded files contain the expected non-silent material and metadata where supported. | Critical | Not tested | |
| Progress, cancel and retry | Start a long export; cancel; verify the project; retry to completion. | Progress reflects render work; cancellation stops cleanly; retry succeeds without duplicate or damaged project state. | High | Not tested | |
| Portable project distinction | Save `.EHS` separately from audio export; reopen the archive in a clean browser origin. | `.EHS` contains project/media; audio export is a separate deliverable; neither action silently substitutes for the other. | Critical | Not tested | |

## Project and PWA

| Check | Exact user actions | Expected result | Severity | Result (Pass / Fail / Not tested) | Reproduction / evidence |
|---|---|---|---|---|---|
| Project persistence | Save a disposable `.EHS`; use a separate clean browser profile/origin; import it through the UI. | Track identities, clips, instrument patterns, sample assignments, effects, recorded audio and mastering state restore. | Critical | Not tested | |
| Playback and export after restore | Play the restored project and export a non-silent WAV. | Restored project plays and exports the same intended material; no missing media or altered settings. | Critical | Not tested | |
| Offline shell and updates | Install/open the PWA; go offline; edit/save locally; then test a waiting update using the app's safe-update prompts. | Shell opens offline; local project/audio remains; update waits for safe work state and never clears user data. | Critical | Not tested | |
| Installed layout and navigation | Repeat workspace entry/exit, orientation, back navigation and sample/project access in standalone presentation. | No hidden essential controls; no accidental page zoom; safe areas and bottom navigation remain usable. | Medium | Not tested | |
| Focused form fields and persistent transport | Focus project/search/numeric fields; scroll Arrangement; rotate portrait/landscape. | Text controls do not trigger iOS automatic focus zoom; the existing transport remains reachable while Arrangement is scrolled. | Medium | Not tested | |
| Loaded build versus worker | Record footer short/full ID; reopen offline; bring a waiting update online; choose Later, then approve only with saved/inactive work. Repeat when new HTML is already loaded but old worker is active. | Footer identifies loaded code, not newest network version; approval checks every client; switching resolves to Updated/Dismiss or safe retry without clearing audio or needless same-build reload. | Critical | Not tested | |
| Factory .EHS portability | Save a project referencing factory Sampler/Rack sounds and a recorded take; import on a separate clean origin/profile; reopen sources and play/export. | Referenced factory bytes, roots, pads/patterns, effects, takes and mastering restore; User/Factory identity remains clear; audio export remains separate from portable saving. | Critical | Not tested | |
