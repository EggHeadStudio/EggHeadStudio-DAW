# EGGHEADSTUDIO DAW — COMPLETE PRODUCT VISION AND AGENT DEVELOPMENT PLAN

Version: 1.0 (2026-10-26)  
Status: Product specification + staged roadmap; repository currently contains **prototype v0.1**, not a finished professional DAW.

## 0. AGENT INSTRUCTIONS — READ FIRST

You are building **EggHeadStudio DAW**, a professional, mobile-first, browser-based, Ableton Arrangement-inspired digital audio workstation (DAW) that can be hosted on **GitHub Pages**. Work incrementally and preserve working features. Never claim an unfinished capability works. Read README.md, inspect the existing source, and run baseline tests before changing code. Use one batch at a time. For each batch: (1) audit current code, (2) implement the specified scope, (3) add unit/integration/browser tests, (4) run tests on desktop and mobile-sized viewports, (5) document failures and limitations, (6) update the progress table in this document and changelog, (7) commit only when asked. Never introduce server-only dependencies into the static GitHub Pages deployment. Prefer typed, modular, independently testable components and avoid giant single-file modules. Maintain backward-compatible project migrations. Do not rewrite the project wholesale unless specifically authorized.

**Current baseline:** vanilla JavaScript + Web Audio + static HTML/CSS, optional Flask static server. It is a functional starter, not the target architecture. Planned migration to React/TypeScript/Vite must be a deliberate tested batch, keeping Pages compatibility. The existing prototype can be launched without npm.

### Definition of done for any feature

- Works in a real browser with reproducible manual steps.
- Automated tests cover happy path, edge cases, and failure paths.
- Keyboard accessibility and touch behavior are addressed.
- Permission denial, missing samples, audio decode failure and storage quota errors are handled.
- No accidental upload of private samples or microphone recordings.
- Existing projects still open after schema changes, or an explicit migration is provided.
- Performance measured on representative midrange phone and desktop hardware; no unbounded memory growth.
- UI includes loading/error/empty states and no placeholder buttons that imply functionality.

## 1. PRODUCT SUMMARY

EggHeadStudio DAW is a local-first, sample-driven DAW served as a static website, including on smartphones. Its primary workspace is an **Arrangement View**. There is **NO Session View**. The core creation workflow is record or import a sound, edit it into a sample, assign it to a sampler or drum pad, compose structured note events in the piano roll, arrange patterns and audio clips, mix, master, and export. The piano roll uses internal pitch/time/duration/velocity events to control sample instruments; external MIDI hardware and MIDI files are not required. The bottom panel of Arrangement contains a contextual **Mixer & Effects / Device Chain**. Dedicated **Sample Studio** and **Mastering Studio** provide the recording/editing and finalization workflows. The app must not claim professional mastering accuracy until measurement and audio-quality tests prove it.

### Non-negotiable requirements

1. Publish static front-end on GitHub Pages (relative asset paths, client-side routing compatible with subpaths, no required backend).
2. Local-first; no cloud account, paid service, or server required for core editing, recording, playback, mixing, mastering and WAV export.
3. User-selected sample folder should be immediately browsable and usable without manually importing each sample. Preserve folder hierarchy, search, previews, favorites, indexing and drag/drop. On browsers that allow it, write finished samples back to that authorized folder. Offer fallback import/download/share where unsupported.
4. **Record Own** workflow: microphone or supported input -> capture -> nondestructive edit -> repeated audition -> choose name/format/location -> save -> immediately available in library and arrangement.
5. Responsive desktop and touch-first mobile workflows with identical project/audio engine and functional parity for essential creation tasks.
6. Multi-track arrangement with audio clips and sample-instrument patterns, internal note-event editing, optional later automation, effects chains, recording, sampler, drum rack, mixing and project persistence. External MIDI is optional and not part of the core workflow.
7. Dedicated Mastering Studio with Ozone-inspired **functional breadth** (not copied branding/UI) and scientifically defensible measurements.
8. Export WAV plus MP3 and additional feasible formats using legally compatible browser/WASM encoders, with metadata and render verification.
9. Strong undo/redo, autosave, recoverability, privacy and performance.
10. Modular architecture suitable for future cloud sync, authentication, collaboration, monetization, and optional local companion, without requiring them.

