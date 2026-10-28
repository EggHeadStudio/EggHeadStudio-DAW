# EggHeadStudio DAW — Browser DAW (prototype v0.1)

A static, local-first browser DAW foundation with Arrangement View, sample folder import, multi-track playback, per-track mixer, sample recording/editing, basic master bus and offline WAV rendering. **This is not yet a full Ableton/Ozone equivalent.** Read `IDEA.md` for the full implementation roadmap.

## Run locally

Option A (Python, no packages):

```bash
cd browser-daw
python -m http.server 8000
```

Open `http://localhost:8000`.

Option B (optional Flask wrapper):

```bash
pip install flask
python flask_server.py
```

Open `http://localhost:5000`.

## Deploy to GitHub Pages

For cache-versioned deployment, select **Settings → Pages → Source → GitHub Actions**. The supplied `.github/workflows/pages.yml` tests the application, runs `npm run build`, and deploys `dist` on an approved push to `main` or a manual workflow run. No dependency installation is needed for the build: the browser dependencies are already bundled locally. GitHub Pages serves static assets only; the Flask server is **not deployed**. This configuration has been tested locally, not deployed from this worktree.

The deterministic build hashes the HTML and all `src`/`vendor` assets. JavaScript, CSS, nested imports, Workers and AudioWorklets share `assets/<content-version>/`, so cached files from another release cannot be mixed into the new graph. URLs remain relative for repository subpaths. No Service Worker, random per-load query string, project migration or storage clearing is used. Local development still works directly from the source without building. Legacy **Deploy from a branch** remains unversioned; switch to Actions to use this protection.

After deployment, reload and inspect `document.querySelector('meta[name="ehs-build"]').content` in DevTools; compare it with `version.json` fetched using `{cache:'no-store'}`. All script/style requests should contain that same version. GitHub/CDN caching can still serve an old HTML entry temporarily; use a hard reload if its version differs. This is not an instantaneous-update guarantee, and the first transition from an unversioned release may require a hard reload. Never clear site data to update: that would remove local projects/audio.

## Batch 005B.1 workspace foundation

The global transport stays at the top. **Project** groups New Project, portable
Save/Open .EHS and legacy JSON operations. **Download JSON** is the former
"Save Locally" button: it downloads metadata, not audio. Local autosave remains
automatic; use .EHS for portable backups. **Export Studio** in workspace
navigation is the single global export entry.

Arrangement has a categorized **Samples / Instruments / Effects** browser on
the left, timeline in the center, collapsible track Mixer on the right and
selected-track **Devices & Clip Editor** below. **Edit** contains contextual
clip/range commands. Right-click a clip/track header or use **Shift+F10** to open
that same command disclosure; Escape closes it. Existing copy/paste, duplicate,
split and Undo/Redo shortcuts remain available.

Track effects now have one editing location: the bottom Device Panel. Sampler
and Drum Rack editors provide **Track effects & Mixer** to return there without
losing the selected pattern. Instrument setup is the first device card, followed
by ordered effects. Cards scroll horizontally, fold without bypassing audio,
and retain bypass/reorder/remove and a **Presets** disclosure. Master volume is
in the right Mixer header. When the Mixer is collapsed, track-header M/S/FX/Edit
shortcuts remain available.

Utility gain/width use functional rotary controls; pan remains a bipolar
slider. Native range keyboard behavior, numeric entry, reset, vertical
mouse/touch dragging, Shift-fine rotary adjustment and double-click/double-tap
rotary reset all edit the existing DSP parameters. No new parameter or project
schema is introduced.

See [the concrete UX audit](./BATCH_005B_1_UX_AUDIT.md) and
[implementation / acceptance report](./BATCH_005B_1_REPORT.md). This is a focused
foundation, not the complete 005B redesign, graphical EQ or mobile redesign.

## Batch 005B.2 design system and audio controls

Shared rotary controls, horizontal sliders and vertical track faders now retain
the existing actual-value audio bindings while adding numeric entry, units,
keyboard/Home/End/Page controls, Shift-fine dragging, pointer capture/cancel,
reset and disabled state. Utility, Compressor, Delay, Reverb, Saturation and
Limiter use them, along with the Sampler's existing filter/Q and legacy delay.
Tempo-synced delay disables millisecond entry. Percent readouts retain fractional
numeric entry; milliseconds still store seconds through the existing binding.

Device family accents, neutral studio surfaces, focus/status styling and real
stereo/sample-peak and compressor-reduction readouts share a lightweight token
system. Meter DOM updates skip hidden/offscreen elements. Device folding,
scroll and focus survive structural rerenders by stable device identity.
**Presets** still means the existing chain presets, not a new device format.
Track dialogs restore opener focus; device/dialog typing does not invoke
Arrangement shortcuts. No project/archive schema or audio-quality change.

