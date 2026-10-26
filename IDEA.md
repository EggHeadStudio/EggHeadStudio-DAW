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

EggHeadStudio DAW is a local-first DAW that runs as a static website, including on smartphones. Its primary workspace is an **Arrangement View**. There is **NO Session View**. The bottom panel of Arrangement contains a contextual **Mixer & Effects / Device Chain** just as in a traditional arrangement-centric DAW. Dedicated **Sample Studio** enables recording, editing, previewing, and saving a newly created sample BEFORE it enters the library. Dedicated **Mastering Studio** supports sophisticated final-stage processing, analysis, A/B comparison and multiple export formats. The user can produce an entire song from start to finish on a phone without needing a desktop application, subject to browser/platform audio and filesystem limits.

### Non-negotiable requirements

1. Publish static front-end on GitHub Pages (relative asset paths, client-side routing compatible with subpaths, no required backend).
2. Local-first; no cloud account, paid service, or server required for core editing, recording, playback, mixing, mastering and WAV export.
3. User-selected sample folder should be immediately browsable and usable without manually importing each sample. Preserve folder hierarchy, search, previews, favorites, indexing and drag/drop. On browsers that allow it, write finished samples back to that authorized folder. Offer fallback import/download/share where unsupported.
4. **Record Own** workflow: microphone or supported input -> capture -> nondestructive edit -> repeated audition -> choose name/format/location -> save -> immediately available in library and arrangement.
5. Responsive desktop and touch-first mobile workflows with identical project/audio engine and functional parity for essential creation tasks.
6. Multi-track arrangement with audio clips, MIDI clips, automation lanes, bus/return tracks, effects chains, recording, instruments, sampler, sequencer, mixing and project persistence.
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

- Add unlimited logical audio/MIDI tracks, subject to performance budget.
- Drag/tap a sample to insert it at playhead, timeline location, or instrument pad.
- Edit clip position, trim, split, slip, duplicate, fade, crossfade, reverse, stretch, pitch, gain and warp markers where implemented.
- Snap to beat/grid, zoom horizontally/vertically, select multiple clips, group, rename, color and undo.
- Create MIDI clip; open Piano Roll; edit notes, velocities, lengths, quantization, scales, chords and instrument routing.
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

Separate serializable `ProjectDocument` from runtime state (AudioNode references, File handles, decoded buffers). Use schema validation (e.g., Zod), migrations and deterministic stable IDs. Entities: Project, Track, AudioClip, MidiClip, ClipSource, Asset, Note, AutomationLane, AutomationPoint, Device, Parameter, Bus, Send, Return, MasterChain, Marker, LoopRegion, Take, Preset, ExportJob. Store project schema version, BPM/time-signature/tempo-map, track order, asset content hashes and relative identifiers. Undo/redo via reversible commands or patches with transaction grouping.

### 4.3 Audio engine

Use Web Audio graph, AudioWorklet for realtime DSP and scheduling-critical functions, WebAssembly for computationally expensive transforms. The UI must not schedule notes based on React rerenders. Implement look-ahead scheduling with a monotonic audio clock, event queue, tempo-map mapping and bounded scheduling horizon; handle transport seek/loop/stop/edit mid-playback. Audio tracks -> gain/pan -> device chain -> bus/returns -> master chain -> output. Include metering taps. Prevent clicks at clip boundaries with fades. Instrument engines must have voice management and sample-accurate MIDI scheduling where possible.

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

Header transport (BPM, time signature, play/stop/record, loop, metronome), left resizable sample browser, main arrangement with tracks and automation, bottom resizable contextual Device Chain/Mixer/Piano Roll/Clip Editor, right inspector optional, dedicated full-screen Sample Studio and Mastering Studio. Keyboard shortcuts, multi-select, drag/drop, zoom, scroll, MIDI mapping.

### Mobile

No miniature desktop clone. Bottom navigation or tabs: Arrange, Samples, Record, Piano Roll, Mixer, Master. One main task at a time; bottom sheets for clip properties/effects; large touch targets (>=44px), two-finger timeline pinch zoom, long-press context menus, drag handles, horizontal scrolling, touch-safe trim handles and scrub. Portrait and landscape layouts; tablet intermediate layout. Support file picker and share sheet. Preserve editor selection when switching views. Handle interrupted recording, audio unlock and visibility changes.

## 6. FUNCTIONAL MODULES AND ACCEPTANCE CRITERIA

### Transport and timeline

- Play, pause, stop, seek, loop region, punch in/out, count-in, metronome, tap tempo, tempo changes and time signatures.
- Acceptance: scheduled notes/clips remain synchronized over long playback and loops within a measured tolerance; seek/stop does not leave hanging sources; BPM edits do not corrupt placement.

### Audio editing

- Nondestructive trims, split, merge/bounce, fades, crossfades, reverse, gain, time stretch, pitch shift, warping, transient detection, clip envelopes and take lanes.
- Acceptance: source media remains unchanged; rendered result agrees with preview; undo/redo returns exact prior state.

### MIDI and instruments

- Piano Roll, note/velocity editing, quantize, swing, scales, chords, MIDI input/output, Drum Rack, multisample Sampler, subtractive synth, ADSR, filters, polyphony, presets.
- Acceptance: MIDI notes produce deterministic audio at correct times, no stuck notes after stop/seek, presets round-trip through save/load.

### Mixer/effects

- Volume, pan, mute, solo, arm, meters, channel routing, sends/returns, groups, sidechain, reorderable effects, EQ, filters, compressor, gate, delay, reverb, saturation, chorus, distortion and automation.
- Acceptance: routing graph remains acyclic or safely detects feedback, all parameters persist, bypass is click-free, CPU usage measured.

### Recording

