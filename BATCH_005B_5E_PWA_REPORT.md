# Batch 005B.5E - PWA app icon and branding

## Status

**PWA ICONS, MANIFEST AND OFFLINE SHELL VERIFIED**

The application shell and install metadata work in a Chromium browser served
from a repository-style subpath. This is local verification only: no GitHub
Pages deployment, physical Android installation or physical iOS installation
was performed.

## Official artwork and generated assets

The supplied root [icon.png](./icon.png) remains the authoritative artwork and
was not edited. Its SHA-256 after generation is
`3b6bd30faf1b06612f7dc8fd5652860ebc57f116685c0692be5f27d2f79beb76`.
The original is 1254x1254 RGB PNG.

High-quality Lanczos resizing generated uncropped, square RGB PNGs from the
complete image. The source and built copies have identical bytes:

| Asset | Dimensions | Bytes | Treatment |
|---|---:|---:|---|
| [icon-192.png](./icons/icon-192.png) | 192x192 | 49,093 | Full composition, resized without cropping |
| [icon-512.png](./icons/icon-512.png) | 512x512 | 308,821 | Full composition, resized without cropping |
| [icon-maskable-512.png](./icons/icon-maskable-512.png) | 512x512 | 136,817 | Full image scaled to 64% on solid dark padding |
| [apple-touch-icon.png](./icons/apple-touch-icon.png) | 180x180 | 43,785 | Full composition, resized without cropping |
| [icon-1024.png](./icons/icon-1024.png) | 1024x1024 | 1,185,535 | Full composition master |

All five are opaque PNGs. The maskable preview includes a central 80%-diameter
safe-area guide; the logo and metallic frame remain within it. The
[preview sheet](./icons/icon-preview.png) compares standard, maskable and Apple
touch variants. Its guide is illustrative and is not composited into the app
icon.

## Manifest, Pages paths and build

[manifest.webmanifest](./manifest.webmanifest) declares:

- Name `EggHeadStudio DAW`; short name `EggHeadStudio`.
- `standalone` display; relative `start_url` and `scope` (`./`).
- Dark `#10131b` theme and background colors.
- Three `image/png`, `purpose: "any"` standard icons (192, 512 and 1024).
- A separate 512x512 `purpose: "maskable"` icon.

[index.html](./index.html) links the manifest and Apple touch icon using
relative paths. Only the built page (identified by its generated build meta)
registers the relative [service-worker.js](./scripts/service-worker-template.js)
output; ordinary source development is not intercepted by a generated worker.

The deterministic [static build](./scripts/build-static.mjs) hashes the build logic itself,
manifest, worker template, all runtime icon bytes, HTML and versioned
`src`/`vendor` assets. It copies app icons and manifest into the Pages output
and emits a worker with that build's cache key. Icon resizing is not part of the
build, so repeated builds do not need Pillow or re-encode unchanged artwork.
`dist` includes the 1024 master but does not publish the separate preview sheet
as an app-shell resource.

Paths were resolved against
`https://eggheadstudio.github.io/EggHeadStudio-DAW/`; each manifest icon and
the Apple touch icon stays under `/EggHeadStudio-DAW/icons/`. The actual build
was served at `http://127.0.0.1:8769/dist/` to verify the same relative
repository-subpath behavior. Two final builds matched at version
`714a631fec912ab14cb8` with 65 JavaScript/CSS/Worker/vendor assets.

## Offline shell behavior

The generated worker precaches exactly 73 app-shell URLs in the tested build:
the application root, manifest, version file, five runtime icons and 65
versioned application/vendor assets. Navigation is network-first with the
cached application root as offline fallback; cached shell assets are served
from Cache Storage. At the original 005B.5E checkpoint, the initial activation
policy cleaned old `ehs-shell-` caches too eagerly. Batch 005B.5E.1 replaced
that policy with user-approved, all-client-safe activation and version-aware
cache retention; see the [follow-up report](./BATCH_005B_5E_1_REPORT.md) and
[architecture guide](./PWA_ARCHITECTURE.md) for the corrected lifecycle.

Chromium verified:

- Worker installed, activated and controlled the `/dist/` subpath with only
  the current build cache remaining after activation.
- Manifest and all four declared manifest icon URLs returned HTTP 200.
- Apple touch icon was included in the shell cache.
- All 73 precache URLs resolved to generated files.
- After switching the browser context offline and reloading, the DAW page
  still loaded, was controlled by the worker, and fetched the maskable PNG and
  manifest successfully.

The worker only caches static application shell resources. It does not cache
project, sample or recording data and does not clear or migrate IndexedDB.
Offline availability of browser-managed media, remote links, or capabilities
requiring network access is not promised.

## Regression results and limitations

- `node --test tests/static-build.test.js`: **1 passed**. It checks deterministic
  versioning, relative manifest/Apple links, app assets, icon copies and
  generated precache URLs.
- `npm test`: **324 passed, 0 failed/cancelled/skipped**.
- `node --check`: **135 JS/MJS files passed**.
- All **352 relative links** across **34 UTF-8 Markdown documents** resolve;
  `git diff --check` passes.
- PNG format/dimensions, byte-identical build copies, manifest metadata and
  GitHub Pages subpath URLs passed direct checks.
- No remote Pages deployment or installation on real Android/iOS devices was
  possible here. Appearance in a platform launcher, browser install prompts,
  splash-screen behavior and OS-specific adaptive masking remain acceptance
  checks after an approved deployment.

No PWA was deployed, and no commit or push was made.

## 005B.5E.1 safe-update follow-up

The original 005B.5E offline check established shell loading only; it did not
prove that production work could continue offline or that an update was safe
for multiple open clients. Those requirements were exercised separately with
actual Service Worker lifecycle transitions and offline browser UI operations.
The failed-update, A/B multi-tab, recording/unsaved-work blocker, cache
retention, project/audio preservation, export evidence and remaining platform
limits are in [BATCH_005B_5E_1_REPORT.md](./BATCH_005B_5E_1_REPORT.md).
The app remains local-first and the user must retain `.EHS` backups; updates
never clear browser storage.