See the [design-system/API guide](./BATCH_005B_2_DESIGN_SYSTEM.md) and
[exact acceptance report](./BATCH_005B_2_REPORT.md). Batch 005B.3 adds compact
Mixer density below; dedicated phone layouts remain staged work. The shared
graphical EQ is described in Batch 005B.4 below. Chromium emulation is not
physical-device or all-browser certification.

## Batch 005B.3 compact production workflows

Arrangement tracks now start at **84 px**. **Expand** exposes detailed Mixer
controls, a **220-400 px** height field and Earlier/Later track ordering.
Each header, lane and right Mixer shares one row height; ordering follows stable
track identity and uses Arrangement Undo/Redo. Compact/expanded volume is the
same real parameter, not two competing faders. Track height is a transient
workspace preference, not new project data.

The bottom Device Panel supports height dragging or keyboard Arrow Up/Down,
Home/End, **Compact devices** and **Hide devices**. Piano Roll groups note setup,
view and note operations, shows selected-note/source context and folds advanced
sample configuration. Drum Rack retains the selected-pad inspector and stable
pad mappings. Sample Studio follows **Record/Import > Edit > Process > Preview >
Save**; Save still creates a new 32-bit float WAV asset without replacing the
original. Song WAV/MP3 belongs in Export Studio.

Recording Studio prioritizes backing, arming, Record/Stop and take review.
Advanced contains offset, monitoring details, punch and calibration; emergency
Stop and unsaved-take recovery stay visible. Mastering follows actual processing
order: Input, the user's module chain, Output gain, then the fixed final Limiter.
Export separates **Audio Export / Release Information / Release Package**;
portable editable **.EHS** remains in **Project**.

**283/283 Node tests** pass. Browser acceptance covers five widths, aligned
300/84 px rows, Device Panel touch/cancel, Piano Roll note move/resize/scroll/
Undo/Redo, synthetic recording, clean-origin instrument .EHS restoration and
decoded WAV/MP3. No DSP, scheduler, recording placement or archive schema change.
See the [workflow audit](./BATCH_005B_3_WORKFLOW_AUDIT.md) and
[exact results/limitations](./BATCH_005B_3_UX_REPORT.md).
Graphical EQ/spectrum follows in 005B.4 below; dedicated phone architecture and
physical-device acceptance remain 005B.5 work.

## Batch 005B.4 graphical EQ and real spectrum

Track Devices and Mastering Studio now share one interactive EQ editor without
sharing their settings. Track EQ retains four bands plus cuts; Master EQ retains
six bands plus cuts. Select a point or filter in the selector, drag frequency/
gain, or enter exact frequency/gain/Q with the existing numeric rotary controls.
Shift enables fine dragging, focused points support keyboard arrows/Home/End,
and wheel Q has a visible touch-friendly alternative. Type, individual enable
and **Reset filter** edit the actual stored parameters. Cuts have no fake gain
control; shelves have no fake Q control.

The response is composed from native Biquad frequency responses, not decorative
curves. Real mono FFT analysis has **Pre-EQ / Post-EQ**, On/Off, FFT size,
smoothing and decaying peak hold. Left-axis EQ gain and right-axis FFT dBFS are
different scales. Local taps follow the actual workspace graph. Batch 005B.4B
also connects Sample Studio and live Mastering B auditions to their own local
taps; an offline export has no live FFT. Mono FFT can
cancel anti-phase stereo content; existing stereo meters remain independent.

Track EQ gains optional bell/shelf and individual/cut enable fields, with legacy
defaults preserved. Master EQ bypass now genuinely bypasses its cuts as well as
its bands; this corrects residual filtering in the previous bypass path.
Actual live and offline graph builders share the same descriptors. JSON/.EHS,
presets, container v1 and project schemas 1/2 remain compatible; old renderers
may ignore new optional track fields and play them differently.

Batch 005B.4 reached **298/298 Node tests**, retaining all 283 previous tests.
Native signal tests verify boost/cut/cuts, actual master taps under reordering,
bypass and analyzer audio invariance. Five-width synthetic mouse/touch checks
and empty-origin .EHS/WAV/MP3 verification are detailed in the
[acceptance report](./BATCH_005B_4_REPORT.md) and
[EQ architecture guide](./BATCH_005B_4_EQ_ARCHITECTURE.md).
These are Windows Chromium results, not physical-device or all-engine
certification. No new framework, dependency, service, recording/scheduler
rewrite or Session View.

## Batch 005B.4B shared effects and live workspace transport

