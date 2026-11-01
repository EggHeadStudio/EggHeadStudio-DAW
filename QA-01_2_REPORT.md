# QA-01.2: import, live timeline geometry, graphical devices and factory audio

Date: 2026-11-01

**QA-01.2 INCOMPLETE — SPECIFIC REQUIREMENTS REMAIN**

The requested implementation changes are present, and substantial connected
Chromium acceptance now passes. This is not physical iPhone defect closure.
The remaining fresh musical-touch, cross-browser and installed-app checks are
listed below; earlier batch results have not been relabelled as new tests.
No commit, push or deployment was performed.

## Implementation and defects closed

- File import decodes without awaiting live AudioContext activation after a
  picker. Each successful write immediately refreshes the list, retains its
  filter and reuses matching imports. Concurrent imports and failures report
  explicit messages. Unreferenced stored User samples restore as lazy metadata;
  project references decode for playback. Factory identity/root metadata survives
  restoration. No stored audio is deleted by this change.
- Arrangement pinch updates real pixels-per-beat, ruler, clips, grid, loop,
  insertion and playhead geometry. It no longer stretches text with `scaleX`.
  The midpoint remains anchored subject to integer scroll-pixel rounding;
  cancellation restores the original zoom and scroll. Arrangement uses its
  normal mobile layout and authoritative transport, not a redundant Focus bar.
- Devices have a horizontal 320px-high compact composition. Ordinary cards are
  360px wide, Compressor 700px, and EQ 760px. EQ keeps its primary response/FFT
  plot, selected-band controls, draggable nodes, filters and full expanded
  editor. ResizeObserver also observes the actual plot. No transform scaling,
  replacement DSP or duplicate parameter model was introduced.
- The same shell supports track, sample/instrument and mastering devices.
  Mastering retains its actual module order and fixed Output -> Limiter ending.
  Complex sidechain/multiband editing remains available in the expanded editor;
  meaningful compact graphics and real reduction metering remain present.
- The shared Device Panel separator accepts touch, pointer and keyboard input,
  using one bounded height setting. Interactive musical surfaces receive scoped
  callout/selection protection; ordinary text and fields remain selectable.
- The footer reads loaded HTML build metadata, not a manually maintained version
  or the newest network version. Hosted unversioned source is not incorrectly
  labelled Local source; this distinction has a regression assertion.
  PWA approval now completes correctly when new
  HTML was already loaded while the old worker was active: confirmation of the
  matching active worker clears switching timers and shows Updated/Dismiss
  without an unnecessary reload. Different-version approval still safely reloads.
  All-client blockers and user-storage protection remain in place.
- Nine original deterministic factory WAVs load lazily, are bundled in versioned
  shell caches, and are embedded only when referenced by a portable `.EHS`.
  Empty Sampler/Drum Rack creation remains supported with contextual guidance.
- A connected recording/orientation test exposed a detached-dialog
  `showModal()` InvalidStateError. Disconnected Focus surfaces now remove their
  orientation listener instead of reopening detached DOM.
- A geometric test exposed Compressor controls extending **94px below** their
  card, despite no scrollbar. Six horizontal parameter columns and appropriate
  width fixed the composition. Final content ends **26px inside** the card.
  The browser fixture now checks actual body/card bounds, not just card height.

## Requirement acceptance

Statuses describe the stated evidence, not certification of every platform.
**Implemented** means source implementation exists without complete fresh
browser acceptance. **Browser verified** means the specific Chromium interaction
or measurement below passed. **Node verified only** is not live/browser acceptance.
**Blocked** identifies unavailable platform input. Nothing requested was
intentionally removed; incomplete test coverage is explicit.