## 2. USER WORKFLOWS

### 2.1 First launch

- Open hosted URL on desktop/mobile; browser loads static assets and registers service worker after explicit offline-capability implementation.
- Choose `New Project` with BPM, time signature, sample rate, project name.
- Connect a local folder if supported; otherwise select/import folder or individual files. Show clearly whether the library is a live writable folder, an imported snapshot, or a cloud library.
- Index files in worker with cancellation, progress and bounded memory; display folders, search, duration, format, tags, waveform previews and audition.
- Offer optional demo project with bundled royalty-free sample assets only when license permits.

### 2.2 Arrange a song

- Add audio and sample-instrument tracks, subject to performance budget.
- Drag/tap a sample to insert it at playhead, timeline location, or instrument pad.
- Edit clip position, trim, split, slip, duplicate, fade, crossfade, reverse, stretch, pitch, gain and warp markers where implemented.
- Snap to beat/grid, zoom horizontally/vertically, select multiple clips, group, rename, color and undo.
- Create a sample-instrument pattern; open Piano Roll; edit internal note events (pitch, velocity, duration), quantization, scales, chords and sample-instrument routing. This is not an external MIDI workflow.
- Arrange automation for volume, pan, effects and instrument parameters.
- Record vocals, instruments or a live take into an audio track with latency calibration, count-in, monitoring and take management.

### 2.3 Record Own sample (key differentiator)

1. Tap prominent `Record Own` button from browser, drum pad or arrangement.
2. Open Sample Studio; choose microphone/input (when available), recording quality, channel mode, count-in and monitoring. Request microphone access only after user gesture.
3. Show input level and clipping indicator, live waveform, elapsed time, device state, permission status.
4. Record; allow stop, discard, retry and multiple takes. Keep original capture unmodified.
5. Open nondestructive waveform editor BEFORE committing: start/end markers, zoom, scrub, selection, trim, crop, split, fade in/out, normalize, gain, silence detection, reverse, channel operations, DC removal, click removal, noise reduction, transient shaping, EQ, filter, compression, pitch shifting and time stretching (later batches).
6. Audition processed/unprocessed A/B repeatedly. Show peak/RMS and later LUFS and spectral view. Avoid irreversible effects until save/export.
7. Save dialog: unique name, file type (WAV initially; MP3/FLAC later), sample rate/bit depth, folder path/subfolder, overwrite confirmation and sample tags.
8. On browsers with a granted writable File System Access directory handle, create a new file there after permission check; never overwrite silently.
9. On unsupported browsers, use a download/share action, optionally save to OPFS for in-app availability, and explain that the browser cannot silently write to the original directory.
10. Immediately register the finished sample in the in-app library and optionally insert it in the selected track or Drum Rack pad.
11. Recover unsaved takes after accidental navigation or tab crash where technically possible; warn before destructive close.

### 2.4 Master and export

- Switch to dedicated Mastering Studio without losing arrangement context.
- Play original mix through non-destructive master chain; allow A/B bypass, loudness-matched comparison and reference-track import.
- Apply configurable modules: corrective/linear-phase EQ, dynamic EQ, multiband dynamics, exciter/saturation, stereo imaging, transient shaping, spectral diagnostics, true-peak limiter, dither, output metering and loudness targets. Build in stages; do not market simple Biquad/Compressor as Ozone equivalent.
- Analyze integrated/short-term/momentary LUFS, LRA, RMS, peak, true peak, correlation and spectrum; verify algorithms against trusted reference fixtures (ITU-R BS.1770, EBU R128 where applicable).
- Choose output sample rate, bit depth, stereo/mono, loudness target, headroom, tail duration, filename and format.
- Render in OfflineAudioContext or validated WASM DSP/encoder; show progress and cancel when feasible.
- Verify export length, channels, sample rate, clipped samples, peak and file integrity. Support WAV first, then MP3 via licensed-compatible encoder, then FLAC/OGG if practical.

## 3. DEPLOYMENT REALITIES / HARD LIMITS

GitHub Pages only hosts static HTML/CSS/JS/WASM/media. **Flask/Python cannot run on GitHub Pages.** Optional `flask_server.py` is for local development and optional companion APIs. If remote APIs become necessary, host them separately (Cloudflare Workers, Firebase Functions or another backend). Core DAW must not require these.