Sample Studio now runs its supported real-time parameters through the existing
shared effect processors: gain, EQ/cuts/Q, compressor, delay, reverb, saturation,
limiter and utility. Ordinary parameter changes retain the running source and
effect graph. Order/add/remove/bypass can rewire devices without restarting the
source, but may reset effect tails. Gain uses a short smoothing time; arbitrary
topology/impulse changes are not guaranteed click-free.

Sample devices share the Device Panel's controls, foldable shells, units and
defaults. Sample EQ has the same native response, numeric/keyboard/touch editing
and actual local Pre/Post FFT as track EQ. Native compressor/limiter reduction
is real audio data. Delay sync/division and utility polarity are available.
There is no nonfunctional sample preset button.
Tempo-synchronized sample delay follows the project's BPM during preview and
Save; changing tempo retains the live preview source and graph.

Region/reverse/fades, crop/delete, normalize, speed/pitch and time stretching
remain **prepared-buffer operations**: Preview prepares their new buffer.
They are not falsely labelled continuous live edits. Save renders the original
editor's current edits and effects once into a new float WAV; it does not bake
the already-processed preview a second time. Original PCM/history remain intact.

Mastering B auditions the prepared **unmastered** mix through one live mastering
graph. EQ/dynamics/saturation/imaging/limiter/output settings and module order
update that graph while listening. A bypasses mastering. Loudness, stereo
analysis, waveform and level matching are cached offline measurements: edits
invalidate them until **Render mix & preview** is run again. Other song edits
invalidate the prepared mix. A/B switches preserve offset but recreate the
audition source; continuous scalar edits do not.

Sampler ADSR/tuning and Drum Rack pad gain/pitch now use compact shared knobs
with precise numeric fields/reset; pan, waveform boundaries, faders, velocity
and timeline ranges retain positional controls. Sampler legacy delay displays
milliseconds while its state remains seconds. Envelope/root/tuning/pad settings
affect **new voices**; existing track filter/device changes affect active voices.
Recording's backing mix now updates during idle backing playback as well as
recording, without printing monitoring/backing into dry captured PCM.

One centralized **Space** handler routes to the active workspace:

- Arrangement, Sampler, Drum Rack and Export: song Play/Pause, including the
  independent instrument clips. No separate pattern-only transport is invented.
- Sample Studio: current sample Play/Pause, preserving pause offset/loop phase.
- Mastering: prepared mix audition Play/Pause; render first if none is prepared.
- Recording: backing Play/Pause when idle. Busy microphone/calibration/unsaved
  take states show a safety message and remain unchanged.

Focused fields/native controls keep their own Space behavior. Handled background
Space prevents page scrolling; repeats and overlapping starts are suppressed.
Global Play text and accessibility labels follow the current workspace.
Arrangement Stop retains song position; Return to Start resets it. Sample/
Master Stop reset their own preview. Explicit recording Finish/Stop/Cancel
controls remain separate from keyboard playback.

The current full Node suite passes **310/310**, preserving the 298-test starting
baseline. See the [effect inventory](./BATCH_005B_4B_EFFECT_AUDIT.md) and
[execution / audio / portability report](./BATCH_005B_4B_REPORT.md) for precise
browser evidence and limitations. Five-width synthetic touch is not
physical-device verification or the complete 005B.5 mobile architecture.

## Implemented

