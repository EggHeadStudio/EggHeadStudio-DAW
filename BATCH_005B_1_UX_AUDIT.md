# Batch 005B.1 - Workflow audit and interface architecture

## Evidence and scope

Audited the running source application in Chromium on an isolated local origin,
before implementation. Inspected Arrangement, sample library, track creation,
Mixer, effects, Sampler, Piano Roll, Drum Rack, sequencer, Sample Studio,
Recording Studio, Mastering, Export and project controls through their actual
DOM and navigation. No real microphone or physical touch device was used.

Baseline: 265 passing Node tests. At 360/390/430/768/1280px, Arrangement toolbar
scroll heights were 409/387/340/199/131px. The first four were clipped into a
132px-high internal scroller. Header heights were 275/275/258/137/106px.
These are measurements of the original UI, not estimates of user performance.

## Concrete audit / duplicate-control inventory

P1 = this foundation; P2 = 005B.2 design system; P3 = specialized 005B.4/5 work.

| Current element / workspace | Observed problem | Correction / replacement path | Priority |
|---|---|---|---|
| Global project action row | Six always-visible buttons; header 275px high at 360px | One Project disclosure; keep New/Open/Save portable, label JSON download honestly | P1 |
| Header Export Audio and Export Studio navigation | Two adjacent routes to the same workspace | Keep authoritative Export Studio navigation; remove header shortcut | P1 |
| Save Locally | Actually downloads JSON; misleading next to local autosave state | Rename Download JSON, explain cached-audio dependence; portable Save .EHS remains separate | P1 |
| Arrangement editor-tools | 29 commands, some hidden by internal vertical scrolling | Compact primary commands; Edit disclosure for contextual clip/range operations; persistent panel toggles | P1 |
| Open Editor / Linked Duplicate on audio tracks | Instrument-only actions visible with no applicable pattern | Show instrument actions only in the relevant context; disable selection actions without a selection | P1 |
| Range start/end row with no range | Empty editable fields imply a range already exists | Hide boundary row until a range exists; Select Range and Select Loop remain discoverable | P1 |
| Track title | Pointer-only selection; selected state is only background color | Focusable track-selection control with keyboard activation and pressed state | P1 |
| Track name/color dialog | Name/color clear; Drum Rack hint incorrectly says 16 empty pads | Keep dialog and correct hint to one pad, expandable to 32 | P1 |
| Track header and right Mixer M/S/FX/Edit | Duplicate buttons; unclear authoritative fader ownership | Hide header M/S/FX/Edit while Mixer is open; retain them when collapsed; fader/pan only in Mixer | P1 |
| Sample Browser | Only samples despite planned browser architecture; search has no accessible name | Samples/Instruments/Effects tabs with real existing creation/add handlers; label search | P1 |
| Sampler / Piano Roll effects footer | Same full effect editor as Arrangement; extra track gain | Replace with one Device Panel navigation shortcut; all track gain in Mixer | P1 |
| Drum Rack effects footer | Same duplicate effect/gain surface | Same Device Panel replacement; retain pad gain because it is a different DSP parameter | P1 |
| Selected-track devices | Instrument is a loose button, effects stacked vertically | Instrument card first, ordered horizontal effect cards; explicit track context | P1 |
| Effect headers | Reorder/remove exist but cannot fold devices | Reusable fold disclosure and bypass state; same existing effect bindings | P1 |
| Utility gain/pan/width | Range controls lack numeric entry/reset/fine adjustment | Representative knob/linear controls over native range + numeric entry, not a new DSP model | P1 |
| Sample Studio trimStart/trimEnd and effect selector | DOM controls lack accessible names | Label these existing controls, preserve frame/selection engine | P1 |
| Sample Studio action density | Recording, editing and saving all compete | Retain working functions now; group stages in later workspace-specific pass | P2 |
| Sample preview vs global transport | Both play icons but different targets | Explicit tooltip descriptions; retain local sample/master audition because it is not Arrangement playback | P1/P2 |
| Piano Roll | Large pitch range and dense toolbar; velocity lane already shares coordinates | Preserve note/velocity gestures; later consolidate modes, not data | P2 |
| Drum Rack Add Sample on pad and selected-pad editor | Same assignment reached from two contexts | Keep as shortcuts to same pad state; later emphasize selected-pad editor | P2 |
| Step Sequencer | Long horizontal grid; toolbar above can dominate phone | Preserve explicit scroll/edit modes; full-screen workspace in mobile phase | P3 |
| Recording Studio | Calibration and recovery controls mix with normal capture controls | Preserve reliable workflows; future expandable Advanced / Recovery sections | P2 |
| Mastering | Full advanced chain is long; module reorder arrows have weak context | Keep current controls and analysis; future Device Header and named reorder labels | P2 |
| Export | Metadata/artwork/package below audio options require scrolling | Preserve all encoders; future Audio / Release sections with clear progress | P2 |
| Tooltips / focus | Some symbol buttons only have symbols, most hints hover-only | Descriptive accessible names, shared focus/hover tooltip primitive, visible focus | P1 |
| Mobile workspaces | Desktop sections shrink/wrap; Arrangement toolbar internally scrolls | Compact disclosures now; mobile workspace navigation/full-screen editor planning below | P1/P3 |
| EQ response SVG | Existing response but no FFT or direct node interaction | Document separate analyser/response/node architecture for 005B.4, no fake spectrum | P3 |

## Official Live 12 workflow comparison

Sources accessed during this audit:

- [Arrangement View](https://www.ableton.com/en/live-manual/12/arrangement-view/)
- [Working with Instruments and Effects](https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/)
- [Editing MIDI](https://www.ableton.com/en/live-manual/12/editing-midi/)
- [Keyboard Shortcuts](https://www.ableton.com/en/live-manual/12/live-keyboard-shortcuts/)

| Live interaction (paraphrased) | EggHeadStudio already supports | Adaptation / gap |
|---|---|---|
| Linear Arrangement, vertically stacked tracks | Independent audio/instrument clips, snap, time selection, looping | Preserve; no Session View |
| Musical ruler plus elapsed time | Musical clock and mm:ss.mmm transport | Keep both in global transport |
| Contextual Clip View and selected-track Device View | Clip editor, instrument workspaces, effects | Single effects owner; context-sensitive Arrangement commands |
| Left-to-right instrument then effect chain | Ordered shared live/offline track graph | Expose existing order horizontally; do not reorder DSP merely for display |
| Device folding and activation | Effect bypass/reorder/remove/presets | Add reusable fold headers; native disclosures are keyboard accessible |
| Note pitch/time/length/velocity editing | Piano Roll, vertical keyboard, collapsible velocity lane | Preserve internal notes, not introduce MIDI dependency |
| Browser inserts devices into selected track | Sample import/drop and add-effect selector | Add discoverable categories calling existing handlers |
| Keyboard view toggles and contextual commands | Copy/paste, duplicate, split, undo and loop | Preserve; provide named shortcuts/help, avoid stealing typing or modal keys |
| Context menus | Arrangement action buttons | Right-click clips/track headers or Shift+F10 opens the same contextual Edit disclosure; pointer-positioned popup styling deferred |
| Automation lanes / envelopes | No general Arrangement automation system | Document future architecture; do not expose nonfunctional controls |
| Drum instruments/rack chains | Dynamic 1-32 pads and shared note/step patterns | Retain stable IDs and pad selection, not mimic Live's fixed visual grid |

## Information architecture and components

Desktop: global transport/project disclosure at top; collapsible categorized
browser left; Arrangement center; lane-aligned collapsible Mixer right; selected
track Device Panel bottom. Dedicated studios retain their own audition/capture
controls, never a second independent Arrangement transport. Instrument editors
remain dedicated full-width workspaces with a return route.

One project model remains authoritative. Browser insertion and navigation are
shortcuts to existing handlers, not separate effect or track models. Effect
editing belongs only to Arrangement Device Panel; instruments/pads own their
source, envelope and per-pad parameters. Clip timing/gain remains Clip Editor.

Foundation primitives: native buttons/checkboxes/selects, native details/summary
for project/context/panel disclosures, native ranges for keyboard semantics,
numeric entry paired with native range, pointer-captured rotary dragging,
shift-fine adjustment, accessible reset and value units, shared focus/hover
tooltips, collapsible device headers. Existing stereo meters and peak warnings
remain the signal-fed meter primitive; no simulated meters. Context invocation
selects the actual track/clip and opens the same Edit disclosure, never cloned
commands; pointer-positioned popup styling and broader migration are 005B.2 work.

## Mobile behavior plan

| Workspace | 360/390/430px | 768px | 1280px |
|---|---|---|---|
| Global shell | Compact Project disclosure, wrapped transport, horizontally scrollable workspace navigation | Same shell, more room | Single-row groups where space permits |
| Arrangement | Browser/Mixer initially collapsed; explicit range/edit modes; edit disclosure | Collapsible panels, no forced simultaneous inspector | Three-part Arrangement and bottom devices |
| Browser | One active category; full-width collapsed panel when opened | Same | Resizable left panel |
| Mixer / devices | Open deliberately; bounded horizontal chain, touch targets | Collapsible inspector | Lane-aligned Mixer and horizontal device chain |
| Sampler / Piano Roll | Dedicated editor; preserve pan vs edit gestures and velocity lane | More visible pitches | Full-width note editor |
| Drum Rack / sequencer | Dedicated pads/selected-pad/step sections; future section navigation | Adaptive pad grid | Pads + editor |
| Sample Studio | Future full-screen waveform with stage-specific actions | Waveform plus collapsible processing | Full waveform and controls |
| Recording | Future capture-first controls, advanced calibration disclosure | Timeline + takes | Full capture workspace |
| Mastering | Future module-at-a-time inspector | Collapsible modules | Ordered modules and analysis |
| Export / project | Future Audio/Release sections; no silent storage clearing | Same | Grouped audio/metadata/package |

This batch does not claim complete phone redesign or physical touch verification.

## 005B.4 EQ architecture

Keep actual DSP filters in the existing track graph. Read frequency response
from equivalent filter definitions / `getFrequencyResponse`; render it separately
from an `AnalyserNode`'s frequency-domain FFT data. Never use waveform samples as
a spectrum. Pre/post taps must be explicit, audition-only and disposed when the
visualization closes; throttle drawing via requestAnimationFrame only while
visible. Frequency maps logarithmically, 20 Hz to min(20 kHz, Nyquist);
gain uses a labeled dB axis. Nodes bind frequency/gain/Q/filter type/band bypass
to the existing effect parameters with keyboard/numeric equivalents and a
touch-friendly selected-node inspector. Save only parameters, not analyser data.
Band bypass/filter type require explicit backward-compatible DSP additions and
audio tests in that batch, not nonfunctional UI in this one.

## Prioritized next steps

1. 005B.2: extend tested parameter primitives, consistent device/header/menu
   patterns, contrast review and keyboard focus restoration across all editors.
2. 005B.3: dedicated workspace density and stage navigation, without duplicated
   state or removing recovery paths.
3. 005B.4: implement actual EQ analysis/direct manipulation against DSP tests.
4. 005B.5: full-screen mobile editors / bottom sheets and physical-device tests;
   preserve existing explicit editing modes.