| Phase / requirement | Status | Evidence and limits |
|---|---|---|
| 1: immediate file-input import without workspace switch/recording | Browser verified | Actual source/built file inputs; per-file refresh |
| 1: repeat import, no duplicate rows, filter retention | Browser verified | Repeated same-file import and active search |
| 1: reload/library persistence, existing references | Browser verified | Reload and clean-origin connected project restoration |
| 1: immediate Preview/Add | Browser verified | Imported and factory audio used through UI |
| 1: Remove and no accidental deletion | Implemented | Non-destructive existing action preserved; QA-01.1 reference/removal test was not repeated |
| 1: concurrent/failing import handling | Implemented | Explicit notifications/logging; fresh picker quota/decode-failure matrix not run |
| 2: continuous real scale/ruler/clip/grid/marker updates | Browser verified | Source and built CDP pinch; normal-size labels, no ruler transform |
| 2: midpoint and nonzero scroll alignment | Browser verified | Approximately 0.5 CSS-pixel rounding error; numerical dimensions below |
| 2: one final zoom commit and rollback | Browser verified | Cancel restores scale and scroll; existing gesture tests preserved |
| 2: RAF update, no full-app rerender during pinch | Implemented | Existing live geometry callback; physical performance not measured |
| 2: live Zoom indicator | Browser verified | Gesture indicator with real layout updates |
| 2: no accidental edit/page zoom; accessibility outside timeline | Implemented | Scoped interaction policy; native accessibility/device behavior remains open |
| 3: compact Play/Stop/Return/position/BPM/Loop transport | Browser verified | Normal mobile Arrangement; no duplicate state |
| 3: remove redundant Focus bar/blank region/shift | Browser verified | Normal presentation used instead of Arrangement Focus |
| 3: portrait/landscape and playback preservation | Browser verified | Representative presentation checks; recording orientation also measured |
| 3: Back/navigation | Browser verified | Existing mobile navigation and editor Done actions |
| 4: scoped selection/callout/drag protection | Implemented | Musical surfaces only; fields/descriptions not globally disabled |
| 4: fresh touch note-edit/long-press/multi-pointer cancel sweep | Implemented | Not completed for every musical surface in this continuation |
| 4: actual iOS magnification/callout and accessibility zoom | Blocked | Requires physical Safari/PWA user retest |
| 5: common height, horizontal groups, no ordinary vertical scroll | Browser verified | Few/many-parameter content bounds below, not a height-only proxy |
| 5: correct rotary/linear controls, labels/numeric values | Browser verified | Shared controls; pan remains linear; expanded numeric editing retained |
| 5: bypass/fold/reorder/remove | Browser verified | Delay bypass/fold; order swap/restoration; Saturation removal |
| 5: wider EQ with response graph and actual FFT | Browser verified | Native DSP response tests, measured live spectrum and resized graph |
| 5: all supported band/cut selection and dragging | Browser verified | All six track nodes and eight master nodes at 390 and 1280 widths |
| 5: Frequency/Gain/Q, filter enable/bypass and synchronization | Browser verified | Representative numeric/filter controls, native-response tests; no DSP downgrade |
| 5: compact/expanded desktop/mobile layout | Browser verified | Seven-size graph interactions, no page/editor overflow within measured scope |
| 5: shared Sample/instrument effects layout | Browser verified | Sample EQ, Sampler/Drum workflows use authoritative shared controls |
| 5: horizontal Mastering composition/order | Browser verified | Six modules; full Focus editor retained; Output -> Limiter unchanged |
| 5: no duplicate graphs/parameter state or scaling | Implemented | Existing DOM is moved into expanded editing; shared DSP retained |
| 6: touch separator, cancel, limits and keyboard | Browser verified | Touch 320 -> 380 -> 320 on cancel; pointer/keyboard checks below |
| 6: no native selection or recording/playback interruption | Implemented | Scoped handle policy; physical simultaneous-recording resize not tested |
| 7: loaded build, short/full identity, source/local distinction | Browser verified | Source/unversioned and actual built metadata/footer |
| 7: checking/available/switching/updated/failure lifecycle | Browser verified | Actual waiting/approval cycles and same-loaded-version completion |
| 7: delayed confirmation/retry timeout | Node verified only | Bounded recovery regression; not a deliberately stalled real-worker test |
| 7: all-client blockers and storage preservation | Node verified only | Existing PWA suite preserved; actual local update cycles retain project/audio |
| 8: nine original WAVs, roots, peak/DC/endpoints/size | Node verified only | Exact generated-byte and PCM tests; provenance below |
| 8: immediate Factory/User distinction and lazy loading | Browser verified | Library/onboarding and reloaded portable Factory metadata |
| 8: deduplicated loads/retry, no needless startup PCM copies | Node verified only | Lazy/dedup/retry and stored-metadata regressions |
| 8: real factory playback | Browser verified | Kick/Snare Drum, Soft Saw Sampler, offline Sub Bass; not all nine auditioned live |
| 8: static/offline/update availability | Browser verified | Versioned shell includes all nine; offline Sub Bass UI insertion/playback |
| 8: referenced-only portable embedding | Browser verified | Actual Save .EHS and clean-origin import; stable instrument assignments |
| 9: empty instrument creation, choose/preview/assign | Browser verified | Actual empty Sampler/Rack UI, no silent auto-assignment |
| 9: pattern, note/step editing and playback | Browser verified | Factory C4 note and two-pad step pattern |
| 9: existing models/no redundant setup state | Implemented | Existing instrument and pattern models retained |
| 10: Arrangement/Mixer/Sample Browser | Browser verified | Targeted gestures/import/selection; not a new exhaustive gesture matrix |
| 10: Sample edit/preview/effect/A-B/save/cancel/integrity | Browser verified | Connected measured selection/save and unchanged original hash |
| 10: recording, saved take, preview/recovery/orientation | Browser verified | Synthetic microphone, frame/RMS measurements, detached-dialog fix |
| 10: Sampler/Drum live output and release | Browser verified | Real-time native analyser measurements below; previous 32-pad acceptance retained |
| 10: fresh replacement/removal/cancellation musical lifecycle matrix | Implemented | Prior 5F lifecycle fixes retained; full fresh UI matrix not completed |
| 10: Master EQ/FFT/limiter/render | Browser verified | Advancing clock, measured FFT, actual render/peak analysis |
| 10: WAV/MP3 progress/cancel/retry/download | Browser verified | Non-silent decoded results; WAV re-download |
| 10: full artwork/metadata/release-package regression | Implemented | Existing behavior preserved, not freshly exercised end-to-end |
| 10: connected .EHS v1 and IndexedDB integrity | Browser verified | Actual archive restored on clean origins; six identities, instruments/takes/settings |
| 10: sidechain/deterministic DSP/Undo/Redo regression | Node verified only | Full existing numerical suite unchanged; selected browser gestures also passed |
| 11: full Node, syntax, diff hygiene, two builds | Node verified only | Tool validation results below; not browser/physical acceptance |
| 11: source and built UI acceptance | Browser verified | Scope separated below; no page-load-only acceptance |
| 11: seven-size functional checks | Browser verified | EQ interaction matrix; other workflows not exhaustive at every size |
| 11: mobile Chromium touch | Browser verified | Arrangement pinch and panel resizing use CDP touch; not physical input |
| 11: real audio, factory, portable project, worker cycles | Browser verified | Connected measurements and real local workers |
| 11: dedicated Edge and WebKit/Safari | Blocked | Available browser harness was Chromium; these engines were not exercised |
| 11: physical iPhone/Android and OS-installed PWA | Blocked | User-led/device acceptance remains separate |