- Responsive dark UI with Arrangement, Sample Studio and Mastering views.
- Sample import via files and folder selection; supported desktop browsers can grant a writable folder handle.
- Audio decoding, previews, clips on tracks, drag/drop positioning, per-track gain/pan/mute/solo, BPM and playhead.
- Sample Studio provides a stereo-aware waveform, horizontal zoom/scroll and frame-based selection with optional zero-cross snapping; crop/split/delete, silence trimming, fades, -60 to +120 dB gain, peak normalization, reverse, A/B, loop preview, and undo/redo. Microphone capture displays a live waveform and input level. Gain and supported ordered effects are live; region/fades/reverse and experimental pitch-preserving stretch/repitch prepare a buffer on Preview. Save computes current edits/effects once into a new WAV. Recording/imported source audio is kept unchanged; the saved WAV can be assigned to a Sampler or Drum Rack.
- Sample-based sampler tracks with automatic root-pitch estimation and confidence, manual root-key adjustment, pitched/gated, one-shot and loop modes, sample start/end, ADSR controls, transpose/fine tuning, and a 16-bar piano roll. Notes are internal pitch/time/duration/velocity events, not MIDI files or external MIDI input.
- The piano roll supports note creation, selection, moving/resizing, copy/paste/duplicate, quantize, undo/redo, velocity, zoom, keyboard preview, and snap from one bar down to 1/64 note or off.
- Its collapsible velocity lane shares horizontal scrolling and time zoom with the notes. Drag one bar or a selected group vertically; one gesture is one Undo step. It edits the existing `note.velocity`, which affects playback and persists in JSON/.EHS. The toolbar velocity slider remains the default for new notes.
- Sampler and Drum Rack tracks have independent Arrangement clips with named patterns, note/drum previews, beat-based boundaries, source offsets and looping. **+ Pattern Clip** creates a new section; double-click/tap or **Open Editor** edits that exact pattern. Duplicate/copy creates independent patterns; **Linked Duplicate** shares a pattern explicitly, with a LINKED indicator and **Make Independent** action. Mixed audio/instrument ranges preserve relative timing, gaps and partial-pattern phase through copy/paste, duplication and undo/redo.
- A dynamic Drum Rack (starts with one pad; add/remove up to 32 pads with stable ids) supports assigning imported samples, per-pad volume/pitch/pan/mute, pad preview, keyboard triggering, and 16/32/64-step sequencing. Drum Rack steps and piano-roll notes share the same pattern data; note patterns are included in offline WAV rendering.
- Sampler and Drum Rack tracks include a per-track low/high-pass filter with resonance and delay. Pattern playback and effects are included in offline WAV rendering.
- The Arrangement mixer provides live stereo peak meters and one-second sample-peak clipping warnings per track, plus per-track volume/pan/mute/solo and a master fader. The ordered device chain supports four-band parametric EQ with low/high-cut filters, compressor with makeup and gain-reduction readout, tempo-synced delay, pre-delay reverb, saturation, Utility gain/pan/stereo width/polarity, and compressor-assisted sample-peak limiting. Compressor effects can use another track as an isolated external sidechain detector, with pre/post-fader tap, detector gain/high-pass, and a ghost-trigger option. Devices can be reordered, bypassed, removed, and saved/loaded as local effect presets. Device parameters and chain order persist with project metadata. Live playback and offline rendering share the same track-graph builder and AudioWorklet sidechain processor, and WAV duration includes configured effect tails.
- Arrangement clips can be moved between tracks, trimmed, split at the playhead, duplicated, copied/pasted, deleted, looped, faded, gain-adjusted, and grid-snapped. Clip edits have bounded undo/redo history and are rendered through the shared live/offline path.
- Mastering Studio uses one shared live/offline chain for six-band EQ, 4×-oversampled saturation, mid/side width, adjustable three-band compression, output gain and the final linked-stereo lookahead limiter. Three-band dynamics use cascaded second-order Butterworth filters (Linkwitz–Riley 4th-order low/mid/high crossovers), per-band threshold/ratio/attack/release/knee/makeup/output gain, bypass, solo and gain-reduction meters. EQ, saturation, imager and multiband modules can be reordered; the safety limiter remains fixed after output gain. Settings/order persist with the project and complete chains can be saved as local presets. The live FFT spectrum has a logarithmic 20 Hz–20 kHz scale, dB grid and peak hold. Stereo correlation, balance and mono-loss analysis accompany audition-only mono/left/right/mid/side monitoring. A/B compares the unmastered arrangement with the processed master, preserves playback position and can attenuate the louder side using measured integrated loudness; monitoring gain/modes never enter export. BS.1770-style K-weighted loudness runs in a cancellable progress-reporting Web Worker for rendered buffers. True peak uses 4× 16-tap windowed-sinc interpolation and remains an estimate, not certification.
- Export Studio renders the arrangement once through the shared offline track, mixer, sidechain and optional mastering path, then encodes locally in a cancellable Worker. WAV supports stereo/mono 16-bit and 24-bit PCM or 32-bit float at 44.1, 48, 88.2 or 96 kHz; integer WAV can use TPDF dither. MP3 supports 128/192/256/320 kbps at 44.1 or 48 kHz using the separately loaded, locally bundled LGPL-3.0 LAMEJS encoder. A 32-tap windowed-sinc resampler, encoded-file decode/analysis, memory warnings, progress and cancellation are included. Export options persist in project metadata; no audio is uploaded.
- Portable `.EHS` projects are versioned ZIP-compatible archives containing project JSON, referenced clip/Sampler/Drum Rack audio, artwork and custom mastering presets. Audio assets are deduplicated and SHA-256 checked; import validates paths, sizes, ZIP structure, checksums and project references before staging media and replacing the active project. Container version 1 is preserved. Typed instrument projects use project schema 2 with the required `instrumentClips` feature; older schema-1-only applications must reject these projects rather than lose their patterns. Legacy patterns migrate atomically on loading, retaining their musical content and final-note tails.
- Export Studio includes editable release metadata, local JPEG/PNG square-crop/resize preparation, ID3v2.3 MP3 text/APIC tags, and RIFF LIST/INFO WAV metadata. Release ZIP export renders once, then includes selected mastered WAV/MP3 outputs, release metadata/notes and optional artwork. `EHS_FORMAT_SPEC.md` documents the archive schema and import limits.
- Direct write to selected folder when permitted; otherwise export download. Imported/recorded assets cached in IndexedDB.
- Project metadata autosaves in localStorage and remains exportable/importable as JSON; `.EHS` is the self-contained transfer/backup option. Working assets remain in the browser's IndexedDB cache.

