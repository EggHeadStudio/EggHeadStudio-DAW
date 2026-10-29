# Batch 005B.4B - Cross-workspace effects and transport audit

## Scope and ownership

The measured starting baseline was 298/298 Node tests, not the baseline of an
older Batch 005A report. This batch builds on the uncommitted 005B.4 graphical
EQ implementation. No framework, backend, Session View, new production
dependency, project migration or separate effect-parameter model was added.

The binding remains:

`UI -> existing parameter validation -> track/editor/master settings -> shared DSP -> visual refresh`.

Sample Studio owns its non-destructive editor settings until Save. Track
devices own `track.fx.effects`; Mastering owns `project.mastering`. Shared
presentation does not make these different processors share parameter values.
See [the acceptance report](./BATCH_005B_4B_REPORT.md) for executed results.

## Workspace before/after inventory

| Workspace | Before | After | Actual audio / remaining distinction |
|---|---|---|---|
| Arrangement / Device Panel | Shared ordered devices and EQ; ordinary live edits already worked. Scalar specification was duplicated in Sample Studio. Some mix/threshold/width controls still used long sliders. | One exported device scalar specification, compact knobs for supported scalars, existing header/bypass/order/preset/fold presentation retained. | Existing track graph, faders, pan, M/S, sidechain and live rescheduling remain. Fader/pan precede legacy filter/delay and ordered devices; this is not post-device fader routing. |
| Sample Studio | All processing baked before preview; edits did not update that running buffer. Separate effect markup, no shared graphical EQ, no compressor knee, no local FFT or native reduction readout. Local Space restarted selection. | Shared scalar specs, shells, knobs, four-band graphical EQ/cuts, actual local Pre/Post taps, native compressor/limiter reduction, delay tempo sync/division and utility polarity. A live controller updates existing processors without restarting the source for supported parameters. | Original PCM/history remain unchanged. Live gain precedes effects. Reverse, region/fades, crop/delete, normalize, speed/pitch are explicit prepared-buffer operations; Preview prepares the new buffer. Save computes current edits/effects once. |
| Sampler / Piano Roll | Native numeric ADSR/tuning; legacy filter/Q/delay used shared controls, with seconds for delay. Instrument preview already used track DSP. | ADSR/tuning gain shared rotary/numeric/reset interaction. Legacy delay now displays milliseconds while storing seconds. Dry/wet becomes a compact scalar knob. Existing source/region/root controls and Piano Roll/velocity gestures remain. | Filter and track devices affect active voices; ADSR, root, transpose/fine tune and source configuration affect subsequent voices. No isolated pattern transport was previously available: Space plays the song, including this track's independent clips. |
| Drum Rack / Step Sequencer | Native pad gain/pitch/pan ranges. Existing stable pad identities, previews and track DSP. | Shared pad gain/pitch knobs, bipolar pan slider and numeric/reset controls; explicit new-hit semantics. | Pad gain/pan/pitch apply to newly triggered hits. Track effects affect active voices. There is no separate pad-FX chain and no fake pad-FX control. Space plays the song, not a new pattern-only engine. |
| Recording Studio | Backing mix updated DSP only while recording was busy, not idle backing playback. Dry capture and monitoring already existed. | Backing enable/volume now update any active backing song playback. Central Space routing starts/pauses backing only when idle; busy recording/unsaved-take states are protected. | Input monitoring/capture routing is unchanged; monitoring and backing are not printed into the dry take. Take preview uses its existing track graph. No invented input-monitoring effect rack. |
| Mastering Studio | Cached mastered B buffer was auditioned directly. Editing discarded the cache/stopped preview; local EQ taps represented Arrangement, not that B audition. | B plays the prepared pre-master mix through one live shared mastering graph. Scalar edits, order, reset and presets update it. Shared knobs and graphical EQ use its actual local taps. Meters follow the active audition graph. | A bypasses mastering. Waveform/loudness/stereo analysis remains offline; editing marks it stale and disables stale level matching. A/B changes intentionally recreate the source at the preserved offset. Source song edits conservatively invalidate the prepared mix. |
| Export Studio | Current committed project rendered by existing shared offline engine. No separate preview/effect model. | Same engine/settings; centralized Space controls song playback rather than export jobs. | Export/cancel are explicit commands. An offline export has no live FFT tap. Actual WAV/MP3 and portable checks are reported separately. |

Library sample audition remains a **raw asset** audition, not an instrument or
mastering preview. Its source is now stopped/disconnected on workspace changes
and natural completion. Instrument note/pad previews use the existing track
graph instead.

## Shared modular-device parameter inventory

The definitions live in [device-ui.js](../../../src/device-ui.js). Track and Sample
Studio consume them; no second DSP implementation or sample-only defaults.

| Device | Supported controls | Presentation / behavior |
|---|---|---|
| Track / sample EQ | Four frequency/gain/Q bands, bell/shelves where supported, individual enables, low/high cuts, filter type and reset | Shared graphical editor, selected numeric knobs, native response and actual local FFT. No fake shelf Q or cut gain. Master EQ uses the same primitives with six bands. |
| Compressor | Threshold dB, ratio, attack/release seconds, knee dB, makeup dB | Shared knobs and native reduction readout; sample now exposes knee. External sidechain remains track-only where supported. |
| Delay | Time ms (state seconds), feedback, wet fraction, tempo sync, beat division | Shared scalar controls, disabled free-time entry in sync mode. Sample sync uses existing delay DSP/tail calculation. |
| Reverb | Decay seconds, pre-delay ms (state seconds), wet fraction | Shared knobs. Decay updates regenerate the deterministic impulse buffer; not a new whole preview source. This allocation is not advertised as cost-free. |
| Saturation | Drive and wet fraction | Shared knobs and existing oversampled waveshaper. No unsupported independent output-gain control. |
| Track / sample limiter | Ceiling dB | Existing compressor/clipper, shared knob and real reduction. It is not the mastering true-peak/lookahead limiter. |
| Utility | Gain dB, bipolar pan, stereo width, polarity | Gain/width knobs, pan slider, explicit polarity checkbox. |