## Browser scope and measured results

Local disposable source origins and a deterministic built origin were used.
Project creation, assignments, file import and portable import were driven by
UI controls, not injected project state. Native analyser observations and a
synthetic microphone were test instrumentation, not a replacement audio engine.
CDP touch is emulated browser input, not physical touch or trusted-phone acceptance.

### Graphical EQ interaction matrix

At each size, built track EQ compact dragging/expanded editing and source master
EQ dragging/expanded editing passed. Enable/numeric controls, transport access,
and page/editor overflow were checked. These are actual EQ interactions, not
claims of a complete Arrangement gesture or production suite at every size.

| Viewport | Built expanded track plot (CSS pixels) | Interaction scope |
|---|---|---|
| 320x740 | 256x310.8 | EQ drag, expand, controls, return |
| 360x800 | 296x336 | Same |
| 390x844 | 326x354.47 | Same, plus connected workflows and representative touch gestures |
| 430x932 | 366x391.44 | EQ drag, expand, controls, return |
| 768x1024 | 714x420 | Same |
| 1280x900 | 1216x378 | Same, plus desktop panel/rack checks |
| 844x390 | 780x220 | EQ drag/expanded controls and landscape presentation |

The source master plot is 12px narrower because of its existing studio padding.
The final build additionally passed all-node expanded sweeps at 390/1280:
four track bands plus Low/High Cut, and six master bands plus Low/High Cut.
Every drag changed the synchronized frequency control. Example: track Band 2
302 -> 321Hz at desktop; master Band 3 913 -> 1229Hz on phone. Cut filters
remained selectable/draggable and their inapplicable gain controls stayed disabled.

Final desktop selected-band numeric checks synchronized Q 1 -> 1.1 with the
native-response redraw on track and master. Track Gain 24 -> 23.8dB and master
8.7 -> 8.9dB likewise synchronized range/numeric values and changed the curve;
original values were restored. A first automation attempt requested 24.2dB
beyond the track's 24dB maximum: correct clamping produced no change, so the
test was corrected to use an in-range value rather than weakening assertions.
Hidden desktop-navigation and wrong footer-selector automation timeouts were
also corrected; these were not accepted as successful workflow results.

