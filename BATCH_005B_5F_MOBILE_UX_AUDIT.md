# Batch 005B.5F — Mobile workspace and scrollbar audit

## Scope and evidence

This audit reviews the current source UI and the mobile focus/performance slice
implemented in this checkpoint. The integrated browser exercised Arrangement
layout at 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390,
plus focus entry/exit and the orientation preference prompt. This was not a
full workspace-by-workspace production acceptance, nor a physical-device,
Edge, Firefox or installed-PWA test.

The existing mobile shell, expanded editors, device panel, mixer, sample
transport, audio engines and project data remain authoritative. Focus mode
changes presentation; it does not clone controls or parameters.

### 005B.5F.2 performance acceptance update

Real-time Chromium analyser checks now verify Sampler and Drum Rack audio from
the actual Performance Mode surfaces; this supersedes the earlier statement
that browser sound was unverified. A restored project retained the Sampler
sample/ADSR, 32-pad rack, Pad 17 mapping/settings and enabled track EQ across a
clean-origin `.EHS` import. Portrait and landscape resizing was exercised at
390x844 and 844x390. These were browser-emulated viewports with synthetic
pointer events, not native touch, physical-device or cross-browser acceptance.
The [5F.2 report](./BATCH_005B_5F_2_REPORT.md) records exact audio readings and
the trusted-input limitations.

## Workspace audit

| Surface | Frequent actions and essential controls | Scroll/touch/gesture observations | Portrait and landscape fit | Focus/performance fit and safe exit |
|---|---|---|---|---|
| Arrangement and Mixer | Select tracks/clips, navigate the timeline, play/stop, edit clip/range, reach selected-track fader/pan/Mute/Solo/meters and devices. Keep transport, editing mode, zoom, Undo/Redo and selected Mixer entry close. | Timeline scrolling and clip/loop/playhead pointer gestures share musical coordinates; track list, timeline, right Mixer and bottom Device Panel have separate native scroll regions. Preserve native scrolling and the existing edit-mode guards. Small Mixer actions remain dense on phones. | Portrait gives the timeline less width and height; landscape gives more horizontal timeline but less vertical room. Seven-size checks in this checkpoint were Arrangement layout/focus checks only, not clip-gesture acceptance. | Generic focus displays the existing Arrangement surface. Existing selected-track Mixer and device expansion remain the appropriate mobile detail surfaces. Done/Escape or normal workspace navigation exits; no new timeline coordinate system is used. |
| Sample Browser | Search, switch Samples/Instruments/Effects, browse categories, preview and add/import a sample. Search/category controls and the preview/add actions are the high-frequency controls. | Browser list/category areas use native scrolling; adding a custom scrolling layer would conflict with touch list interaction and drag/drop. Compact rows and small action targets can require scrolling or expanded access. | Portrait narrows the browser beside Arrangement; landscape improves list width but reduces height. This batch did not exercise browsing or drag/drop at the viewport matrix. | No separate performance mode is appropriate. Keep the existing browser available in Arrangement and preserve selected sample/track when navigating. |
| Sample Studio | Record/import, set start/end, zoom/select waveform, play/pause/stop, compare original/processed, edit/process and save/cancel a new sample. The existing persistent transport, waveform handles, exact-value controls and unsaved-edit protection are essential. | Stage progression is vertically scrollable. Waveform selection/markers are pointer/canvas interactions rather than a native horizontal scroll surface; precision must remain sample-frame based. The persistent transport must not cover handles. | Portrait makes the stages and numeric controls tall; landscape gives waveform width but can reduce vertical workspace. Existing expanded stages and transport are retained; this checkpoint did not run a complete edit/save/cancel workflow. | Generic focus uses the existing Sample Studio DOM. Focus exit does not replace source/edit state. Keep Save and Cancel reachable and preserve existing confirmation behavior; actual sample-processing workflow acceptance remains open. |
| Recording Studio | Select backing, arm an Audio track, check microphone/input meter, Record, emergency Stop, review take and save/recover it. Emergency Stop and buffered recovery are non-negotiable always-visible actions. | The studio is vertically organized; input controls and take review may scroll. Recording and pointer gestures must not be conflated with navigation or orientation changes. Existing guarded workspace navigation and dry capture remain in place. | Portrait can place backing/options ahead of the capture controls; landscape gives more waveform width but less height. This checkpoint did not execute a microphone/capture recovery workflow. | Generic focus reuses existing recording controls and does not stop capture on mode exit or orientation changes. Mode changes must not discard buffered audio; explicit emergency Stop remains the user action. |
| Sampler and Piano Roll | Choose/load the Sampler source, edit pattern notes and velocity, then play pitches from the instrument. Keep octave, range, velocity and sustain controls near the playable keys. | Piano Roll has native horizontal/vertical note-world scrolling with sticky pitch context and pointer note/resize/velocity gestures. Performance keys use explicit pointer capture and multi-pointer note tracking; changing range releases held voices. No pressure velocity is claimed. | Portrait needs a smaller visible octave range; landscape provides a wider playable keyboard but has limited height. The new surface defaults to one octave and supports one through four. Live pitch, ADSR, note-off, cancellation and focus-exit output were measured in Chromium. | Piano Performance Mode uses existing Sampler settings and AudioEngine routing; it does not replace Piano Roll. Done/Escape closes the mode and releases held notes. The original editor/pattern state remains in place. Native pointer capture and device latency are not certified. |
| Drum Rack and Step Sequencer | Trigger assigned pads, switch banks, edit the selected pad, program steps and inspect velocity/length. Pad selection, assignment and step transport remain tied to existing pad IDs. | Step grid and inspector compete for vertical space; the grid is dense and should keep native scroll. Performance pads use pointer capture, 4x4 pages and stable visible order. A 32-pad rack was exercised in-browser; bank switch released an active voice. | Portrait favors a 4x4 pad surface; landscape improves pad width but reduces height. Bank 2 showed Pads 17–32, including the restored Pad 17 assignment. | Drum Performance Mode plays assigned samples through existing pad gain/pan/pitch/mute and track effects. Live sample pitch, mute, EQ routing and cancellation were measured. Edit selected pad exits focus to the existing inspector. Physical pointer capture remains untested. |
| Mastering Studio | Choose the current module, edit authoritative parameters, use graphical EQ/FFT, audition A/B, inspect loudness/peak, set limiter and render. Keep audition/stop, A/B and actual render state accessible. | Module chains/stages are vertically organized; EQ and FFT are graphical pointer surfaces, not native scrolling engines. Focus must not duplicate parameter state or DSP graphs. | Portrait entails longer module scrolling; landscape improves graph width but reduces parameter height. This checkpoint does not implement a one-module-at-a-time mastering workflow or verify mastering state through focus mode. | Generic focus presents the existing mastering UI. It retains existing A/B and render paths; close does not create a new mastering chain. Full live-audition/render acceptance remains open. |
| Export Studio | Choose WAV/MP3 and quality, review metadata/artwork, render, monitor progress/cancel and download. Keep portable `.EHS` project operations distinct in Project. | Export forms/stages use native vertical scrolling. Render progress and Cancel must remain visible during work; project archive export must not be mistaken for an audio release. | Portrait can require scrolling between options and progress; landscape gives more width for metadata and quality controls. No dedicated simplified export wizard was added in this checkpoint. | Generic focus shows existing export controls and the same render controller. Exit must not discard a running export; cancellation remains explicit. Full mobile render/download and `.EHS` separation workflow is still a gate. |

