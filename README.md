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
- Microphone or imported-sample editing with trim, fade in/out, reverse, gain/normalize and preview; Save Sample caches the edited WAV and enables creating a Sampler or Drum Rack directly from it.
- Sample-based sampler tracks with automatic root-pitch estimation and confidence, manual root-key adjustment, pitched/gated, one-shot and loop modes, sample start/end, ADSR controls, transpose/fine tuning, and a 16-bar piano roll. Notes are internal pitch/time/duration/velocity events, not MIDI files or external MIDI input.
- The piano roll supports note creation, selection, moving/resizing, copy/paste/duplicate, quantize, undo/redo, velocity, zoom, keyboard preview, and snap from one bar down to 1/64 note or off.
- A 16-pad Drum Rack supports assigning imported samples, per-pad volume/pitch/pan/mute, pad preview, keyboard triggering, and 16/32/64-step sequencing. Drum Rack steps and piano-roll notes share the same pattern data; note patterns are included in offline WAV rendering.
- Sampler and Drum Rack tracks include a per-track low/high-pass filter with resonance and delay. Pattern playback and effects are included in offline WAV rendering.
- Direct write to selected folder when permitted; otherwise WAV download. Imported/recorded assets cached in IndexedDB.
- Project metadata autosaved in localStorage and exportable/importable as JSON; asset bytes remain in the browser cache.
- Offline stereo WAV render with simple high-shelf EQ, compressor and output gain.

## Important limitations

- No external MIDI instruments or MIDI file import/export, time stretching, automation, waveform thumbnails on timeline, multiband mastering, LUFS analysis, true-peak limiting, MP3 export or account sync yet. Piano-roll events drive the app's sample instruments; MIDI is not part of the workflow.
- Automatic pitch estimation is intended for clear, sustained, single-note samples; it is not reliable for chords, noisy recordings or most drum hits. Always audition and adjust the root key by ear. The piano roll spans five octaves and stores a 16-bar pattern.
- The sampler is not a full multisample/key-zone instrument. Drum Rack sequencing is one bar wide in the step-sequencer view; longer duplicated patterns can be edited in the piano roll. Touch-first clip manipulation and physical-device mobile verification remain incomplete.
- JSON project export is **not a self-contained archive**; samples remain in browser IndexedDB. A project opened in another browser/device needs sample relinking or a future bundled-project format.
- Playback scheduler currently schedules whole clips up front and needs refactoring for robust editing during playback, long projects, loop boundaries and mobile memory limits.
- Drag-and-drop editing is optimized for mouse. The piano roll and Drum Rack use scrollable controls on narrow screens; touch-first clip manipulation and physical-device mobile verification remain future work.
- Folder write-back depends on browser permission; iOS/Safari and Firefox generally require download/share fallback. Microphone needs localhost or HTTPS and user permission.
- WAV export does not guarantee true-peak-safe mastering; output can clip if excessive gain is applied. No validated LUFS measurement.
- Avoid importing huge folders into the prototype: files are decoded fully in memory.

See `IDEA.md` for architecture, full requirements, acceptance tests, agent workflow and development batches.