## Important limitations

- Batch 005A.6 instrument-clip integration is functionally complete: **198/198 Node tests**, real UI composition, five-width browser touch checks, decoded WAV/MP3 exports and a fresh native-browser-profile `.EHS` round trip passed. This is not physical-device validation. Fractional-rate audio slice restarts retain a measured native source-offset quantization discrepancy (maximum 0.001567 at 1.25x in the controlled fixture); output is not claimed sample-identical. Long-project memory/scheduling, streamed archives, recovery and real-device acceptance remain Batch 005A.7 work. See [BATCH_005A_6_REPORT.md](./BATCH_005A_6_REPORT.md).
- Batch 004 Phases 1–6 are functionally complete with local automated and Chromium acceptance evidence; see `BATCH_004_FINAL_ACCEPTANCE.md`. Independent EBU/ITU loudness/LRA/true-peak reference vectors, physical live-output/device tests, GitHub Pages deployment of this unpushed worktree, and medium/large long-project performance remain release-validation or Batch 005 tasks. The 4× true-peak meter/limiter detector is an estimate, not formal compliance. The limiter is optional; aggressive EQ/output gain can clip when bypassed.
- MP3 encoding is CBR and the current encoder output is not gapless: Chromium decoding adds encoder delay/padding (1,257–2,193 frames in the latest workloads). Metadata support is ID3v2.3 and RIFF LIST/INFO, not BWF, RF64 or a complete broadcast metadata implementation. `.EHS` builds ZIP output in 1 MiB input chunks into a Blob, but payload collection and import decompression remain buffered, not end-to-end streamed. Limits remain 256 MiB compressed / 512 MiB expanded and 4,096 entries. Offline render is bounded to 10 minutes; estimated memory use above 192 MiB prompts a warning and above 768 MiB is blocked. Offline cancellation retires the graph at the next approximately one-second audio scheduling boundary, then drains the disconnected context as silence because the browser has no offline `close()` API. Worker resampling/encoding is cancellable. Desktop measurements are in `BATCH_005A_7C_REPORT.md`; physical-device memory remains unmeasured.
- Sample speed/pitch processing uses a lightweight waveform-similarity overlap-add stretch, not a production phase vocoder; only synthetic sine behavior was checked here, so transient quality and long-recording performance are not established. No warp markers, automation, waveform thumbnails on timeline, or account sync yet. Loudness analysis and encoding use cancellable Workers and copy channel data for transfer; long-project mobile memory/time behavior has not been measured. Piano-roll events drive the app's sample instruments; MIDI is not part of the workflow.
- Automatic pitch estimation is intended for clear, sustained, single-note samples; it is not reliable for chords, noisy recordings or most drum hits. Always audition and adjust the root key by ear. The piano roll spans five octaves and stores a 16-bar pattern.
- The sampler is not a full multisample/key-zone instrument. Drum Rack sequencing is one bar wide in the step-sequencer view; longer duplicated patterns can be edited in the piano roll. Touch-first editing still needs physical-device verification.
- JSON project export remains metadata-only; use `.EHS` to carry referenced sample data. Project working copies and release artwork are still stored locally in IndexedDB and localStorage until explicitly exported.
- Playback uses a 25 ms scheduler / 150 ms audio-clock lookahead. Throttling beyond the horizon still causes a gap; recovery replaces stale voices rather than duplicating them. Worklet processor failures stop playback visibly and rebuild the failed graph on the next Play; offline processor failures reject export instead of accepting silent output.
- Sample Studio waveform selection supports pointer editing and touch marker controls. Marker hover/drag backgrounds and Arrangement clip-edge handles use a faint translucent fill so they do not obscure the audio beneath them; marker lines, labels and touch-target sizes remain unchanged. The piano roll, Drum Rack, Arrangement and mixer use scrollable controls on narrow screens. Responsive viewport checks at 360, 390, 430, 768 and 1280 CSS pixels are browser emulation only, not physical-device mobile verification; microphone capture and touch behavior on real devices remain untested.
- Folder write-back depends on browser permission; iOS/Safari and Firefox generally require download/share fallback. Microphone needs localhost or HTTPS and user permission.
- Avoid importing huge folders into the prototype: files are decoded fully in memory.

See `IDEA.md` for architecture, full requirements, acceptance tests, agent workflow and development batches.

## Verification