Final compact content bounds at 390 and 1280:
EQ ends 7px inside its card; Compressor 26px; Reverb 92px; Saturation 92px;
Limiter 92px; Utility 41px; Delay 27px/32px respectively. All cards are 320px
high with no body scrollbar. Master EQ/Saturation/Utility/Multiband/Output/Limiter
end 7/62/62/12/119/94px inside their cards. Folded and expanded editors intentionally
use different heights. Multiband's full control set remains expanded, not hidden.
Final source reload reproduced the 390/1280 Compressor fit and all six master
body bounds; its footer correctly read Local source (unversioned).

### Timeline and panel

- Built 1.5x pinch at nonzero scroll: scroll 300 -> 498; clip width
  1560 -> 2340; ruler 2496 -> 3744. Font remains 11px and ruler transform
  is `none`. Cancel returns 300/1560/2496.
- Source pinch changes 39 -> 58.5px/beat with equivalent restoration.
  Integer scroll rounding contributes approximately half a CSS pixel at midpoint.
- Touch panel height 320 -> 380 -> 320 on cancellation. Desktop pointer
  320 -> 360; keyboard End 600/Home 160; restored to 320.

### Audio and connected project

- Factory Soft Saw C4 through actual Sampler Performance UI:
  **261.625433Hz**, peak **0.240686**, released output about **7.14e-13**,
  no active key left. Factory Kick/Snare Drum Performance peak **0.219987**,
  decayed output about **8e-13**.
- Existing numerical EQ browser regression: +6dB **6.000004dB**,
  -9dB **-9.000000dB**, HP **-39.972487dB**, LP **-42.699904dB**,
  response boost **5.999270dB**, analyser tap error **0**. Master boost
  **6.000866dB**, bypass error **0**; stereo errors remain below existing
  1e-7 thresholds. No tolerances were weakened.
- Live Master FFT showed **258Hz**, **11.72Hz/bin**, with an advancing clock.
  An initial silent short read was not counted as FFT acceptance.
- Synthetic microphone saved **60,448 frames**, RMS **0.084857**.
  Suspension recovery saved **24,576 frames**, RMS **0.084857**; take preview
  meter RMS **0.050907**. Post-fix built recording/orientation produced
  **21,152 frames**, RMS **0.084854**, with no detached-dialog page error.
- Sample selection **2,400..21,600** of a 24,576-frame original saved
  **19,200 frames at 48kHz**, RMS **0.084787**. The original IndexedDB
  SHA-256 stayed unchanged. Cancel/discard and actual Clap chooser import passed.
  This test does not establish a quantified Sample-specific +3dB EQ delta;
  track/master have the independent DSP measurements above.
- Actual mastering render: **20.30s, 44.1kHz stereo**. An intentionally hot
  project warned of clipping with Limiter disabled. Enabled at -1dB, the result
  measured approximately **-1.1dBTP estimated**, without a clipping warning.
- WAV: **5,371,474 bytes**, decoded **974,400 frames at 48kHz**,
  RMS **0.583812**, peak **-1.084507dBFS**.
  MP3: **814,049 bytes**, decoded **976,770 frames at 48kHz**,
  RMS **0.583149**, peak **-1.077946dBFS**.
  Encoded settings: 44.1kHz stereo, 24-bit WAV / 320kbps MP3.
  MP3 frame difference includes codec padding/resampling.
- **400** intermediate progress observations across attempts; actual cancel
  released processing/worker resources, retry completed, WAV Download again used.
- Actual `.EHS` Save Blob **570,847 bytes** imported through file input on clean
  origins. Six track identities, clips, Sampler root/sample/note pattern,
  two Drum samples/steps, EQ, mastering and two recorded takes restored.
  Recovered take playback peak **0.0985404**. No direct state-injection shortcut.
- Built offline shell **b465109988f4be347ccc** opened with network disabled.
  Factory Sub Bass C2 inserted/soloed through UI produced peak **0.399115**,
  frequency **65.407363Hz**, advancing clock **0.741333s**.
  Network was restored and playback stopped afterward.

### PWA/build scope