- Microphone/line input, track recording, Sample Studio, input monitoring, latency compensation, multiple takes, overdub, permission errors and interruption recovery.
- Acceptance: captured waveform can be edited and previewed before save; chosen folder write works only with explicit permission; unsupported browsers offer downloadable result.

### Mastering

- Dedicated view with validated metering, reference tracks, A/B, EQ, dynamics, imaging, exciter, limiter, loudness normalization, dithering and format export.
- Acceptance: measured LUFS/true peak within specified tolerance against reference fixtures, no unexpected clipping, export file metadata correct.

## 7. DEVELOPMENT BATCHES (STRICT ORDER, EACH TESTED)

| Batch | Deliverable | Acceptance gate | Status |
|---|---|---|---|
| 000 | Baseline static prototype, core sample workflow | Opens locally, core functions present | IMPLEMENTED — NOT FULLY VERIFIED IN BROWSER |
| 001 | Architecture audit, tests, TS/React/Vite migration, GitHub Pages CI | Existing features retained, smoke tests pass | TODO |
| 002 | Versioned project model, commands, undo/redo, IndexedDB/OPFS | Reload, migrations, undo tests | TODO |
| 003 | Accurate transport/scheduler, loop/seek, metronome | Timing and regression tests | TODO |
| 004 | Folder adapter, indexing worker, lazy audio decode, relinking | Desktop folder + mobile fallback tests | TODO |
| 005 | Professional arrangement editing, touch gestures, waveform cache | Drag/touch, snap, fades, split tests | TODO |
| 006 | Advanced Sample Studio capture/edit/save/recovery | Record→preview→save on phone/desktop | TODO |
| 007 | Audio track recording, take lanes, monitoring, calibration | Device permission/interruption tests | TODO |
| 008 | Piano Roll, MIDI domain, quantize and velocity | Notes save/play reliably | TODO |
| 009 | Drum Rack, Sampler, synth, MIDI input mapping | Polyphony, note-off, preset tests | TODO |
| 010 | Mixer, buses, sends/returns, device rack and effects | Routing and DSP tests | TODO |
| 011 | Automation lanes, parameter binding, curves | Automation audio/visual agreement | TODO |
| 012 | Mastering view v1: EQ, dynamics, true peak limiting, LUFS | Reference measurement tests | TODO |
| 013 | Mastering v2: multiband, imaging, reference A/B, diagnostics | DSP quality and stability tests | TODO |
| 014 | Offline export WAV/MP3/FLAC (where supported), project archive | File decode and quality tests | TODO |
| 015 | Mobile UX and performance optimization | Real Android/iPhone end-to-end song creation | TODO |
| 016 | PWA, offline recovery, accessibility, translations | Offline and accessibility tests | TODO |
| 017 | Optional cloud sync, accounts, backups (opt-in) | Privacy/security tests | OPTIONAL |
| 018 | Optional Stripe billing and entitlements | Secure webhook and access tests | OPTIONAL |
| 019 | Release candidate, QA, docs, GitHub Pages launch | Complete regression and device matrix | TODO |

### Batch 001 exact instructions

1. Inventory prototype behavior and log known issues. Write testable specifications for current features.
2. Create TypeScript domain models and isolated audio service adapters.
3. Migrate the static site to Vite + React while keeping all URLs and GitHub Pages publishing working; use relative base `./` or correct repository base.
4. Split into `features/arrangement`, `features/sample-studio`, `features/mastering`, `audio`, `storage`, `domain`, `ui`.
5. Add Vitest unit tests and Playwright browser tests for import, clip insert, transport, project save, record permission denial, sample trim and WAV render.
6. Add GitHub Actions build/test/deploy pipeline (deploy only on main with required Pages permissions).
7. Verify on Chromium and Firefox desktop, mobile emulation; record actual-device gaps separately.
8. Update this document status only after checks pass; create `BATCH_001_REPORT.md` with files changed, tests, screenshots, remaining issues.

### Agent continuation prompt (copy/paste)

> Read `IDEA.md`, `README.md`, the current source code and latest `BATCH_*_REPORT.md`. Determine the first incomplete batch from the roadmap. Implement ONLY that batch end-to-end, preserving static GitHub Pages deployment and the local-first design. Write/update automated tests, run them, verify desktop and mobile viewport behavior, report measured results and remaining limitations, and update the batch status in IDEA.md only when acceptance criteria are met. Do not claim features or tests passed unless actually verified. Ask before any irreversible external actions, deployments or paid-service setup.

## 8. TEST PLAN

- Unit: project schema, tempo conversion, clip math, PCM/WAV encoding, sample trim/fade, gain, resampling, export settings, permissions adapter.
- Integration: AudioWorklet graph, MIDI scheduling, storage roundtrip, project migration, asset relink, recording take lifecycle, mastering chain bypass.
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

## 12. KNOWN LIMITATIONS OF CURRENT PROTOTYPE v0.1

The starter currently uses vanilla JS, not the target React stack. It can import and decode audio, play clips, provide track-level gain/pan, record and edit short samples, preview before save, cache assets in IndexedDB, store project metadata and offline-render WAV with a basic master bus. It does **not** yet meet full DAW, advanced mastering or complete touch/mobile requirements. A JSON project export does not bundle media. Whole-buffer decoding, simplified scheduling and coarse sample editing are intentional starter limitations. The current mastering bus is **not** a verified limiter or loudness-normalization engine. The folder adapter does not persist handles across sessions yet. Treat all remaining items as engineering work, not existing functionality.

## 13. NEXT IMMEDIATE ACTION

Complete Batch 001 after verifying the prototype. Then continue strictly in order, with acceptance reports and real-device testing. Prioritize correct audio scheduling, sample recording/editing and storage portability over decorative UI work. Keep the application deployable to GitHub Pages after every batch.