Run `npm test` with Node.js installed. Batch 005A.7C preserves all 253 previous tests and adds continuous offline-window, cancellation/disposal and static-version regressions. See `BATCH_005A_7C_REPORT.md` for exact results and browser reproduction commands. `.github/workflows/test.yml` runs `npm test` on Node.js 22. This batch has not been committed, pushed or deployed.

### Batch 005A.7C rendering and reliability closure

Offline export now schedules source nodes in approximately one-second, render-quantum-aligned windows inside **one continuous OfflineAudioContext**. Completed source graphs are disconnected between windows; track effects, sidechain, mastering, filters, reverbs and limiter state are not restarted. Metadata/settings and the buffer-reference map are captured before asynchronous rendering, so later edits do not change the export. Progress and cancellation are wired to Export Studio and Release ZIP rendering.

The controlled 12-track/180-second context render fell from **546.25 s to 66.18 s**. The 24-track/300-second context render completed in **192.70 s**, with WAV/MP3 independently decoded. All effects and quality settings stayed enabled. These are desktop Chromium measurements, not mobile performance promises. The optimization has measured small floating-point summation differences, not sample-identical output. A separately verified stereo-imager wiring repair restores the correct right-side polarity; old projects may therefore sound different from the previously incorrect duplicated-left output.

Native browser termination/relaunch preserved the previous project and audio at tested autosave/import/export boundaries. A two-minute dense looping/seek/suspension/BPM/sidechain stress run ended with no duplicate or stuck sources. Physical microphones/devices, independent browser engines, standards certification and actual Pages deployment remain acceptance gates for 005B/release. See [BATCH_005A_7C_REPORT.md](./BATCH_005A_7C_REPORT.md).

### Batch 005A.7B reliability checkpoint

Synthetic Chromium recording acceptance covers count-in, pre-roll, exact punch frame counts, offset placement, loopback calibration, denied permission, quota failure/retry, buffered WAV recovery, suspension recovery and microphone-track disposal. Recorded audio survived a clean-origin .EHS restore and WAV/MP3 export. These are synthetic inputs, not hardware-latency certification. Drum Rack and velocity-lane touch checks passed at 360/390/430/768/1280 px.

Autosave failures now display an explicit warning while retaining the previous saved snapshot. JSON and .EHS export remain available for in-memory recovery even when metadata storage is full. A corrupt recovered snapshot is backed up under `pulse-project-recovery-<timestamp>` before later edits can replace it; if that backup cannot be written, replacement is refused. Portable import storage failures leave the active project unchanged. Project export has cancellation and snapshots metadata before asynchronous packaging.

This historical 7B checkpoint was incomplete. Its long-export and remaining reliability gates are superseded by `BATCH_005A_7C_REPORT.md`; the measurements and limitations below remain historical evidence, not new certification.

Chromium browser acceptance used generated audio and a browser-emulated microphone stream. It covered Sample Studio editing and processed-WAV saving, Sampler/Piano Roll and Drum Rack pattern creation, multiple arranged tracks with independent effects, mute/solo routing, WAV export/decode, and project reload. The final mix decoded as stereo 48 kHz audio, 34.25 seconds long, with nonzero signal (RMS 0.116) and peak 0.928. EQ-on/off exports differed, confirming the effect changed rendered audio. Browser-emulated viewport checks at 360, 390, 430, 768 and 1280 CSS pixels found no page-level horizontal overflow; timeline seeking matched 2.0 seconds at 120 BPM across all widths and 2.4 seconds for a four-beat span at 100 BPM/125% zoom. These checks are not physical-device tests. Real microphone hardware, physical iPhone/Android behavior, remote GitHub Actions, and the unpushed changes on GitHub Pages remain unverified; see `BATCH_003_FINAL_REPORT.md`.

Mastering browser checks rendered and A/B auditioned a 34.25-second arrangement, applied the Electronic / EDM preset, and exported/inspected a stereo WAV. The RMS readout changed from -18.7 dBFS (pre-mastering chain) to -17.8 dBFS (processed); sample peak changed from 0.9280 (-0.6 dBFS) to 0.9646 (-0.3 dBFS). The exported WAV header measured 44.1 kHz, 16-bit PCM, stereo; its PCM peak was 0.9646 and RMS 0.1287. It was non-silent and the before/after signals differed measurably. Mastering settings and preset selection survived reload. At 360, 390, 430, 768 and 1280 CSS pixels, the advanced panel had no page-level horizontal overflow and playback/export controls remained touch-sized in emulation. These are local Chromium checks, not physical-device or standards-compliance tests; details and limitations are in `BATCH_004_REPORT.md`.

