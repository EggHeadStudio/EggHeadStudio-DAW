# Batch 005B.5E.1 — Safe PWA updates and offline production

## Status

**BATCH 005B.5E COMPLETE — PWA ACCEPTED FOR TESTED BROWSER SCOPE**

Safe version transitions and a connected offline-production workflow were
verified using local Chromium browser clients. This is not a GitHub Pages
deployment, physical Android/iOS installation, Firefox/Safari certification,
or physical microphone test. No commit, push or deployment was performed.

## Audit findings and changes

The previous worker could activate immediately with `skipWaiting()` and
`clients.claim()`, then delete other `ehs-shell-*` caches during activation.
That could replace a running controller and remove versioned assets still
needed by an older page. A failed `cache.addAll()` could also leave a partial
new cache. During implementation, a second cache-cleanup race was found: an
older active worker must not delete a newer worker's waiting cache simply
because it is not its own.

The worker and app now implement this lifecycle:

1. A worker precaches its versioned shell and removes its partial cache if
   installation fails. It waits by default.
2. The app shows **Update now** and **Later**. Neither a waiting worker nor
   visibility changes cause an automatic page reload.
3. **Update now** asks the waiting worker to query all live same-scope tabs.
   Missing, malformed or timed-out safety replies block activation.
4. Recording/finalization, unsaved sample edits, dirty projects, sample save or
   import, project import, `.EHS` import/export, audio/release export, edit
   gestures and playback block the transition.
5. Only an all-safe, explicitly approved request calls `skipWaiting()`.
   Existing tabs reload only after confirming that the active worker reports
   the approved version. The worker does not call `clients.claim()`.
6. Each shell cache has an install-time marker. An older worker cannot delete
   a newer waiting cache. The new active worker cleans older caches only when
   every live tab reports the new build; retained old caches can serve old
   versioned requests meanwhile.
7. Cache operations do not touch IndexedDB, localStorage, project recovery,
   presets, recorded takes or user audio. User audio is not part of the shell
   cache. `.EHS` remains the recommended portable backup.

The failure notice hides its nonfunctional **Update now** control and offers
**Dismiss**. If an old/incompatible tab cannot answer the safety protocol, the
update is deliberately held until that tab is closed or updated. See
[PWA_ARCHITECTURE.md](./PWA_ARCHITECTURE.md) for the protocol and its limits.

## Actual Service Worker version-transition acceptance

Two live page clients shared the same local origin and Service Worker
registration. The builds were real deterministic static outputs:

| Build | Version | Result |
|---|---|---|
| A | `c57c65d70ee7d9e4169c` | Installed and active |
| Broken candidate | `e8062e59f52542619476` | One versioned app module intentionally absent; installation rejected |
| Repaired candidate | `af36fff1039b36ffe3ce` | Installed, waited, and activated after approval |

Observed browser behavior:

- The failed candidate left A active, removed its partial cache and displayed
  an install-failure notice with **Dismiss**. A remained usable.
- The repaired B installed and waited. Both tabs remained on A; A's cached
  versioned `src/app.js` still returned HTTP 200 while the server exposed B.
- **Later** hid the notification in one tab and left A active with B waiting.
- A real Sample Studio recording state in one tab blocked **Update now** in the
  other with “Finish or cancel the active recording first.” The synthetic
  MediaRecorder stream did not produce decodable saved PCM when stopped; the
  test counted only the observed active-recording blocker, not a saved take.
- An unsaved loaded sample in one tab blocked the other tab's request. A dirty
  project in that tab then blocked it with the unsaved-project message.
- After discarding the sample and downloading a JSON save to clear project
  dirtiness, a user click on **Update now** activated B. Both tabs reloaded to
  B; the document build, fetched `version.json`, and active worker's reported
  build all matched `af36fff1039b36ffe3ce`.