File System Access directory read/write support differs substantially between browsers. Chrome/Edge desktop are the primary writable-folder target; Firefox/Safari/iOS require fallbacks. User gesture and permissions are mandatory. Do not promise persistent unattended filesystem access. On mobile, prefer OPFS/IndexedDB in-app storage plus system file picker/share sheet; explicit export of edited files is acceptable fallback.

Web MIDI support and device selection vary by platform. MIDI keyboard support must degrade gracefully. Backgrounded tabs and screen lock may suspend audio; show status, persist projects and provide resume. Mobile browsers limit memory, number of audio nodes, recording formats, decoding and concurrency. Test on actual devices.

Use HTTPS for production and localhost for development. Microphone and some storage APIs require secure context. Respect copyright and licensing of user samples and encoder libraries.

## 4. TARGET ARCHITECTURE

### 4.1 Frontend

Target: Vite + React + TypeScript; CSS tokens and component library with accessible custom DAW controls; lightweight state management (e.g., Zustand) and immutable command/history model. Canvas/WebGL for waveform/timeline visualization; worker-based peak generation. Static `base` configuration for GitHub Pages repository subpaths. Prefer hash-based routing or a Pages-compatible fallback.

### 4.2 Core domain and state

Separate serializable project data from runtime state (AudioNode references, File handles, decoded buffers). Use schema validation, migrations and deterministic stable IDs. Entities: Project, Track, AudioClip, SamplePattern, NoteEvent (pitch, beat, duration, velocity), SamplerSettings, DrumPad, Asset, AutomationLane, AutomationPoint, Device, Parameter, Bus, Send, Return, MasterChain, Marker, LoopRegion, Take, Preset, ExportJob. Store schema version, BPM/time-signature/tempo-map, track order, asset identifiers, note events, sampler settings and effects. External MIDI device/file support is optional future work, not a required domain workflow. Undo/redo via reversible commands or patches with transaction grouping.

### 4.3 Audio engine

Use Web Audio graph, AudioWorklet for realtime DSP and scheduling-critical functions, WebAssembly for computationally expensive transforms. The UI must not schedule notes based on framework rerenders. Implement look-ahead scheduling with a monotonic audio clock, event queue, tempo-map mapping and bounded scheduling horizon; handle transport seek/loop/stop/edit mid-playback. Audio tracks and sample voices -> gain/pan -> device chain -> bus/returns -> master chain -> output. Include metering taps. Prevent clicks at clip boundaries with fades. Sample instruments need polyphonic voice management, pitch transposition, sample zones/looping and internal note-event scheduling. The engine must share processing semantics between live playback and offline render.

### 4.4 Media library and storage

- User directory handles where available, OPFS/IndexedDB fallback, imported snapshot semantics.
- IndexedDB for project index and metadata; OPFS for large binary media when supported. Implement quota monitoring and cleanup.
- Worker-based sample indexing, lazy decode, waveform peak cache, bounded LRU cache and audio format validation.
- Project archive `.pulsestudio` (ZIP with manifest, JSON, optional embedded assets) for portability; linked external assets may remain external if user chooses.
- Recovery of missing assets by filename, size, duration and SHA-256 hash; manual relink UI.
- Optional cloud storage adapter later; explicit opt-in only.

### 4.5 Optional services

Cloudflare Workers for small API endpoints, Firebase Auth/Firestore/Storage for opt-in sync, Stripe for optional licensing/subscriptions. Never expose secrets in GitHub Pages assets. Use authenticated server-side Stripe webhooks and server-side entitlement verification. Do not require billing for local-only baseline.

## 5. DESKTOP AND MOBILE UX

### Desktop

Header transport (BPM, time signature, play/stop/record, loop, metronome), left resizable sample browser, main arrangement with audio and sample-instrument tracks, bottom resizable contextual Device Chain/Mixer/Piano Roll/Clip Editor, optional right inspector, dedicated full-screen Sample Studio and Mastering Studio. Keyboard shortcuts, multi-select, drag/drop, zoom and scroll. External MIDI mapping is optional, not required for music creation.

### Mobile