Phase 2 Chromium checks loaded the mastering AudioWorklet, rendered an impulse at a -3 dBTP ceiling, and measured **-3.085 dBTP** with the application's 4× estimate (0.085 dB below the target). An arrangement render with a -2 dBTP setting was encoded to WAV, decoded by Chromium, and measured at **-2.099 dBTP**. Offline latency trimming retained the expected 8.30-second duration. The mastering panel displayed and rendered at 360, 390, 430, 768 and 1280 CSS pixels without page-level horizontal overflow. Browser emulation and OfflineAudioContext are not physical-device or live-output tests; the 4× estimator is not independently certified.

Phase 4 Chromium exports verified 16-bit/44.1 kHz WAV, dithered 24-bit/48 kHz WAV, float32/96 kHz WAV and 320 kbps/48 kHz MP3. A generated four-track arrangement included audio clips, Sampler, Drum Rack, track EQ/compression/delay, sidechain, multiband mastering, saturation, stereo width and limiter; the same 8.333-second stereo render encoded to WAV and MP3. Both decoded at 48 kHz; measured integrated loudness was **-24.44 LUFS** (WAV) and **-24.43 LUFS** (MP3), with approximately **-5.80 dBTP estimated**. A separate muted ghost-trigger fixture reduced bass transient-window RMS by **25.64 dB**. MP3 decoded duration was 8.376 seconds due to encoder frame padding. Chromium viewport emulation at 360/390/430/768/1280 CSS pixels found no horizontal overflow; Export Studio controls were at least 42 px high. These are generated fixtures and browser emulation, not physical-device or independent mastering-standard certification.

A final Basic-mode MP3 export from the saved 34-second project completed at 320 kbps/44.1 kHz stereo; encoded-file analysis reported **-17.7 LUFS**, **-8.8 dBFS sample peak**, and **-8.8 dBTP estimated**. Advanced bitrate/rate settings persisted after reload, and switching to Basic restored the recommended defaults.

Batch 004 Phase 6 used a deterministic eight-track production fixture and browser workflow. Chromium imported an `.EHS` after the app's project localStorage and asset IndexedDB were cleared, restored all seven referenced assets, played the arrangement without missing samples, and reopened a second edited archive with identical audio hashes. A 34.586-second stereo/44.1 kHz mix exported as 16-bit PCM, 24-bit PCM, float32 WAV and 320 kbps MP3; all four decoded-file analyses reported **-21.1 LUFS**, **-7.5 dBFS sample peak** and **-7.5 dBTP estimated**. The Release ZIP contained both mastered formats, matching metadata, notes and artwork. Browser-emulated layout checks covered all four primary workspaces at five widths; the browser context did not enable touch input. Microphone hardware, physical mobile devices, deployed Pages, independent standards vectors and 3-/5-minute projects remain unverified. See `BATCH_004_FINAL_ACCEPTANCE.md` for measured results and reproduction steps.

## Batch 005A optimization checkpoint

Batch 005A is **incomplete**, with a tested archive/waveform/voice-lifecycle checkpoint recorded in [BATCH_005A_REPORT.md](./BATCH_005A_REPORT.md). `.EHS` validation/unpacking/checksums run in a cancellable module Worker when supported; the UI can cancel before the final asset transaction. Duplicate packaged assets share immutable Blobs and decoded buffers, and matching local audio with verified decode provenance is reused without another decode. Sampler/pad previews now use transport-stop and natural-end cleanup. Cached waveform range queries preserve exact pixel extrema; sidechain attack/release coefficients are computed once per block with sample-exact regression coverage.

The controlled approximately 102 MiB archive comparison reduced worst main-thread heartbeat delay from 5,347 ms to 15 ms; total import time increased slightly. Warm waveform redraws of the tested 30-second/3-minute/5-minute samples were 84–97% faster with identical pixels. These are desktop Chromium measurements, not mobile guarantees. ZIP processing is still buffered, overall native/Worker memory is unmeasured, and archive limits are unchanged. Streaming/chunked archives, reference-aware cache eviction, complete long-project exports, scheduling/virtualization, storage-failure recovery and physical-device validation remain open.

## Batch 005A.6C instrument workflow and Recording Studio

Sampler and Drum Rack tracks now start empty; the track dialog only chooses name, color and type. Samples are assigned from the instrument editor (searchable picker, drag-drop, Preview/Replace/Clear, per-pad Add/Replace/Remove), patterns are created with **+ Pattern** (1/2/4/8 bars or custom beats), and track effects plus a sample browser live inside the instrument editors. Pad-level effect chains are not implemented. A new **Recording Studio** workspace captures one microphone input as AudioWorklet float PCM with count-in, metronome, offset compensation, session-only backing selection and multiple takes; takes are ordinary Audio-track clips and round-trip through `.EHS`. Punch in/out and multi-input recording are not implemented. Recording was verified with a synthetic oscillator input in Chromium, not a physical microphone. See [BATCH_005A_6C_REPORT.md](./BATCH_005A_6C_REPORT.md).