Actual local waiting/approval worker transitions were verified through
`b465109988f4be347ccc`, including new HTML already loaded under an older active
worker. Compact CSS first produced **52660d3ebfebb51bf2e4**. The final hosted-source
footer guard produced **4dfe931160a404bdb167**, twice, with **79 assets**.
Final loaded HTML/footer identity, all **28** desktop/mobile node drags and
master body-bounds checks passed on this final build.
The complete connected export/recording/offline workflow was not repeated on
this last build-identity-only change. Do not interpret its loaded metadata as proof that
every older browser client has activated this worker. Deployment/install was
not performed. Source serving remains explicitly unversioned.

## Factory provenance

All nine mono **44.1kHz, 16-bit PCM WAVs** are original programmatic assets.
Total payload: **704,232 bytes** (approximately 0.672MiB).

| Asset | Seconds | Root |
|---|---:|---|
| Kick | 0.65 | Percussion |
| Snare | 0.40 | Percussion |
| Closed Hat | 0.13 | Percussion |
| Open Hat | 0.70 | Percussion |
| Clap | 0.40 | Percussion |
| Sub Bass C2 / Saw Bass C2 | 1.50 each | MIDI 36 |
| Soft Saw C4 | 1.50 | MIDI 60 |
| Pluck C4 | 1.20 | MIDI 60 |

[Generator](./scripts/generate-factory-samples.mjs) and
[DSP definitions](./scripts/factory-sample-dsp.mjs) use deterministic noise,
envelopes/filtering, additive harmonics, DC subtraction and -3dBFS peak
normalization. Tests compare checked-in bytes against the generator and verify
finite PCM, generated-float DC <1e-7, endpoints, peak tolerance 0.001dB and
pitched roots. PCM quantization is not misreported as exact floating-point DC.
No third-party sample pack, new runtime dependency or mandatory backend was added.

## Validation and changed files

- `npm.cmd test`: **354 passed, 0 failed, 0 skipped** (347 entering QA-01.2).
- Syntax: **147** JS/MJS files under source/scripts/tests checked successfully.
- Two final deterministic builds: **4dfe931160a404bdb167**, **79 assets** each.
- `git diff --check`: passes; Git reports existing LF/CRLF conversion warnings.
- Browser fixtures add recording-orientation and actual compact-content-bounds
  assertions; Node regressions cover decode initialization, lazy samples,
  deterministic factory PCM, loaded build identity and PWA completion.

Changed runtime: [app](./src/app.js), [audio](./src/audio.js),
[Arrangement](./src/arrangement-workspace.js), [device shell](./src/device-ui.js),
[EQ observer](./src/eq-visualizer.js), [mobile Focus](./src/mobile-focus.js),
[mobile workspace](./src/mobile-workspace.js), [studio composition](./src/studio-workflows.js),
[workspace CSS](./src/workspace.css), [mobile CSS](./src/mobile.css),
[Sampler](./src/sampler-ui.js), [Drum Rack](./src/drum-rack-ui.js),
[source assignment](./src/instrument-source.js), [PWA updates](./src/pwa-updates.js).
New [factory registry](./src/factory-library.js), [build identity](./src/build-identity.js)
and [factory WAVs](./assets/factory-samples/).

Build/tests: [static builder](./scripts/build-static.mjs),
[QA Node tests](./tests/qa12.test.js), [static tests](./tests/static-build.test.js),
[PWA tests](./tests/pwa-updates.test.js),
[mobile closure fixture](./tests/mobile-closure-browser.js),
[disposable localhost fixture server](./tests/qa12-browser-server.mjs).
The server only supports local acceptance/capture, not application architecture.
Required status, gesture, physical checklist, PWA, README and IDEA docs updated.

## Requirements preventing full acceptance

1. Complete a fresh musical-surface touch/long-press/multiple-pointer cancellation
   sweep, plus replacement/removal/workspace-exit voice cleanup through UI.
   Prior lifecycle and 32-pad tests are retained, not represented as fresh runs.
2. Dedicated Edge/WebKit and physical iPhone Safari/installed PWA/Windows installed
   PWA checks remain unavailable or unexecuted. Native iOS callout/magnification
   and accessibility zoom cannot be accepted from Chromium CSS or CDP input.
3. Deliberately delayed real-worker recovery and the complete metadata/artwork/
   release-package regression remain unverified in this continuation.
4. The seven-size matrix is functional EQ acceptance, not full gesture/recording/
   export acceptance at every size. Full final-build connected repetition and
   broader device ergonomics remain acceptance work.

These are explicit test gates, not claims of known audio/data loss. Retest using
[the physical checklist](./MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md) after an
approved deployment. Do not clear user storage or overwrite the only project
copy. No automatic progression to another batch.
