# Mobile focus and performance modes

## Shared focus behavior

`src/mobile-focus.js` presents an existing workspace or performance surface as
a fixed, scrollable focus surface. It does not duplicate editor DOM, project
parameters, sample state or audio graphs. **Done** and Escape close it and
return focus to the launcher. Landscape mode is only suggested after a
portrait-to-landscape transition at phone/tablet widths; the app never locks
orientation. Users can choose **Open Focus Mode** / **Continue Editing** and
optionally remember that choice per workspace in local storage.

The focus shell is presentation-only. Recording, transport, sample edits,
rendering and project persistence continue to use their existing controllers.
Closing a performance surface releases its held instrument voices. A workspace
rerender/navigation closes the old surface before replacing its DOM.

## Piano Performance Mode

- Opens from the existing Sampler/Piano workspace and uses its selected track,
  loaded sample, note mapping, ADSR, transpose/fine-tune, effects and mixer
  route.
- Displays a chromatic key surface with a one-octave default, one-to-four
  visible octaves, and octave up/down controls.
- Velocity is a user-selected touch level. No pressure-sensitive velocity is
  assumed.
- Pointer identities allow simultaneous held notes. Pointer-up releases gated
  voices; pointer cancellation, range changes, focus exit and teardown release
  voices as well. A sustain toggle retains released notes until disabled.
- Sampler one-shot mode plays to its configured sample end; loop/gated modes
  follow existing note release behavior. A sample must already be assigned
  and loaded.

## Drum Pad Performance Mode

- Uses the existing Drum Rack visible-pad mapping and stable pad IDs; no
  performance-only pad state is persisted.
- Shows up to 16 pads per 4x4 bank. Next/Previous Bank is available for racks
  larger than 16 pads.
- Only loaded, assigned, unmuted pads can trigger. Audio uses each pad's actual
  sample, volume, pitch and pan, followed by its existing track route/effects.
- Pointer cancellation fades a triggered one-shot promptly. Normal pointer-up
  lets the sample finish. Changing banks or leaving focus releases outstanding
  voices.
- **Edit selected pad settings** exits to the existing inspector and selection
  model.

## Gesture and state rules

| Input | Sampler keys | Drum pads |
|---|---|---|
| Pointer/touch down | Trigger note-on after the audio route starts | Trigger assigned sample after the audio route starts |
| Pointer/touch up | Note-off, or hold under Sustain | Let one-shot finish |
| Pointer cancel/lost capture | Release/cancel note | Fade/cancel voice |
| Multiple pointer IDs | Independent simultaneous notes | Independent simultaneous pads |
| Octave/range or bank change | Release all held notes before changing keys | Release outstanding voices before replacing pad bank |
| Done/Escape/workspace teardown | Release all voices and return to editor | Release/cancel outstanding voices and return to editor |

Pointer feedback begins after a voice successfully starts; missing/unloaded
samples surface a notification instead of presenting a successful trigger.
Voice release uses the current AudioEngine source lifecycle so completed
sources and nodes can be reclaimed.

## Verification and limitations

Automated tests cover focus preference validation, simultaneous pointers,
pointer cancellation before asynchronous startup, sustain-off/focus-exit races,
pad bank mapping, AudioEngine source routes and parameters, and Sampler/Drum
event scheduling. The earlier offline-render check used the production
`AudioEngine.render()` path with an `OfflineAudioContext`: MIDI 60 rendered at
261.58 Hz from a 440 Hz-rooted sample, and a Drum Rack pad pitched up an octave
rendered at 879.97 Hz. Those offline results are distinct from the real-time
Chromium acceptance below.

The 005B.5F.2 source-app browser run used an advancing 48 kHz `AudioContext`
and an analyser tap on the production output path. Sampler MIDI 57 from the
restored 220 Hz sample produced a 222.66 Hz FFT peak. At 45 ms into its 120 ms
attack RMS was 0.0107; at 155 ms it was 0.113. After pointer cancellation and
focus exit, measured RMS fell below 3e-8 and 7e-9 respectively. A 32-pad Drum
Rack showed Bank 2 as Pads 17–32; Pad 17 restored the 220 Hz sample, gain 0.7,
pitch 0, pan -0.8 and unmuted state. Its live output peaked at 222.66 Hz.
Switching banks with Pad 17 held reduced RMS from 0.0061 to 1.3e-7 in 200 ms.
Muting the pad disabled its performance control and produced zero measured
output. Simultaneous pads produced measurable 222.66 Hz and 878.91 Hz peaks.
The rack EQ low-cut remained enabled at 1 kHz after clean-origin `.EHS`
import; before export, the 220 Hz output RMS measured 0.0087 with EQ enabled
versus 0.173 with it bypassed.

The app's Save .EHS action generated an 181,225-byte archive; a fresh origin
with no localStorage keys imported it through the Open .EHS file input and
reported two audio assets verified and restored. The browser harness did not
emit a native download event, so the generated Blob was passed to that actual
file input without modifying project data. The round trip began with the
application's default `Untitled Project`; the New Project dialog was not part
of this specific instrument acceptance.

