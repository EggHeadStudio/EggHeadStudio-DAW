# Batch 005B.4 - Shared graphical EQ architecture

## Audit and preserved processing

| Surface | Before this batch | Integration |
|---|---|---|
| Track EQ | Four native peaking filters between high-pass and low-pass; approximate SVG; range controls | Same six native stages, native-exact response, shared editor; optional bell/shelf and individual enable fields |
| Master EQ | Six bands, shelves/bells, individual enables, cuts, draggable approximate response | Same eight native stages and authoritative settings; shared editor and actual local taps |
| Filter order | Low cut, numbered bands, high cut | Unchanged; no filter-order/steepness claim |
| EQ presets | Track chain presets; normalized mastering presets | Existing save/load paths retain EQ parameters, including additive fields |
| Live/offline | Shared track/master graph builders | Both consume the same descriptors; scheduler and export processors unchanged |
| Master EQ bypass | Neutral band gains but residual high/low cuts | Verified defect fixed: remove EQ from connected module order while bypassed |
| Spectrum | Existing master level-analysis taps, not local EQ FFT | Lazy, real FFT side branches at each EQ's actual input/output |

Track bands support native `peaking`, `lowshelf` and `highshelf`, gain +/-24 dB,
Q 0.1-18. Master bands retain +/-18 dB and Q 0.1-12. Shelf Q is disabled because
native Web Audio shelves ignore it; its stored value survives switching back to
a bell. Cuts expose frequency and enable, not unsupported gain or variable Q.
Existing cut Q values remain 1 for track and 0.707 for master. These are native
AudioParam values, not a new claim of selectable filter slope or Butterworth Q.
No notch, band-pass, slope selector, dynamic EQ or new processor was added.

The intentional master-bypass correction changes previously filtered bypass
audio. Active filter topology and existing cut defaults remain unchanged.

## Modules and authoritative state

- [eq-model.js](../../../src/eq-model.js): logarithmic mappings, native filter
  descriptors, drag conversion, response composition/probes.
- [eq-visualizer.js](../../../src/eq-visualizer.js): SVG grid/curve/points, Canvas FFT,
  selected-band controls, interaction and visibility/resource lifecycle.
- [eq-analyzer.js](../../../src/eq-analyzer.js): lazy native analysis side branch,
  reusable FFT storage, explicit targeted disposal.
- [eq-workspace.js](../../../src/eq-workspace.js): adapters for the independent track
  effect and mastering settings, existing save/sync handlers and live taps.
- [audio.js](../../../src/audio.js), [mastering.js](../../../src/mastering.js): actual audible
  graph construction and the matching local EQ tap references.

No second stored EQ model exists. Track edits mutate the selected stable effect's
`params`; master edits use the existing normalized mastering mutation path.
Transient descriptors and native response probes are projections of those
objects. Numeric controls reuse [ui-controls.js](../../../src/ui-controls.js).
Original EQ DOM controls are replaced synchronously by the adapter, so only one
EQ editor is visible. Legacy template generation is not a second parameter store.
The old exported pure `masteringEqResponse` helper remains for API compatibility;
the visible shared graph does not use its approximate cut-Q calculation.

## Response calculation

The plot runs from 20 Hz to `min(20000, sampleRate * 0.5 * 0.999)`.
Position uses `log(frequency / 20) / log(maximum / 20)`; inverse mapping is
`20 * (maximum / 20) ** position`. Gain is linear in dB, with +/-24 track and
+/-18 master axes. Numeric cut bounds retain the existing master 10 Hz low-cut
minimum; a sub-20 Hz cut point is drawn at the visible left edge. Existing values
above the visible frequency ceiling are drawn at the right edge, not rewritten
merely by opening the editor.

Eight unconnected native Biquad probes are allocated per mounted response engine.
Each active descriptor configures native type/frequency/Q/gain and calls
`getFrequencyResponse` over 256 logarithmically spaced frequencies. Cascade
magnitudes combine with `sum(20 * log10(magnitude))`. Disabled bands have neutral
gain; disabled cuts use neutral peaking stages. Full EQ bypass is a zero-dB curve.
Probes never enter the audible graph. Response computation happens when settings,
sample rate or plot layout change, not on every FFT frame.

This is the settled, small-signal EQ response. It is not the response of
saturation, compression, sidechain dynamics, limiting or the whole mix. Live
AudioParam smoothing can briefly lag a newly displayed target. Curves outside the
displayed gain span are clipped by the plot, not by the audio processor.

## Actual analyzer routing

```text
track input -> volume/pan -> legacy filter/delay -> preceding devices
             -> EQ cuts/bands -> following devices -> master
                |            |
                Pre-EQ       Post-EQ

master input trim -> modules before EQ -> EQ -> remaining modules
                              |          |
                              Pre-EQ     Post-EQ
                   -> output gain -> fixed final limiter -> destination

chosen tap -> AnalyserNode -> zero-gain sink -> context destination
```