No miniature desktop clone. Bottom navigation or tabs: Arrange, Samples, Record, Piano Roll, Mixer, Master. One main task at a time; bottom sheets for clip properties/effects; large touch targets (>=44px), two-finger timeline pinch zoom, long-press context menus, drag handles, horizontal scrolling, touch-safe trim handles and scrub. Portrait and landscape layouts; tablet intermediate layout. Support file picker and share sheet. Preserve editor selection when switching views. Handle interrupted recording, audio unlock and visibility changes.

## 6. FUNCTIONAL MODULES AND ACCEPTANCE CRITERIA

### Transport and timeline

- Play, pause, stop, seek, loop region, punch in/out, count-in, metronome, tap tempo, tempo changes and time signatures.
- Acceptance: scheduled notes/clips remain synchronized over long playback and loops within a measured tolerance; seek/stop does not leave hanging sources; BPM edits do not corrupt placement.

### Audio editing

- Nondestructive trims, split, merge/bounce, fades, crossfades, reverse, gain, time stretch, pitch shift, warping, transient detection, clip envelopes and take lanes.
- Acceptance: source media remains unchanged; rendered result agrees with preview; undo/redo returns exact prior state.

### Sample instruments and piano roll

- Internal note-event Piano Roll, pitch/velocity/duration editing, quantize, swing, scales/chords, sample-based Sampler, Drum Rack, ADSR, filters, polyphony and presets.
- Acceptance: note events produce deterministic sample audio at correct pitches/times; overlapping notes work; stop/seek releases voices; sampler presets and note patterns round-trip through save/load.
- Detect fundamental frequency only when confidence is sufficient; display note and confidence and permit manual root-key correction. Noise/percussion/chords without a stable fundamental must report no reliable pitch.
- Support sample start/end and pitched gate, one-shot and loop modes; transpose, fine tuning, velocity sensitivity, ADSR and on-screen note preview. Piano-roll note events contain pitch, beat, duration and velocity and never require MIDI devices/files.
- Piano-roll acceptance additionally includes note movement/resizing, multiple octaves, touch editing, zoom/scroll, copy/paste, undo/redo and a cursor synchronized with the shared arrangement transport.

### Drum Rack

- User-assigned sample pads with mouse/touch/keyboard triggering, per-pad level/pan/pitch, one-shot playback, simultaneous hits, editable sample references, kit persistence and a piano-roll or step-sequencer pattern.
- Acceptance: a recorded sample can be assigned to a pad and triggered immediately; two different pads produce their respective sample audio simultaneously and round-trip with the project.

### Beat grid and Arrangement

- Arrangement snap resolutions: 1 bar, 1/2 bar, quarter, eighth, sixteenth, thirty-second, sixty-fourth and off. Bar divisions and note divisions must be labeled distinctly.
- Grid, clip placement, piano-roll note timing and the transport must use the same tempo/time-signature model. Keep horizontal scrolling and zoom usable on touch screens.
- Acceptance: placement error is within the chosen grid step; snap-off preserves the requested beat; loop, seek and tempo changes do not desynchronize sample patterns.

### Mixer/effects

- Volume, pan, mute, solo, arm, meters, channel routing, sends/returns, groups, sidechain, reorderable effects, EQ, filters, compressor, gate, delay, reverb, saturation, chorus, distortion and automation.
- Acceptance: routing graph remains acyclic or safely detects feedback, all parameters persist, bypass is click-free, CPU usage measured.

### Recording

- Microphone/line input, track recording, Sample Studio, input monitoring, latency compensation, multiple takes, overdub, permission errors and interruption recovery.
- Acceptance: captured waveform can be edited and previewed before save; chosen folder write works only with explicit permission; unsupported browsers offer downloadable result.

### Mastering

- Dedicated view with validated metering, reference tracks, A/B, EQ, dynamics, imaging, exciter, limiter, loudness normalization, dithering and format export.
- Acceptance: measured LUFS/true peak within specified tolerance against reference fixtures, no unexpected clipping, export file metadata correct.

### Local persistence and export

- Keep project/note/instrument/effect metadata in a versioned project format and large sample bytes in IndexedDB/OPFS or user-selected folders, never localStorage. Preserve existing project migration behavior and clearly report missing samples.
- Provide a portable project archive as a later required batch; current JSON export is metadata-only and is not a portable project.
- WAV export is the first supported delivery target. Additional formats must use legally compatible browser codecs and pass decoded-output tests. Mastering options must affect the rendered final mix identically to live monitoring.