Automation dispatched synthetic pointer events to the real performance
handlers. It did not certify trusted native pointer capture or physical
touch/mouse behavior. An emulated 390x844 portrait-to-844x390 landscape resize
kept a held Sampler voice active and the mode mounted; this is not physical
orientation testing. AudioContext suspension was confirmed, but the available
automation did not deliver a trusted pointer event to resume it through the
UI. Suspension/resume, native lost capture, physical-device latency, and
Edge/Firefox/Safari remain open. See the [5F.2 acceptance
report](./BATCH_005B_5F_2_REPORT.md), [5F report](./BATCH_005B_5F_REPORT.md)
and [mobile UX audit](./BATCH_005B_5F_MOBILE_UX_AUDIT.md) for remaining gates.

## Sample Studio, Recording, Mastering and Export focus workflows

The 005B.5F.3 focus shell adds compact workflow navigation over the existing
workspace DOM rather than creating duplicate editors or parameter state:

- **Sample Studio** exposes record/import, waveform/edit, effects and save
  stages. Its existing playback controls stay pinned in the focus toolbar so
  effect edits do not require returning to the waveform.
- **Recording** pins the existing recording actions and monitor controls;
  capture, take buffering and recovery remain owned by Recording Studio.
- **Mastering** provides module navigation and keeps only the selected module
  active in the focus presentation. Analysis and A/B controls are the existing
  Mastering controls, not a second DSP or analysis path.
- **Export** exposes format, quality, metadata, render and download/review
  stages. Existing render status/actions remain accessible, and a completed
  render can be downloaded again from the review stage. Portable `.EHS`
  project saving remains separate from audio export.

The browser checks for this continuation were limited to the source app:
Sample import and effect-stage retention, Mastering module/mode navigation,
and an empty-project WAV export/review link were exercised. An MP3 render
completed, but the automation did not capture its native download event.
Export analysis for the empty project reported silence (`-∞ LUFS`), so this is
not meaningful-audio acceptance. Recording and recovery were not exercised
end-to-end. Responsive Export focus was checked at 320x740, 360x800, 390x844,
430x932, 768x1024, 1280x900 and 844x390; those checks are not complete
workflow acceptance at each viewport, and physical orientation behavior is
untested.

Track-owned AudioEngine sources are now stopped when their instrument track is
removed or its Sampler/Drum Rack source settings change. Node regression
coverage includes Sampler replacement, Drum Rack sample replacement/pad
removal and track removal. This is not a live-browser test of an active voice
being removed, trusted pointer capture, or AudioContext suspend/resume.
Orientation resizing left the emulated focus surface mounted with a held voice,
but a landscape suggestion may still be shown; physical-device safety was not
verified. See
[the 5F.3 acceptance report](./BATCH_005B_5F_3_REPORT.md) for status by
requirement.

## Mobile Arrangement gestures — 005B.5F.4

Arrangement adds a selected-clip action bar, a 350 ms long-press move gesture,
explicit Move and Trim modes, touch-visible trim handles and two-finger pinch
zoom on blank lanes. Pinch previews are temporary; release commits one zoom
change around the midpoint, while cancellation restores the previous zoom.
Sample Browser insertion uses the current playhead and selected beat grid.
Desktop editing and the project/audio models remain unchanged.

The source Chromium check used emulated touch at 390x844. It moved a clip by
one snapped beat, verified a source-start offset from 0 to 0.125 seconds
while preserving the other boundary, changed timeline scale from 39 to 52
pixels per beat with zero measured midpoint-beat error, and confirmed pinch
cancellation restored the previous scale. The built app received only a
390x844 load/overflow smoke check. These results do not certify physical
devices, native scrolling, all seven viewport workflows or trusted input.
See the [gesture guide](./MOBILE_ARRANGEMENT_GESTURES.md) and
[5F.4 report](./BATCH_005B_5F_4_REPORT.md); Batch 005B.5F.4 remains incomplete.

## Mobile production acceptance — 005B.5F.5

The source Chromium follow-up at 390x844 used UI-imported audio and verified
selection, explicit Move with Undo/Redo, start and end trim, compatible Audio
track movement, rejected Audio-to-Sampler movement, and Duplicate/Delete with
Undo/Redo. The deterministic build verified long-press movement with
Undo/Redo and end trim. A built-app layout-only check found no document-level
horizontal overflow at 320x740, 360x800, 390x844, 430x932, 768x1024,
1280x900 or 844x390. These synthetic browser interactions are not physical
touch acceptance; the seven viewport checks did not exercise gestures.

The host-side Arrangement, workspace, production and closure fixtures now
reload after setting the 390x844 viewport, ensuring the app samples the mobile
breakpoint on initial mount. The 5F.5 batch remains incomplete: connected
recording, Sample Studio, mastering/export, lifecycle, clean-origin project and
PWA workflows, pointer cancellation, full multi-viewport interactions and
physical-device input remain unverified. See the
[5F.5 report](./BATCH_005B_5F_5_REPORT.md) and
[physical-device checklist](./MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md).