Track gain/pan and the legacy filter/delay remain before the modular device chain,
as in the existing engine; no new pre-fader analysis claim is made.
Tap references refresh from actual stage outputs on graph updates even when a
disabled EQ is inserted, removed or moved without changing the audible-chain
signature. Bypassed-device movement must not leave the analysis at its old stage.
Bypassed track or master EQ exposes the same predecessor for both taps. Master
chain reordering changes the predecessor, not just a label. Output gain/final
limiter are outside local Post-EQ. Original master input/final-output level
analyzers remain separate. Analysis attaches no extra audible route: its sink is
exactly zero, and only its own tap edge is removed on disposal.

The local taps follow the live AudioEngine graph (normally Arrangement playback).
They do **not** analyze an offline export, separately rendered Mastering audition,
or an unrelated sample-preview context. A rendered audition cannot provide true
local Pre/Post data, so it is not substituted or mislabeled. With no initialized
live signal the UI explains that Arrangement playback is needed; a running silent
graph reports silence.

## FFT meaning and limits

- Native AnalyserNode FFT: 2048/4096/8192, default 4096; smoothing 0-0.95,
  default 0.75. Peak hold is a decaying maximum, not indefinite calibrated capture.
- Logarithmic display takes the maximum native bin within each horizontal pixel.
  The response has its left EQ-dB axis; the FFT has a separate right dBFS axis
  from -100 to 0. Status shows actual peak-bin frequency and dBFS.
- Resolution is `sampleRate / fftSize`: at 48 kHz, 23.4375/11.71875/5.859375 Hz.
  Low-frequency interpolation does not create missing FFT resolution.
- Web Audio applies its native Blackman window and mono analysis downmix.
  Leakage, window scaling, smoothing warm-up and bin alignment affect reported
  sine magnitudes. Magnitudes are native FFT dBFS, not LUFS, sample peak,
  true peak, calibrated SPL or a complete stereo-energy measurement.
- Anti-phase stereo content can cancel in the mono FFT. Audio and existing
  stereo meters remain stereo; no audio downmix is inserted by this display.
- On stop, real buffer/smoothing state decays to silence; there is no invented
  animation. Turning analysis off detaches the branch and clears the plot.

## Interaction, accessibility and lifecycle

Mouse/touch points change log frequency and supported gain, with pointer capture,
cancel rollback, Shift-fine adjustment and keyboard arrows/Home/End. Wheel Q has
a visible rotary/numeric alternative. Exact frequency/gain/Q, band selector,
type, enable and selected-default reset use existing controls. The selected point
is raised above overlapping hit targets without reparenting it on every drag
update, preserving capture. Transparent stroke enlarges touch targets; the band
selector remains available where nearby points overlap.

SVG text uses physical plot dimensions rather than shrinking a fixed desktop
viewBox on phones. Canvas backing pixels follow devicePixelRatio, capped at 3.
The plot captures node drags, while surrounding Device Panel scrolling remains
available. Per-control generic reset buttons are hidden: the explicit
**Reset filter** uses the actual selected band's default instead.

Rendering is capped at 30 Hz without full-app rerenders. FFT/peak arrays are reused
until FFT size changes. Visibility, intersection and folded geometry skip drawing;
hidden/offscreen analyzers detach. Track switches, reorders, removals, global
renders and project replacement dispose old editors; graph changes retarget
branches. Suspension detaches and resume reattaches lazily. Disposal cancels RAF,
disconnects observers/listeners/analysis edges/probes and is idempotent.
The lightweight RAF callback can remain scheduled while a mounted editor is
hidden/off; it does not draw hidden plots or process audio on the JS audio thread.
Expected `InvalidAccessError` from an already-retired tap edge is handled
specifically; other visualization errors are surfaced in the application toast.

Existing compressor, limiter and multiband gain-reduction readouts remain actual
measurements. No decorative meter or unmeasured threshold display was added.

## Compatibility and references

Optional track band `type`/`enabled` and `lowCutEnabled`/`highCutEnabled` are
additive JSON fields; legacy omissions preserve prior defaults. Master settings
retain their existing schema. Container v1 and project schemas 1/2, PCM assets,
checksums, archive limits and migrations are unchanged. Display selection,
analyzer preferences and animation statistics are transient, not portable data.
Older renderers can ignore additive track capabilities and therefore sound
different; forward audio equivalence with old code is not promised.

Official functional references consulted:
[Live 12 EQ Eight](https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/#eq-eight)
and [Working with Instruments and Effects / Device View](https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/).
They informed log-frequency dragging, exact selected-band controls, activators,
Q access and real spectrum semantics. No Ableton artwork, branded UI or
unsupported EQ Eight filter types were copied.
