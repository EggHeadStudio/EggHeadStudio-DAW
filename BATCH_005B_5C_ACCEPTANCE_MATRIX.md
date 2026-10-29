# Batch 005B.5C - Mobile production acceptance matrix

Overall: **INCOMPLETE** because connected numerical audio gates fail, not
because layout-only checks were counted as editing. See the
[report](./BATCH_005B_5C_REPORT.md) for the connected 22-step ledger, exact
audio values, implementation changes and limitations.

## Representative source and built interactions

Maintained fixture: [mobile-production-matrix.js](./tests/mobile-production-matrix.js).
Each column was executed against a UI-imported archive downloaded from the
connected phone-authored song. No direct project injection or between-size reset.
P = the described representative interaction passed, not every control.

| Interaction | 320x740 | 360x800 | 390x844 | 430x932 | 768x1024 | 1280x900 | 844x390 |
|---|---|---|---|---|---|---|---|
| Workspace navigation | P | P | P | P | P | P | P |
| Clip move by touch, persisted beat check | P | P | P | P | P | P | P |
| Clip start resize by touch, duration check | P | P | P | P | P | P | P |
| Exact time/track range controls | P | P | P | P | P | P | P |
| Multi-track duplicate and Undo | P | P | P | P | P | P | P |
| Loop from Range and numerical ruler seek | P | P | P | P | P | P | P |
| Selected-track volume/pan bindings | P | P | P | P | P | P | P |
| Device insertion and gain edit | P | P | P | P | P | P | P |
| Note time/pitch movement and resizing | P | P | P | P | P | P | P |
| Exact-note velocity touch change | P | P | P | P | P | P | P |
| Drum step touch toggle | P | P | P | P | P | P | P |
| Sample start handle, exact reset, zoom/fit | P | P | P | P | P | P | P |
| Recording track/arm/count-in and take gain | P | P | P | P | P | P | P |
| Master EQ node touch gain change | P | P | P | P | P | P | P |
| Export format controls | P | P | P | P | P | P | P |
| Project disclosure and Save .EHS visibility | P | P | P | P | P | P | P |

The full table passed against both source and built `/dist/` entries:
**112 category checks per entry**, zero page errors. Subsequent sample replacements
explicitly test Cancel and then accept discard before reopening. Desktop uses
the actual expanded track Mixer instead of the phone overlay. Tests avoid
sticky headers and target visible points on long/expanded clips. Note resizing
and velocity drags choose a direction that is not already at a model limit.
No forced click is used to get around hidden or covered controls.

## Connected 390x844 session (source and built)

| Area | Verified | Still distinct / not implied |
|---|---|---|
| Sample | Import, both trim handles, numeric boundaries, zoom, gain/EQ during active preview, A/B, Save, reuse in two instruments | New microphone sample, Cancel/New Recording, every waveform scrolling/pinch variant |
| Rack | Two distinct assets, four hits, preview action | 1-32-pad acceptance belongs to the preceding milestone, not a new all-width rerun |
| Piano | Two touch-created notes and stored velocity edit | Full multi-note/cancel/Undo matrix remains separate from representative moves |
| Arrangement | Two independent instrument patterns, exact multi-track section, duplication | Arbitrary compatible-track transfers and every range-handle gesture |
| Recording | Arm/backing/count-in, synthetic overdub, input level, Stop/save, preview action, trims/gain/fades/placement/Activate, cancel second count-in | Physical latency; multiple normally saved takes; independently metered take preview |
| Mixer/devices | Selected take volume/pan and EQ insertion | Every device parameter/preset at every size |
| Master | Multiband/imaging/limiter controls, shared numeric entries, touch EQ, actual FFT, live A/B, final analysis/render | Independent standards validation of loudness/true-peak readouts |
| Export | Real WAV/MP3 downloads, independent decode, duration/channels/level and recorded tone | Progress/cancel, all metadata/artwork/packaging variants |
| Project | Actual .EHS download; empty-origin exact settings, source hashes and playback | Rendered RMS comparison **fails**; no bit-identical claim |

## Recording fault rerun

At 390x844, the maintained safety fixture separately verified microphone-request
navigation guards, capture guards, emergency Stop availability and actual
AudioContext suspension recovery. It saved 16384 dry frames and ended the input
stream. This is separate from the connected normal take/cancel workflow and is
not physical-device or OS-background recording certification.

## Environment and limitations

Native Edge 156 / Windows, isolated headless contexts, real visible-document
state, CDP synthetic touch, no user browser data. Tests at 1280px still use a
touch-capable context with the desktop layout. No physical iOS/Android,
virtual-keyboard or Firefox/Safari results are claimed.

Exact built version and validation results are recorded in the report's validation closure.
Format/menu interaction cells are deliberately narrower than actual downloads
and replacement actions, which were executed in the connected 390px workflow.
This matrix does not certify every legacy control or every gesture variant.