### GitHub Pages and device support

- Keep application assets relative and all core editing, recording, sampler playback, arrangement, effects and WAV export client-side; Flask is optional development serving only.
- Test mobile browser microphone permissions, audio-context unlock, file picker/share fallbacks, viewport scrolling, touch targets, interruption recovery and bounded memory on real devices before claiming full mobile parity.

## 7. DEVELOPMENT BATCHES (STRICT ORDER, EACH TESTED)

| Batch | Deliverable | Acceptance gate | Status |
|---|---|---|---|
| 000 | Static browser prototype: audio import, arrangement, recording, basic WAV render | Core opens without a backend | PARTIAL — browser prototype opens and renders WAV; broad integration remains untested |
| 001 | Sample Studio: non-destructive waveform selection, crop/split/delete, fades/gain/normalize/reverse, silence trim, preview, undo/redo and save/reuse | Editor operations and save/reuse tested; record permission tested in browser | PARTIAL — editor/model and generated-WAV browser smoke checks completed; microphone permission/capture remains unverified |
| 002 | Sample-based instruments, pitch detection, Piano Roll and Drum Rack sequencing | Notes/pads persist and produce sample audio | PARTIAL — sampler, internal note editor, 16-pad rack and shared step/piano pattern exist; unit tests pass, but full workflow acceptance remains incomplete |
| 003 | Professional mixing/effects architecture, arrangement clip editing, live/offline consistency | Reorderable tested device chains and equivalent live/offline signal measurements | COMPLETE — 45 local Node tests pass; generated-audio Chromium acceptance verified Sample Studio processing/save, Sampler and Drum Rack patterns, independent track effects, mixer mute/solo, non-silent WAV export, project reload, and mobile-emulated timeline seek/alignment. Physical-device checks, remote CI and quantitative live/offline parity tolerances remain release follow-ups, not claims of completion |
| 004 | Mastering Studio | Measurement-driven mastering chain, validated export and A/B | PARTIAL — shared live/offline master graph, six-band EQ/response graph, oversampled saturation, mid/side width, compressor-based peak control, built-in/custom presets, A/B mix render, RMS/sample-peak readouts, and 16-bit WAV export implemented and browser-tested. LUFS/LRA/true-peak, multiband dynamics, lookahead limiting, extended export formats, and full standards validation remain incomplete |
| 005 | Arrangement clip editing and undo history | Move/resize/split/duplicate/copy/paste/loop/fade/gain snap correctly in playback and export | PARTIAL — move, trim, split, duplicate, copy/paste, delete, loop, fades, gain, snap and clip-only undo/redo implemented; further UI/end-to-end playback and export coverage remains |
| 006 | Persistence and portable projects | Versioned save/reopen, sample relink and media archive round-trip | PARTIAL — project JSON metadata in localStorage/download and sample bytes in IndexedDB; JSON does not bundle assets |
| 007 | Mobile UX, accessibility and performance | End-to-end workflow on physical desktop and mobile browsers | PARTIAL — browser-emulated responsive smoke checks only; physical devices, long recordings and memory budgets unverified |
| 008 | GitHub Pages release verification | Static deployment smoke checks at repository subpath across target browsers | PARTIAL — the currently published URL loaded with its static assets; this verifies the deployed revision only, not these unpushed changes |
| 009 | Optional cloud sync, accounts and backups (opt-in) | Privacy/security review and user-controlled sync | OPTIONAL |

### Batch 003 implementation and test status

