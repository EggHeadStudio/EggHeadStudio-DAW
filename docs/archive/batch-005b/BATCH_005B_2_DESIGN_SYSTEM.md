# Batch 005B.2 - Comic-Tech Lite design system

This is the implemented vanilla-JavaScript foundation, not a new UI framework.
The source of truth is [workspace.css](../../../src/workspace.css). Existing workspaces,
native controls, parameter state, audio routing and local-first project storage
remain in place.

## Tokens

| Category | Token and value |
|---|---|
| Surfaces | `--surface-canvas: #10131b`, `--surface: #191d25`, `--surface-raised: #242a33`, `--surface-device: #171e27`, `--surface-input: #121923` |
| Borders | `--border: #4d5868`, `--border-subtle: #343e4c` |
| Text | `--text: #e6edf5`, `--text-secondary: #bdc9d5`, `--text-muted: #a4b2c2` |
| Selection | `--accent: #9ce8d6`, `--accent-ink: #10231f`, `--selected: #304f4c`, `--focus: #9ce8d6` |
| Status | `--error: #ffb1b1`, `--warning: #f2d18a` |
| Track defaults | `--track-audio: #88a8db`, `--track-sampler: #a58bdb`, `--track-drums: #db8a70` |
| EQ / compressor | `--device-eq: #94bfff`, `--device-compressor: #efb17f` |
| Delay / reverb | `--device-delay: #c4acf4`, `--device-reverb: #8cd6c8` |
| Saturation / filter | `--device-saturation: #f2a0a5`, `--device-filter: #a2d28e` |
| Chorus / limiter / Utility | `--device-chorus: #91d9e7`, `--device-limiter: #bcc4d3`, `--device-utility: #a3d8c6` |
| Spacing | `--space-1` through `--space-5`: 4, 8, 12, 16, 24 px; `--space` aliases 8 px |
| Radius | `--radius-sm: 3px`, `--radius-md: 5px` |
| Font size | `--font-body: 13px`, `--font-label: 12px`, `--font-small: 11px` |
| Fonts | `--font-ui: Inter, ui-sans-serif, system-ui, Segoe UI, Arial, sans-serif`; `--font-numeric: ui-monospace, Consolas, monospace` |
| Controls | `--control-height: 34px` (40 px below 850 px), `--touch-target: 44px`, `--knob-size: 60px` |
| Motion | `--duration-fast: 80ms`, `--duration-meter: 60ms` |

No webfont download is required. Existing branding stays restrained; readable
system typography and neutral surfaces take precedence over decoration. Device
accents identify families, not arbitrary individual parameters. Chorus has a
reserved token only: this batch adds no chorus processor or visual-only device.
User-selected track colors remain authoritative.

Shared studio/dialog/input surfaces use these tokens. This is incremental
migration: specialized waveforms, Piano Roll, mastering graphs and existing EQ
controls retain their own rendering/interaction implementations.

## Parameter controls

[ui-controls.js](../../../src/ui-controls.js) exports:

- `parameterValue`: finite-value validation, clamp and minimum-relative step
  quantization.
- `parameterToUnit` / `parameterFromUnit`: linear or positive-range logarithmic
  display/gesture mapping.
- `draggedParameter`: normalized rotary-drag calculation.
- `formatParameter`: numeric units, percentages, ratios and bipolar pan.
- `enhanceParameter`: progressive enhancement of an existing native range.
- `describeControl`: associated focus/hover tooltip with Escape dismissal.

### Single state and units

The original range keeps its actual parameter value and existing `input`
handler. The wrapper does not own another DSP model. Numeric entry and gestures
dispatch that same handler; its adjacent `output` is preserved for existing
bindings. The SVG arc/pointer are presentation only.

`enhanceParameter(input, {name, unit, reset, rotary, scale, format, vertical})`
returns the same object attached as `input.parameterControl`:

- `sync()` updates presentation after external value/disabled changes.
- `set(value)` quantizes/clamps, then dispatches the existing input event.
- `setDisabled(boolean)` synchronizes range, numeric entry, reset and styling.
- `spec` exposes the actual bounds, step and mapping; `wrapper` is the DOM shell.

There is no automation engine in this batch. Future automation must update the
existing parameter/binding and call `sync()`, not create a competing control
state. Repeated enhancement of the same range is idempotent.

For linear mapping, normalized position is `(value-min)/(max-min)`. For log
mapping it is `log(value/min)/log(max/min)`. Both clamp to [0,1]; log bounds must
be positive and increasing. Mapping does not change stored units or audio
algorithms. Values are still quantized to each existing parameter's step.