## Batch 005A.5 precise editing checkpoint

Sample Studio now preserves exact Start frame 0 and exclusive End frame N with zero snapping enabled, including zoomed/scrolled mouse and synthetic-touch drags. Endpoint handles point inward without changing scroll geometry. Numeric/fine adjustments use integer frames; background Space now toggles sample Play/Pause through the centralized workspace router. Faint marker backgrounds keep the waveform visible.

Arrangement adds a beat ruler, separate insertion marker, movable/resizable loop brace, Follow, grab-offset-correct clip snapping, source-aware audio trims, full-height waveforms and rectangular audio time selection across tracks. Range copy/paste/duplicate/cut/delete preserve partial clips, track spacing, empty gaps, loop phase and original fade positions without copying audio bytes. Overlapping clips remain separate audible layers. Undo includes loop edits and is cleared on project replacement. The aligned right mixer shares each track's scroll row; the collapsible bottom panel retains the selected track's effects. On touch screens, enable **Select Range** or **Edit Clips (touch)** to edit without turning ordinary scrolling into a drag.

Chromium checks covered mouse and synthetic touch, five viewport widths, processed-sample saving, offline sliced-loop comparison, actual WAV export/decode and `.EHS` save/reopen. Clip waveform canvases now cover only the visible viewport portion, redraw on scroll/resize and release offscreen bitmap storage instead of allocating song-wide canvases. The full Node suite passes **141/141**. See [BATCH_005A_5_REPORT.md](./BATCH_005A_5_REPORT.md) for measurements and reproduction.

**Batch 005A.5 remains incomplete.** Sampler/Drum Rack tracks still repeat whole-track patterns rather than independent Arrangement pattern clips; instrument-range edits explicitly warn. Instrument controls still open their existing editor, not a fully inline device. Fractional-rate split equivalence, a full mobile mixer sheet, physical devices, other browsers and the complete release-format matrix remain unverified or unfinished. Optional clip metadata retains `.EHS` v1; older app revisions may ignore sliced-loop/fade offsets. The earlier Batch 005A performance backlog remains open.

### Transport and live-control follow-up

Playback now continues through silence until stopped. With Loop enabled, Play starts inside the selected range and repeats it even when the range is empty or extends past the last clip. A 150 ms audio-clock lookahead schedules exact loop boundaries instead of restarting playback from a UI timer; source voices are cut at the loop end and the ruler grows as non-loop playback advances.

Track volume, pan, mute/solo and effect parameters update the live graph. Adding, bypassing, reordering or removing devices preserves the input already-playing sources use. Clip, pattern and instrument edits reschedule voices at the current position without requiring Stop/Play; ordinary mixer/effect changes do not restart voices. Structural changes can reset effect tails, and voice rescheduling is not guaranteed click-free. Sample Studio now has the separate live preview path described in Batch 005B.4B above. Offline/export duration remains content-based, not infinite.

Piano Roll fixes remove double horizontal scrolling and double vertical note offsets; notes render in the clicked pitch lane and scroll position survives edits. Mouse drag and synthetic touch at 390 px were verified. Eleven new regressions bring the suite to **152/152**. Browser checks measured exactly 0.5-second scheduled loop intervals, non-silent rendered loop boundaries, and immediate live UI gain changes. Prolonged main-thread stalls/background throttling can still exceed lookahead; recovery replaces stale voices rather than doubling them. Physical-device timing and arbitrary waveform seam clicks are not certified.

### Track setup and elapsed time

**+ Track**, **+ Sampler** and **+ Drum Rack** open a setup dialog for name, color and playback type: Audio, Sampler or Drum Rack. Sampler requires a loaded sample; Drum Rack can start with empty pads or an optional sample. Bass/Synth are names you can choose, not separate synthesis engines. Existing Sample Studio Create Sampler/Add to Drum Rack workflows are preserved.

Use **Edit** on a track header or its right mixer strip to rename/recolor it later. Playback type is fixed after creation to avoid discarding existing clips, notes or instrument settings. Settings persist in JSON/autosave and `.EHS` v1, with no format change.

The transport now shows **minutes:seconds.milliseconds** beside the musical bar/beat position. This is the current Arrangement playhead position, not total time spent listening: it follows seeking and loop wraps, freezes on Stop and resets with Back to Start. Seven added tests bring the full suite to **159/159**. Chromium verified all three creation types, rename/recolor, cancel/Escape, reload persistence, clock playback/seek/stop/reset and layout at 360/390/430/768/1280 px; physical-device verification remains pending.