Batch 003 work added `src/sample-editor.js`: a frame-indexed non-destructive edit model over immutable decoded source audio, region split/delete/crop, reverse, gain in dB, peak normalization, fades, silence trimming, zero-crossing selection snap, undo/redo, waveform selection/zoom, A/B and loop previews, and rendering to a new buffer for save. Gain and normalization cover -60 to +120 dB; waveform metadata, duration/ruler labels, limits and gain controls refresh after edits. Microphone capture now draws a live waveform and input-level estimate, with an explicit stop-recording action. `src/sample-dsp.js` provides resampling/repitch and a waveform-similarity overlap-add time stretch; this is experimental DSP, with only synthetic sine behavior checked, not production-quality phase-vocoder processing. Sample effects render through the shared track graph into a new buffer before save. `src/waveform.js` caches frame peaks for waveform drawing. `src/timeline.js` supplies shared beat/time and ruler-coordinate conversions. `src/audio.js` builds a shared track graph for real-time playback and offline WAV rendering. Track chains support ordered/bypassable four-band peaking EQ with low/high-cut filters, compression with makeup and gain-reduction readings, tempo-synced delay, pre-delay reverb, waveshaper saturation, compressor-assisted sample-peak limiting, and Utility gain/pan/stereo width/polarity. EQ frequencies are bounded by the active context's Nyquist frequency; the response curve includes the cut filters. Effect chains can be saved/loaded as local presets and project metadata retains parameters/order. The mixer includes track volume/pan/mute/solo, live stereo track peaks and clipping warnings, plus a master fader. Arrangement clips can be moved between tracks, trimmed, split, duplicated, copied/pasted, deleted, looped, faded, gain-adjusted and snapped; clip edits have bounded undo/redo history. Real-time and offline clip scheduling share duration/fade helpers, including looped clips. The playhead now uses measured ruler origin and shared timeline scaling rather than a fixed mobile header offset.

Batch 003 is **complete for the scoped release acceptance**. The limiter combines dynamics compression and a sample-peak waveshaper ceiling (not a true-peak limiter); there is no master limiter, persistent clip history, automation or send/return routing. Track names/colors are present but do not have editing controls. The effect preset store is local to the browser. Aggressive EQ or gain can exceed full scale when limiting is bypassed. Offline Chromium checks verify observable EQ cut, compressor attenuation, delay tail, effect-order dependence, tempo-sync timing, Utility width/polarity, track volume/pan/mute/solo/master-volume routing, clip loop/fade output, and WAV decode/PCM. UI checks verify effect-preset save/load, clip split/undo/redo, and effect/mixer/clip metadata after project reload. The synthetic end-to-end workflow also verified processed sample save/reuse, sampler and drum patterns, independent track chains, mute/solo, mix export and project reload. These checks do not establish exhaustive golden-signal coverage or quantified real-time/offline parity. A synthetic boosted-sine export measured a 0.885 sample peak after limiting versus 3.096 without it; that single fixture is not a universal ceiling guarantee.

Node.js 24.20.0 is installed locally and `npm test` passes **45/45** tests. `.github/workflows/test.yml` is configured for Node.js 22 on pushes to `main` and pull requests; its remote run remains pending because this branch has not been pushed. The browser acceptance used a generated 440 Hz WAV and a synthetic Web Audio/MediaRecorder microphone stream (not physical microphone hardware). A processed sample was decoded as stereo 48 kHz PCM, approximately 0.682 seconds long, with nonzero unclipped signal. The complete synthetic instrument-to-arrangement-to-export-to-project-reload flow was exercised; the final stereo WAV was 34.25 seconds at 48 kHz with peak 0.928 and RMS 0.116. EQ enabled/bypassed outputs differed, and mute/solo export behavior was compared. At 360, 390, 430, 768 and 1280 CSS pixels, page-level horizontal overflow was absent and a 2-second ruler seek remained aligned after horizontal scrolling. At 100 BPM and 125% zoom, a four-beat seek measured 2.4 seconds. Browser-emulated interaction is not physical touch-device validation. Real microphone hardware, physical devices, long-recording performance and remote CI remain unverified. The deployed GitHub Pages revision was previously smoke-checked, but these unpushed changes have not been deployed.

### Batch 004 — Mastering Studio (in progress)

Implemented vertical slice: `src/mastering.js` builds a reusable Web Audio master graph used by real-time playback, offline rendering, preview and WAV export. It has six parametric EQ filters (low/high shelves and bell bands), high/low cut, response calculation and draggable graph points; 4× waveshaper saturation; mid/side width (width zero folds to mono); Web Audio compressor-based peak control; output gain; built-in and local custom parameter presets; and before/after offline rendering with RMS dBFS and sample-peak analysis. Project mastering parameters persist in the existing project JSON. The basic and advanced views edit the same saved graph configuration.

