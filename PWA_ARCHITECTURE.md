# PWA update and offline architecture

## Scope and data boundary

The GitHub Pages build is a static, local-first application. Relative URLs keep
the manifest, icons, service worker, versioned JavaScript/CSS, Workers and
AudioWorklets inside the repository subpath. Runtime code is content-versioned
under `assets/<build-version>/`.

The Sample Library's folder tree, selection and expanded folders are
browser-local metadata in `localStorage` (`pulse-sample-library-v1`). User
audio remains in the existing IndexedDB asset store. Neither is included in
the service-worker shell cache; see [Sample Library](./SAMPLE_LIBRARY.md) for
ZIP-pack limits and portability boundaries.

The service worker caches only the application shell: the built entry page,
manifest, version file, icons, versioned application/vendor assets and the nine
bundled original factory WAVs. Factory files use the same content version and
are lazy-decoded by the library; shell caching does not copy them into IndexedDB.
Referenced factory audio is embedded when saving a portable `.EHS`. It does
not cache user audio or modify IndexedDB, localStorage, recovery snapshots,
presets, takes or project schemas. A PWA update is not a backup. Use **Save
.EHS** to create a portable project archive and retain a separate copy of
important exports.

## Install, wait and obtain approval

Each build's worker has a unique cache name and embedded build version. Install
pre-caches that build's complete shell. If any shell request fails, installation
deletes its partial cache and rejects; the active worker remains in service.
Successful installation waits by default. There is no unconditional
`skipWaiting()` or `clients.claim()`.

The built application registers the worker and displays an accessible,
nonintrusive notice when a newer worker is waiting. **Later** hides the notice
for that tab's current foreground interval; it does not activate the worker.
**Update now** sends an explicit activation request to the waiting worker.
Before activation, that worker queries every live same-scope window, including
uncontrolled clients, for its build version and safety blockers. A missing,
malformed or timed-out response fails closed. Each client blocks updates during
recording, sample recording finalization, unsaved Sample Studio edits,
project changes, sample saves/imports, project import, `.EHS` operations,
audio/release export, an active edit gesture or playback.

Only a successful all-client check can call `skipWaiting()`. The worker then
notifies the checked clients. Each tab reloads only after it asks the activated
worker for its version and confirms that it matches the approved build. There
is no automatic reload. Errors leave the current page running and are reported
in the UI or console. After approval, version confirmation is retried while the
new worker activates. If the approved build is still not confirmed before the
bounded wait expires, the notice returns to an actionable **Retry update** or
**Dismiss** state; it does not remain indefinitely on a switching message. A
matching version hides the notice immediately before the safe reload. This UI
recovery does not alter the all-client safety check or force activation.

Network-first navigation can load newer HTML before its worker has activated.
If the user approves that same already-loaded build, active-worker confirmation
completes switching and shows **Updated / Dismiss** without an unnecessary
reload. A different loaded version still reloads only after safe confirmation.
Matching HTML alone does not approve activation or bypass all-client blockers.

The footer displays the loaded HTML's authoritative `ehs-build` metadata, with
a short ID and the full diagnostic ID, distinguishing source/unversioned,
local built and hosted presentation. It does not substitute `version.json` or
the active worker's version for the code actually loaded, including offline.

An older open tab that does not implement the safety protocol, or a suspended
tab that cannot answer within the 2.5-second client-query window, prevents
activation. Close that tab or bring it online/reload it before retrying. This
conservative compatibility behavior favors preserving active work over forcing
an update.

## Cache retention and cleanup

Activation does not delete caches and does not claim existing clients. Each
successful install writes a build/version install-time marker into its own
shell cache. While an older worker remains active, its cleanup compares cache
markers and cannot delete a newer waiting build's cache. Versioned asset
requests are served from the current cache, then retained older caches, then
the network.

The active worker removes only older caches, and only after every live app tab
reports the active build. If a client is stale, unresponsive or incompatible,
cleanup keeps the prior caches. A newer waiting cache is never treated as an
obsolete cache merely because it is not the active worker's cache. Cache cleanup
is limited to names with the application's `ehs-shell-` prefix.

Navigation is network-first with the active build's cached application page as
an offline fallback. App-shell assets are cache-first with retained-version
fallback. The worker does not change or clear site storage during install,
activation, update or cache cleanup.

## Offline production

After the shell has installed, the cached application can reopen a locally
stored project, decode locally stored assets, edit/preview samples, edit
patterns/effects, save project data, and render WAV or `.EHS` without the
application host. Browser file pickers still allow a user to import a local
file while offline. Unbundled network-backed resources and capabilities remain unavailable offline.
Bundled factory WAVs remain available from the installed versioned shell.

The evidence and exact browser scope are recorded in
[BATCH_005B_5E_1_REPORT.md](./BATCH_005B_5E_1_REPORT.md). That local Chromium
test stopped the application server, verified a failed network probe, performed
the production edits/exports through the UI, and opened a fresh tab to confirm
local project and IndexedDB audio recovery.

[QA-01.2](./QA-01_2_REPORT.md) adds actual local waiting/approval cycles,
same-loaded-version completion, retained project/audio and offline factory
insertion/playback. Deliberately delayed real-worker, dedicated cross-browser
and physical installed-app checks remain open; unit recovery tests are not
mislabelled as those acceptance tests.

## Installation acceptance checklist

These are release checks, not claims that the devices below have been tested.
Complete them against an approved GitHub Pages deployment:

| Platform | Acceptance checklist | Status |
|---|---|---|
| Android Chrome | Install prompt/launcher icon; standalone launch and subpath scope; offline project open/play/edit/save/export; A/B update prompt and multi-tab safety; storage survives update | Not physically tested |
| iOS Safari | Add to Home Screen; Apple touch icon; standalone launch; offline shell and project/audio operations; update behavior after reopening Safari; storage survives update | Not physically tested |
| Desktop Chromium | Install affordance; standalone launch; offline production; update waiting/Later/approval; multiple tabs, active-work blockers and cache cleanup | Local browser lifecycle and offline production tested; OS installation not tested |
| Firefox | Manifest/service-worker support and install affordance where available; offline production; update lifecycle and project/audio preservation | Not tested |

No deployment, commit or push is implied by these local acceptance results.
