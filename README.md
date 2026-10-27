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

Push this folder to a GitHub repository. In **Settings → Pages**, select **Deploy from a branch**, branch `main`, folder `/ (root)`. The `index.html` is at the root and asset paths are relative, so the site can be served at a repository subpath. No build step required. GitHub Pages serves static assets only: the Flask server is **not deployed**.

## Implemented

- Responsive dark UI with Arrangement, Sample Studio and Mastering views.
- Sample import via files and folder selection; supported desktop browsers can grant a writable folder handle.
- Audio decoding, previews, clips on tracks, drag/drop positioning, per-track gain/pan/mute/solo, BPM and playhead.
- Sample Studio provides a stereo-aware waveform, horizontal zoom/scroll and frame-based selection with optional zero-cross snapping; crop/split/delete, silence trimming, fades, -60 to +120 dB gain, peak normalization, reverse, A/B, loop preview, and undo/redo. Microphone capture displays a live waveform and input level; speed, experimental pitch-preserving stretch/repitch and an ordered sample effect chain are processed into a new WAV on preview/save. Recording/imported source audio is kept unchanged; the saved WAV can be assigned to a Sampler or Drum Rack.
- Sample-based sampler tracks with automatic root-pitch estimation and confidence, manual root-key adjustment, pitched/gated, one-shot and loop modes, sample start/end, ADSR controls, transpose/fine tuning, and a 16-bar piano roll. Notes are internal pitch/time/duration/velocity events, not MIDI files or external MIDI input.
- The piano roll supports note creation, selection, moving/resizing, copy/paste/duplicate, quantize, undo/redo, velocity, zoom, keyboard preview, and snap from one bar down to 1/64 note or off.
- A 16-pad Drum Rack supports assigning imported samples, per-pad volume/pitch/pan/mute, pad preview, keyboard triggering, and 16/32/64-step sequencing. Drum Rack steps and piano-roll notes share the same pattern data; note patterns are included in offline WAV rendering.
- Sampler and Drum Rack tracks include a per-track low/high-pass filter with resonance and delay. Pattern playback and effects are included in offline WAV rendering.
- The Arrangement mixer provides live stereo peak meters and one-second sample-peak clipping warnings per track, plus per-track volume/pan/mute/solo and a master fader. The ordered device chain supports four-band parametric EQ with low/high-cut filters, compressor with makeup and gain-reduction readout, tempo-synced delay, pre-delay reverb, saturation, Utility gain/pan/stereo width/polarity, and compressor-assisted sample-peak limiting. Devices can be reordered, bypassed, removed, and saved/loaded as local effect presets. Device parameters and chain order persist with project metadata. Live playback and offline rendering share the same track-graph builder, and WAV duration includes configured effect tails.
- Arrangement clips can be moved between tracks, trimmed, split at the playhead, duplicated, copied/pasted, deleted, looped, faded, gain-adjusted, and grid-snapped. Clip edits have bounded undo/redo history and are rendered through the shared live/offline path.
- Mastering Studio has a shared live/offline master graph with six-band EQ and interactive response points, 4x-oversampled waveshaper saturation, mid/side width, compressor-based peak control, output gain, built-in/custom parameter presets, rendered-mix A/B audition, and RMS/sample-peak analysis. Settings persist in the existing project JSON.
- Direct write to selected folder when permitted; otherwise WAV download. Imported/recorded assets cached in IndexedDB.
- Project metadata autosaved in localStorage and exportable/importable as JSON; asset bytes remain in the browser cache.
- Offline stereo WAV render with simple high-shelf EQ, compressor and output gain.

## Important limitations