Not complete: loudness is not LUFS, peak readout is not true peak, and there is no LRA, standards-compliant gating, multiband dynamics, lookahead/true-peak limiter, loudness normalization, frequency-selective exciter, spectrum analyzer, level-matched A/B, 24-bit/float WAV, selectable sample rate, dither, or MP3 encoder. Peak control is explicitly a dynamics-compressor stage and does not guarantee a ceiling; inspect the exported sample peak. The export path currently supports stereo WAV at the renderer's output sample rate and 16-bit PCM only. No mastering quality or broadcast/streaming compliance is claimed.

The vertical slice has deterministic unit tests for EQ response, graph configuration, settings normalization, preset parameters, RMS/sample-peak analysis and project persistence. Chromium checks exercised an existing multitrack render, preset processing, before/after RMS/peak changes, WAV decode, project reload, and five responsive viewport sizes. Before treating Batch 004 as complete, add accurate BS.1770/EBU R128 loudness/true-peak analysis tests, multiband dynamics, a verified peak-safe limiter, extended export, audio golden fixtures, and broader mobile/device validation.

### Next batch instructions

1. Keep Node-based model/DSP tests running in CI; confirm the configured GitHub Actions workflow after a user-approved push and retain browser signal/UI checks as integration coverage.
2. Before release, test real microphone permissions/capture and touch behavior on physical iOS and Android devices, and measure performance with long recordings and larger projects.
3. Preserve vanilla static deployment until an independently tested architecture migration is justified; GitHub Pages must continue working without a backend.
4. Verify at 360, 390, 430, 768 and desktop viewports; test physical devices separately before claiming mobile compatibility.
5. Implement Batch 004 only after its measurement, export and preset requirements can be tested without overstating mastering quality.

### Agent continuation prompt (copy/paste)

> Read `IDEA.md`, `README.md` and the current source. Work on the first incomplete product batch in the roadmap, preserving static GitHub Pages deployment and the local-first, sample-driven workflow. Do not require external MIDI hardware/files. Implement real audio behavior, add/update tests, run available tests, verify desktop/mobile viewports, report actual measurements and remaining limitations, and update status only when the acceptance criteria pass. Do not claim unverified features. Ask before irreversible external actions or paid-service setup.

## 8. TEST PLAN

- Unit: project schema, tempo conversion, clip math, PCM/WAV encoding, sample trim/fade, gain, resampling, export settings, permissions adapter.
- Integration: AudioWorklet graph, internal note-event scheduling, storage roundtrip, project migration, asset relink, recording take lifecycle, mastering chain bypass.
- Browser: Chrome/Edge, Firefox, Safari (supported behavior), iOS Safari, Android Chrome. Test offline, reload, backgrounding, permission denial, low storage, large sample library, empty project, sample missing, decode errors.
- Audio golden fixtures: silence, sine wave, impulses, stereo correlation, clipping, dynamic range, latency drift, loop boundary clicks, sample-rate conversion and loudness reference files.
- Performance targets (initial engineering budgets, not promises): interactive startup under 3 s on typical desktop and 5 s on midrange phone on warm cache; smooth timeline pan/zoom near 60 fps; bounded cache; no audible dropouts for realistic 8-track mobile and 32-track desktop reference projects; log actual test hardware and limits.
- Accessibility: keyboard, screen reader labels, contrast, focus, reduced motion, 44px touch targets.
- Security: CSP, dependency audit, no secrets in client, no silent upload of user files, explicit permissions and data deletion.

## 9. PROJECT FORMAT TARGET (ILLUSTRATIVE)

```json
{
  "schemaVersion": 2,
  "id": "project-uuid",
  "name": "Example",
  "sampleRate": 48000,
  "tempoMap": [{"beat": 0, "bpm": 128, "timeSignature": [4, 4]}],
  "tracks": [
    {"id": "track-uuid", "type": "audio", "name": "Kick", "clips": [
      {"id": "clip-uuid", "assetId": "sha256-or-uuid", "startBeat": 0, "durationBeats": 4,
       "sourceOffsetSeconds": 0, "gainDb": 0, "fadeInSeconds": 0.005, "fadeOutSeconds": 0.005}
    ], "devices": [], "automation": [], "routing": {"output": "master"}}
  ],
  "assets": [{"id": "sha256-or-uuid", "filename": "My_Kick.wav", "storage": "linked-or-embedded"}],
  "master": {"devices": []}
}
```

Do not replace the current v0.1 JSON schema with this without an explicit migration.