Delay and reverb pre-delay Device Panel inputs use milliseconds; their existing
`data-scale=1000` handler stores seconds. Sampler legacy delay inputs retain
seconds. Mix/feedback output displays percent while numeric entry retains its
actual 0-1 fraction. Pan is centered at zero with L/R display. Gain is dB, not a
logarithmic mapping of a dB value. Volume faders retain linear amplitude values.

### Interaction contract

- Rotary: vertical drag with pointer capture; 200 px spans the normalized range.
- Slider/fader: absolute initial position followed by captured relative movement.
  Vertical faders increase upward.
- Shift: tenfold finer pointer movement without a jump when Shift changes.
- Arrow keys: one existing step for linear controls; log controls move 1% of
  normalized range, falling back to one actual step if rounding would not move.
  Shift+Arrow uses the actual parameter step.
- Page Up/Down: larger ten-step / 10%-normalized adjustments. Home/End reach
  exact bounds.
- Numeric entry: native finite validation, visible browser error for empty or
  invalid values, clamp/step enforcement. Invalid values do not mutate audio.
- Reset button, double-click and touch double-tap restore defaults.
- Pointer cancellation/lost capture restores the pre-gesture value.
- Disabled controls reject programmatic `set` and user edits.

Knobs retain native range keyboard/accessibility semantics; decorative SVG is
hidden from assistive technology. Numeric fields and reset buttons have explicit
names. Focus outlines do not depend on device color. These controls do not
introduce effect-parameter Undo history or parameter automation.

## Device composition

[device-ui.js](../../../src/device-ui.js) supplies the reusable shell and migrations:

1. Stable effect ID and device family on the article.
2. Named enabled checkbox, type and explicit Active/Bypassed status.
3. Earlier/later/remove actions calling existing chain handlers.
4. Presets shortcut opening the existing **chain** preset disclosure.
5. Fold control with `aria-expanded` / `aria-controls`; folding does not bypass.
6. Parameter body and real gain-reduction output where supported.

Fold/body scroll, chain horizontal scroll and focused control are preserved
across structural Arrangement rerenders using stable device IDs. Removed-device
focus falls back to Add Effect. Fold/scroll state is transient, not project data.
Presets remain the existing local chain-preset format; there is no new per-device
preset format. Choosing an empty preset now reports an error without loading
preset zero.

Migrated ordered devices: Utility, Compressor, Delay, Reverb, Saturation and
Limiter. EQ receives the shell/accent but retains its existing response graph
and ranges. Delay time is disabled while BPM sync is enabled; beat division
remains editable. Default values come from the existing effect factory.

The existing Sampler source filter/Q and legacy delay controls also use the
primitives. They remain the existing prechain source configuration, not a new
reorderable Filter effect. No duplicate instrument or ordered-effect model is
introduced.

## Mixer and measured status

The right Mixer uses vertically oriented track volume, bipolar pan, numeric
entry/reset, track-color stripe, existing M/S/FX/Edit and real stereo peaks.
Master volume remains in its header. Clip warnings retain the engine's existing
one-second hold. The added dBFS text is current sample peak, not LUFS or certified
true peak. Compressor reduction is the existing measured reduction in dB.

[meter-ui.js](../../../src/meter-ui.js) only updates DOM from actual engine measurements.
It uses the existing callback, not a new timer/render loop. Hidden-document,
hidden-element and outside-viewport DOM updates are skipped. Meter bars have a
short CSS transition, not simulated activity. Measurement computation and native
audio processing remain unchanged; this is not full clipping-ancestor occlusion
tracking or screen-reader certification.

## Density, focus and staged work

The right Mixer is 226 px desktop / 220 px mobile. Track rows are 238 / 280 px
to fit vertical faders, values and touch targets without overlapping their
Arrangement lanes. This trades visible track count for reliable controls; a
compact mixer/density redesign remains staged work. Device chains scroll
horizontally, bodies vertically; the default bottom panel is 380 px.

Touch acceptance covers 360, 390, 430, 768 and 1280 px emulation. Selected action
targets expand to 44 px on narrow layouts; this is not a claim that every legacy
control is already 44 px. Small phones still need the planned dedicated
workspace/bottom-sheet architecture.

Native modal focus containment is retained. Track setup restores the opener
or its rerendered equivalent. Arrangement shortcuts ignore dialogs and Device
Panel controls. Existing tooltips and disclosure/keyboard navigation remain.

Measured token text/status contrast pairs are all at least 4.5:1; minimum tested
pair is accent on selection at 6.36:1. This is not a complete WCAG audit.
005B.4 owns graphical EQ/FFT work; 005B.5 owns full mobile architecture and
physical-device acceptance. No Session View, framework, schema or backend is
introduced.