- Batch 003's synthetic end-to-end acceptance workflow is verified in Chromium. Batch 004 is in progress: mastering EQ, saturation, stereo width, A/B rendering, basic meters, presets, and WAV export are functional, but the mastering implementation is a vertical slice, not a complete mastering suite. It has no LUFS, LRA, or true-peak measurement; the peak-control stage is a Web Audio compressor, not a lookahead/true-peak limiter. Multiband dynamics and MP3/24-bit/float WAV export are not implemented. Existing track/master compressor behavior and new mastering stages are tested with focused Node and browser signal checks, not a full reference/golden-signal suite. Aggressive EQ/gain can clip, especially with compressor peak control disabled.
- Sample speed/pitch processing uses a lightweight waveform-similarity overlap-add stretch, not a production phase vocoder; only synthetic sine behavior was checked here, so transient quality and long-recording performance are not established. No warp markers, automation, waveform thumbnails on timeline, multiband mastering, LUFS analysis, true-peak limiting, MP3 export or account sync yet. Piano-roll events drive the app's sample instruments; MIDI is not part of the workflow.
- Automatic pitch estimation is intended for clear, sustained, single-note samples; it is not reliable for chords, noisy recordings or most drum hits. Always audition and adjust the root key by ear. The piano roll spans five octaves and stores a 16-bar pattern.
- The sampler is not a full multisample/key-zone instrument. Drum Rack sequencing is one bar wide in the step-sequencer view; longer duplicated patterns can be edited in the piano roll. Touch-first editing still needs physical-device verification.
- JSON project export is **not a self-contained archive**; samples remain in browser IndexedDB. A project opened in another browser/device needs sample relinking or a future bundled-project format.
- Playback scheduler currently schedules whole clips up front and needs refactoring for robust editing during playback, long projects, loop boundaries and mobile memory limits.
- Sample Studio waveform selection supports pointer editing and touch marker controls. The piano roll, Drum Rack, Arrangement and mixer use scrollable controls on narrow screens. Responsive viewport checks at 360, 390, 430, 768 and 1280 CSS pixels are browser emulation only, not physical-device mobile verification; microphone capture and touch behavior on real devices remain untested.
- Folder write-back depends on browser permission; iOS/Safari and Firefox generally require download/share fallback. Microphone needs localhost or HTTPS and user permission.
- WAV export does not guarantee true-peak-safe mastering; output can clip if excessive gain is applied. No validated LUFS measurement.
- Avoid importing huge folders into the prototype: files are decoded fully in memory.

See `IDEA.md` for architecture, full requirements, acceptance tests, agent workflow and development batches.

## Verification

Run `npm test` with Node.js installed. The full suite passed locally on Node.js 24.20.0 (**51 tests, 0 failures**). `.github/workflows/test.yml` runs the suite on Node.js 22 for pushes to `main` and pull requests; the remote GitHub Actions run is pending because this work has not been pushed.

Chromium browser acceptance used generated audio and a browser-emulated microphone stream. It covered Sample Studio editing and processed-WAV saving, Sampler/Piano Roll and Drum Rack pattern creation, multiple arranged tracks with independent effects, mute/solo routing, WAV export/decode, and project reload. The final mix decoded as stereo 48 kHz audio, 34.25 seconds long, with nonzero signal (RMS 0.116) and peak 0.928. EQ-on/off exports differed, confirming the effect changed rendered audio. Browser-emulated viewport checks at 360, 390, 430, 768 and 1280 CSS pixels found no page-level horizontal overflow; timeline seeking matched 2.0 seconds at 120 BPM across all widths and 2.4 seconds for a four-beat span at 100 BPM/125% zoom. These checks are not physical-device tests. Real microphone hardware, physical iPhone/Android behavior, remote GitHub Actions, and the unpushed changes on GitHub Pages remain unverified; see `BATCH_003_FINAL_REPORT.md`.

Mastering browser checks rendered and A/B auditioned a 34.25-second arrangement, applied the Electronic / EDM preset, and exported/inspected a stereo WAV. The RMS readout changed from -18.7 dBFS (pre-mastering chain) to -17.8 dBFS (processed); sample peak changed from 0.9280 (-0.6 dBFS) to 0.9646 (-0.3 dBFS). The exported WAV header measured 44.1 kHz, 16-bit PCM, stereo; its PCM peak was 0.9646 and RMS 0.1287. It was non-silent and the before/after signals differed measurably. Mastering settings and preset selection survived reload. At 360, 390, 430, 768 and 1280 CSS pixels, the advanced panel had no page-level horizontal overflow and playback/export controls remained touch-sized in emulation. These are local Chromium checks, not physical-device or standards-compliance tests; details and limitations are in `BATCH_004_REPORT.md`.