## 10. UI STYLE

Premium dark production aesthetic, neutral charcoal surfaces, subdued track colors, mint/turquoise active controls, high-contrast waveform displays, crisp typography, minimal chrome, compact but accessible controls. Original brand, iconography and interaction design; **do not copy Ableton or iZotope proprietary assets, logos, preset libraries or visual trade dress**. Device panels are docked below arrangement. No Session View. Mastering is its own tab. Recording is prominently accessible everywhere.

## 11. RELEASE, PRIVACY AND COST

- Core static site can be hosted on GitHub Pages at zero hosting cost within platform limits. Larger samples must stay user-side by default; do not store user libraries in the repository.
- GitHub Pages is public hosting; never commit private sample libraries, recordings, tokens, `.env` secrets or personal projects.
- Offline/PWA caching must exclude sensitive audio unless explicitly chosen and documented.
- Browser storage is not guaranteed permanent. Warn about quota and eviction; encourage portable backups.
- Cloud accounts, Firebase, Cloudflare, Stripe, collaboration and paid tiers are optional follow-on features. They may incur usage charges.
- Validate licensing of MP3/FLAC/WASM components and third-party DSP packages before distribution.

## 12. VERIFIED IMPLEMENTATION SNAPSHOT — Batch 002 (browser smoke checks)

The app remains a no-build vanilla JavaScript static site. The sampler has imported sample assignment, automatic pitch estimation with confidence, manual root-note adjustment, gated/one-shot/loop modes, sample range, ADSR, transpose/fine tune, and an expanded five-octave, 16-bar piano roll. The editor includes note creation, selection, pointer move/resize, copy/paste/duplicate, quantize, undo/redo, velocity, time/key zoom, snap through 1/64 and snap-off, and sample preview keys. Sampler and Drum Rack instruments share the piano-roll editor.

The 16-pad Drum Rack has sample assignment, pad preview, keyboard triggering, per-pad volume/pitch/pan/mute, a selectable 16/32/64-step one-bar sequencer, and a pattern-duplicate action. Sequencer and piano-roll events use the same pattern data. Sampler and Drum Rack patterns are included in offline WAV rendering; the Drum Rack pattern length is inferred from its note events up to 16 bars. Track filter resonance and delay are applied by live and offline paths.

Browser checks on a local HTTP server verified: the main app and modules load; a Drum Rack renders all 16 pads; its piano-roll view renders without sampler-only controls; an edited piano note persists to the project and appears as an active step; a generated A4 WAV imports, is assigned to a pad, and offline WAV export completes; a sampler can be created from that sample, a piano note can be added, and pitch detection reports an A4 estimate; and the Drum Rack layout at 390px viewport width has no page-level horizontal overflow (the sequencer itself is intentionally horizontally scrollable). These are smoke checks, not audio-quality certification or device-level mobile tests.

At the time this Batch 002 snapshot was recorded, Node/npm were unavailable and its tests had not run. The current Batch 003 release-candidate status above records the later local Node.js 24.20.0 run: 36 tests passed; the configured remote Node.js 22 workflow is still pending.

Still incomplete: precise recorder waveform editing/zoom/split and non-destructive edit history; pitch detection validation over diverse real samples; sampler voice stealing and release behavior under all stop/seek conditions; broad effect chain/reverb/distortion/meters; timeline clip trim/split/duplicate; complete time-signature-aware transport; portable project archives/media relinking; validated LUFS/true-peak mastering; MP3 export; and physical-device mobile verification. A JSON project export does not bundle media. Whole-buffer decoding and simplified scheduling remain resource limits. The mastering bus is **not** a verified limiter or loudness-normalization engine. The folder adapter does not persist handles across sessions.

Update this checklist only after relevant test evidence is recorded. A feature existing in UI is not evidence that its audio behavior is complete.

## 13. NEXT IMMEDIATE ACTION

Run the full browser acceptance workflow against the local candidate: save and reopen the processed sample, verify Sampler and Drum Rack/Piano Roll patterns, arrange and mix clips, export/decode a multi-track WAV, and reopen project metadata/assets. Then confirm the GitHub Actions run after a user-approved push. Keep microphone and physical-device results explicitly pending where those environments are unavailable; do not mark unverified workflow steps complete.