- The existing project ID, 5 tracks, pattern notes and a 768,044-byte WAV Blob
  in IndexedDB survived the transition. Once every tab reported B, Cache
  Storage contained B only. The site data was not cleared.

The tests used content-hashed build IDs; the repaired build differs from A by a
deliberate HTML build marker while using the updated source. The broken
candidate exercises the actual worker precache failure path, not a mocked
registration state.

## Connected offline-production acceptance

The built app was first opened online and controlled by its service worker.
The local application server was then stopped; a direct request to a
non-cached probe failed, while the app shell and cached resources continued to
load. The browser UI was used to perform the following on the same local
project:

1. Reopened the local project and started/stopped Arrangement playback.
2. Loaded a deterministic WAV from the local file picker.
3. Added the Sample Studio EQ device, previewed, changed gain to -3 dB and
   saved a new sample without replacing the source.
4. Added a Drum Rack step through the pattern editor.
5. Added a track Reverb, changed decay to 2.5 s, and played the arrangement.
6. Downloaded JSON and exported a portable `.EHS` archive. The app reported the
   `.EHS` export complete (about 0.7 MiB).
7. Rendered WAV in Export Studio. The app decoded and analyzed the encoded
   output, reporting **Export complete**, **-12.0 LUFS** and **-10.0 dBTP
   estimated**.
8. Reloaded, opened a fresh tab while the host remained unavailable, and
   verified the same project ID, 5 tracks, 3 pattern notes, Reverb setting and
   2 locally stored audio assets.

The download UI reported successful JSON, `.EHS` and WAV export. The browser
automation host did not expose reliable download-byte inspection for every
download in this run; WAV's in-app decode/analyze gate passed. Existing
portable-archive integrity/round-trip tests and the prior 005B.5D browser
acceptance remain separate regression evidence. This offline run did not
re-import the generated `.EHS` archive.

## Regression and build evidence

- New `tests/service-worker.test.js` tests: **3 passed** for failed precache
  cleanup, all-client activation gating and version-aware cache retention.
- Full `npm.cmd test`: **327 passed, 0 failed**; the 324-test 005B.5E suite is
  preserved with the three new Service Worker lifecycle tests.
- `node --check`: **137 JS/MJS files passed**.
- Two consecutive `npm.cmd run build` executions produced the same
  deterministic version, `c57c65d70ee7d9e4169c`, and 66 built assets.
- `git diff --check`: passed.
- Local pages used relative application URLs. No root-relative subpath
  regression or project/archive schema change was introduced.
- Prior Batch 005B.5D tests cover deterministic repeated/restored audio,
  unchanged numerical gates, WAV/MP3 decoding and `.EHS` round-trips. The
  previous five high-value mobile workflow variants are documented in the
  [005B.5D report](./BATCH_005B_5D_REPORT.md); they were not all repeated here.

## Modified files

- `scripts/service-worker-template.js`
- `src/pwa-updates.js`
- `src/app.js`
- `index.html`
- `src/style.css`
- `scripts/build-static.mjs`
- `tests/static-build.test.js`
- `tests/service-worker.test.js`
- `README.md`
- `IDEA.md`
- `BATCH_005B_5E_PWA_REPORT.md`
- `PWA_ARCHITECTURE.md`
- This report.

## Remaining limitations and installation checklist

- No remote Pages deployment or physical Android Chrome/iOS Safari install was
  performed.
- Firefox and Safari Service Worker/update behavior was not tested.
- Microphone hardware, OS suspension/background behavior, push notifications
  and browser-specific storage eviction were not tested.
- A tab that cannot answer the safety query intentionally blocks an update.
- Network-dependent resources and operations cannot be made available by the
  app-shell cache alone.
- Follow the Android Chrome, iOS Safari, Desktop Chromium and Firefox
  installation checklist in [PWA_ARCHITECTURE.md](./PWA_ARCHITECTURE.md) after
  an approved deployment. Do not clear site data during an update.

No PWA was deployed, and no commit or push was made.