Mastering retains its different six-band EQ, multiband controls/crossovers,
oversampled saturation, mid/side width, input/output gain and final linked
lookahead limiter. Shared control primitives do not falsely turn multiband
compression into the native track compressor. Multiband attack/release display
milliseconds; native track/sample compressor times display labelled seconds.

Native DynamicsCompressor includes its own makeup behavior: lower threshold
does not necessarily lower final RMS. Acceptance checks actual parameter
response/reduction rather than assuming it is a transparent feed-forward
compressor. Its DSP was not replaced in this UX batch.

Sample delay receives the authoritative project BPM rather than the engine's
last song-playback BPM. Tempo changes update the existing preview graph and
invalidate a previously saved sample shortcut when enabled synced delay changes
the intended processing. Save uses the same current project tempo.

## Knobs versus position controls

- Knobs: device scalar parameters, sample gain/speed/pitch/fine, sampler ADSR/
  tuning/legacy filter-delay controls, pad gain/pitch, master scalar controls.
- Sliders/direct positions retained: track/master mixer faders, pan, waveform
  boundaries/zoom, fades/regions, timeline/loop ranges, Piano Roll velocity,
  graphical EQ points, recording backing/click-volume monitoring controls.
- Shared enhancements preserve native range keyboard controls, numeric entry,
  units, reset, Shift-fine dragging and pointer capture/cancel. Sampler's old
  numeric settings now have an equivalent numeric field alongside the knob.
- Track chain presets remain available. Sample chains had no preset feature;
  their shared shell correctly omits a nonfunctional Presets button.
- Sample racks scroll horizontally and fold without bypassing sound. Folding
  and rack scroll are captured before structural rerender, not after replacing
  the old DOM. EQ selection/analyzer preferences remain transient.

## Live-preview routing and lifecycle

[sample-preview.js](../../../src/sample-preview.js) owns only source/graph lifetime,
audio-clock position, pause offset, loop phase and tail disposal. It reads
editor settings; it does not persist another effect model.

Processed sample path:

1. Prepare edited/faded PCM and speed/pitch without baking the live gain.
2. Source -> smoothed gain -> shared sample effect graph -> destination.
3. Ordinary settings update the same processors/source.
4. Order/add/remove/bypass can rebuild the effect graph while retaining the
   running source. Such topology changes reset old tails; seamless crossfade
   between device topologies is not claimed.
5. Pause releases source/graph and retains offset/loop phase. Resume creates a
   source at that offset. Stop resets offset and loop state.

All-bypassed/empty sample processing is raw, matching the offline early-return
path. With active devices, the existing track wrapper (including its legacy
20 kHz low-pass) is retained to match the existing offline sample processor.
Original A/B bypasses sample gain/effects. Neither sample preview nor Save
silently adds project mastering.

Save uses the original editor's normal gain/fade render, then existing
speed/pitch processing, then one offline effect pass. Sources, gain nodes,
graphs, native analyzer branches, meters, timers and UI observers have explicit
stop/dispose paths. Tail lifetime follows the audio clock and current tail
settings, including suspension and edits after the source finishes.

Master B uses the prepared unmastered arrangement buffer through
`createMasteringGraph`, followed by audition-only stereo monitoring, optional
valid loudness matching and the final-output analyzer. Actual local EQ taps
remain at that EQ's boundaries, not at the final-output analyzer.

## Central keyboard routing

[transport-shortcuts.js](../../../src/transport-shortcuts.js) mounts one document
listener. [app.js](../../../src/app.js) routes to the current workspace and serializes
asynchronous starts. Auto-repeat and Ctrl/Meta/Alt are excluded. Inputs,
textareas, selects, buttons, links, summaries, dialogs, editable descendants
and slider/button/textbox roles keep their native Space behavior.

- Arrangement, Sampler, Drum Rack, Export: song Play/Pause.
- Sample: selection/current preview Play/Pause, preserving pause offset.
- Master: prepared mix audition Play/Pause, preserving pause offset; an empty
  preview reports that Render is required.
- Recording: backing song Play/Pause while idle. Busy microphone/count-in/
  calibration/unsaved-take states display a safety message and do not change
  the recording.
- Native focused Play buttons activate their one click action, not an extra
  document action. Handled background Space prevents page scrolling.
- Arrangement Stop stops voices and retains song position. Return to Start
  resets song position. Sample/Master Stop reset their own preview; Return to
  Start does not silently stop/discard microphone recording.
- Global Play text/title/accessibility label follow the active workspace.

## Cross-workspace regression checklist

- [x] Arrangement track/device DSP and native EQ signal regression.
- [x] Sample live parameters, source retention, save-once PCM, Undo/Redo,
  pause/resume, loop state, waveform editing and rack disposal.
- [x] Sampler and Drum Rack sample reuse, notes/steps, scalar bindings and song
  Space routing.
- [x] Recording idle backing mix, protected synthetic microphone capture and
  dry recorded PCM.
- [x] Master B output/EQ/dynamics, reorder/reset, A bypass, pause offset,
  actual tap/GR source and stale-analysis handling.
- [x] Export uses committed processing; no new live export model.
- [x] Five-width synthetic sample touch editing, preview buttons and rack
  scrolling with no page overflow.
- [ ] Physical devices, non-Chromium engines and dedicated 005B.5 phone
  navigation remain acceptance gates, not claims made by this audit.