## Scrollable-area inventory

- **Native scrolling:** Arrangement track list/timeline/Mixer/Device Panel,
  Sample Browser lists, vertical studio stages, Piano Roll note world, Drum Rack
  step/inspector surfaces, export and mastering forms, menus and dialogs.
- **Pointer/canvas navigation:** Arrangement clip/loop/playhead gestures, piano
  note/velocity gestures, Sample Studio waveform selection/handles, graphical
  EQ and performance keys/pads. These are not converted to custom scrolling.
- **Shared scrollbar styling:** `src/workspace.css` defines the scrollbar tokens
  once. Standard properties cover Firefox and current Chromium-family
  implementations; the 6px WebKit pseudo-element rules are feature-gated as a
  fallback. No `overflow:hidden` was added to hide required scroll regions.
- **Regression boundary:** no styles were added to timeline scale, track row
  height, clip geometry, piano world dimensions, sample frame conversion or
  pointer coordinate handlers. Arrangement viewport checks reported no
  document-level horizontal overflow, but this is not a substitute for
  validating scroll thumbs and gestures in each target browser.

## Remaining acceptance

- Connected complete workflows for each workspace and all requested viewport
  sizes, including touch gestures and data recovery.
- Trusted native pointer capture and AudioContext suspension/resume through a
  real pointer gesture. Synthetic handler events do not prove these browser
  input policies.
- Browser-native mouse-thumb, wheel, keyboard and touch scrolling regression.
- Edge/Firefox native mouse-thumb, wheel, keyboard and touch scrolling in each
  workspace, plus Chromium installed-PWA/standalone verification. Installed
  Edge/Firefox visual/CSS probes were captured, but interactions remain open.
- Android/iOS device, microphone, latency and orientation tests.

No physical-device or non-Chromium compatibility claim is made.
