# QA-01.1 Extended — Targeted Mobile/PWA Usability Fixes

## Final status

**QA-01.1 EXTENDED INCOMPLETE — SPECIFIC BLOCKERS REMAIN**

Targeted source and deterministic-build browser checks, regression tests and
two deterministic builds passed. This closes the browser-verifiable defects
covered below, but does not close full production-workflow, installed-PWA,
cross-browser or trusted physical-device acceptance.

## Requirement-by-requirement acceptance

Statuses distinguish implementation from exercised evidence. Chromium
touch-emulation and dispatched browser events are synthetic input, not trusted
physical touch.

| Area | Requirement | Status | Evidence / remaining work |
|---|---|---|---|
| Arrangement | Pinch capture from clips, ruler, loop controls and lanes | Browser verified | Source Chromium at 390x844 verified pinch from a clip and ruler; loop-pinch cancellation restored the gesture. Deterministic `dist` at 390x844 zoomed from 100% to 150% with pinch beginning over a clip. |
| Arrangement | Cancel an active gesture when a second touch begins | Browser verified | Source check verified loop pinch cancellation; Node regression verifies that a second touch cancels the existing gesture. Built pinch preview was removed on completion. |
| Arrangement | Downward cross-track movement preview | Browser verified | Source and built Chromium displayed the floating preview during a downward move and committed the drop on release. Full source/build serialized-project parity was not compared. |
| Arrangement | Scoped playhead hit target | Browser verified | Built app check confirmed the playhead did not block a clip interaction near the timeline origin. |
| Arrangement | Native page zoom outside the timeline | Node verified only | Touch-action changes are scoped to Arrangement; no physical browser page-zoom test was performed. |
| Sample Browser | Immediate list refresh and active search preservation | Browser verified | Source Chromium imported while the Browser was open and searched the resulting list. Built Chromium reimported the same stored file through the import handler; one visible item and one clip reference remained. |
| Sample Browser | Reimport matching asset without duplicate listing | Browser verified | Built Chromium reimported the same file with its original metadata; the visible item count remained one. This was an app-handler test, not a trusted file-picker action. |
| Sample Browser | Hide a referenced library entry without deleting audio | Browser verified | Source Chromium hid a library item with one live clip reference and showed the reference state. Reload-after-hide and independent audio-byte recovery were not retested. |
| Device Panel | Resize uses the existing shared height state | Browser verified | Desktop Chromium resized the panel from 320px to 400px. |
| Device Panel | Compact devices and expanded effect controls | Browser verified | Deterministic `dist` at 390x844 showed a 240px compact EQ card; Expand opened the EQ editor and Exit closed it. No second parameter state was introduced. |
| Mobile shared layout | Persistent transport header and 16px text-entry controls | Browser verified | Deterministic `dist` at 390x844 showed the sticky header, 16px input sizing and no document-level horizontal overflow. |
| PWA update notice | Recover Retry/Dismiss after version-confirmation timeout | Node verified only | Unit tests simulate version approval/reply and timeout recovery. Actual Service Worker update activation and installed-PWA recovery were not tested. |
| Browser scope | Source and built UI checks | Browser verified | The source and built app each received targeted checks at 390x844. Desktop Device Panel resize was checked separately. No complete source/build workflow or state equivalence was established. |
| Viewports | Complete mobile and desktop workflow matrix | Blocked | These targeted fixes were not re-exercised through complete workflows at 320x740, 360x800, 390x844, 430x932, 768x1024, 1280x900 and 844x390. |
| Production workflows | Sample Studio, Recording Studio, Mastering and Export | Blocked | No connected production workflow or end-to-end measured audio/export was performed for this follow-up. |
| PWA/offline | Offline shell, installed app, update activation and persistence regression | Blocked | No end-to-end browser/PWA update or offline-shell test was performed. |
| Physical-device acceptance | iPhone Safari/PWA and Windows PWA | Blocked | No physical iOS/Android device or installed-PWA retest was performed. Use the [physical-device checklist](./MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md). |
| Regression | Full Node suite | Node verified only | `npm.cmd test`: 347 passed, 0 failed. |
| Regression | JavaScript syntax and diff hygiene | Node verified only | `node --check` passed for the changed JavaScript modules; `git diff --check` passed. |
| Regression | Deterministic static build | Node verified only | Two builds produced the same version, `d58e08a9349dc059e707`, and 68 assets. |

## Browser evidence and limits

Source Chromium at 390x844 exercised sample import/search, removal with one
live clip reference, downward cross-track movement, pinch beginning over a
clip and ruler, and loop-pinch cancellation. Desktop Chromium exercised Device
Panel resizing from 320px to 400px.

Deterministic `dist` Chromium at 390x844 exercised immediate sample listing,
same-file reimport without a duplicate visible entry, downward clip movement
with a floating preview, clip-origin pinch zoom (100% to 150%), compact/expanded
EQ access, sticky transport, 16px text input and the non-blocking playhead. The
page had no document-level horizontal overflow. These automated browser
actions used synthetic events and do not establish device ergonomics or
trusted-input behavior.

The PWA confirmation tests mock the worker response; they do not prove that an
update installs or activates in an actual browser. Sample-library removal was
checked with a live clip reference, but storage recovery after reload was not
retested. A separate origin containing user project data was left untouched.

## Changed files

- `src/arrangement-workspace.js`
- `src/arrangement.css`
- `src/app.js`
- `src/pwa-updates.js`
- `src/mobile-workspace.js`
- `src/mobile.css`
- `src/workspace.css`
- `tests/mobile-arrangement.test.js`
- `tests/pwa-updates.test.js`
- `MOBILE_ARRANGEMENT_GESTURES.md`
- `MOBILE_PHYSICAL_DEVICE_TEST_CHECKLIST.md`
- `PWA_ARCHITECTURE.md`
- `README.md`
- `IDEA.md`
- `PROJECT_STATUS.md`

No project schema, audio engine, DSP, `.EHS` format or service-worker asset
versioning was changed. No user browser storage was cleared. No commit, push or
deployment was made.

## Remaining blockers

1. Complete connected Sample Studio, Recording Studio, Mastering and WAV/MP3
   export workflows with measured audio results.
2. Verify the complete responsive interaction matrix in the source and build,
   including nonzero scroll offsets, and compare resulting project state.
3. Exercise real Service Worker update activation, offline behavior and
   persistence in browser/PWA contexts.
4. Perform user-led physical iPhone Safari, installed iPhone PWA and Windows
   PWA acceptance. Synthetic browser input is not a substitute.

The original [5F.5 report](./BATCH_005B_5F_5_REPORT.md) remains incomplete for
its own broader acceptance criteria; this follow-up does not retroactively
close them.
