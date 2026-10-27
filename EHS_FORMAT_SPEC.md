# EggHeadStudio Portable Project (`.ehs`) Format

Version 1 is a ZIP-compatible, self-contained project archive. It is generated and opened locally by the static browser application; it does not require a server or account.

## Archive layout

Required entries:

```text
manifest.json
project.json
README.txt
```

Optional entries:

```text
assets/audio/<sha256>.<extension>
assets/artwork/<sha256>.<extension>
assets/artwork/original-<sha256>.<extension>
presets/<safe-name>.json
```

`project.json` preserves the existing project model and references audio by asset ID. The `manifest.json` binds those IDs to embedded audio records and describes the project schema, artwork, presets, compatibility, and every payload file. Payload records contain byte length and lowercase SHA-256. Audio is deduplicated by content hash, stored without ZIP compression to avoid pathological ratios for silence and already-compressed media, and embedded losslessly. When an original source file is unavailable but a decoded buffer is available, the archive stores a 32-bit float WAV without downsampling. Saving from the application includes every custom mastering preset currently stored in that browser's local preset library.

Version 1 manifest fields include:

- `format: "EggHeadStudioProject"` and `formatVersion: 1`.
- `applicationVersion`, `projectSchemaVersion`, `projectId`, `projectName`, timestamps, and a minimum-application compatibility marker.
- `assets`: asset ID to archive path, size, SHA-256, source name, MIME type, and optional source sample-rate/channel details.
- `artwork` and `artworkSource`: prepared and original cover records when present.
- `presets`: custom mastering preset names and paths.
- `files`: path, size, and SHA-256 for each entry except the manifest itself.
- `limits`: payload byte count and file count.

The manifest is descriptive, not a cryptographic signature: SHA-256 detects accidental or malicious modification relative to the manifest but does not prove who created the project.

## Import validation and migration

Import checks ZIP directory/header agreement, UTF-8 paths, duplicate entries, local-record overlap, CRC-32, SHA-256, declared sizes, required files, project references, image signatures, preset references, and supported compression methods before accepting the project. Encrypted, symbolic-link, multi-disk, ZIP64, traversal, and unsupported-path entries are rejected. The importer enforces a 256 MiB compressed archive limit, 512 MiB total uncompressed limit, 4,096 entries, a maximum 200:1 per-entry compression ratio, a 16 MiB project JSON limit, and 2 MiB manifest/preset JSON limits. Artwork is limited to 25 MiB per image.

Schema 0/legacy project objects are migrated to schema 1 on import; future or invalid schema versions are rejected without replacing the active project. Every referenced clip, sampler, and Drum Rack asset must be present. Conflicting local asset IDs are remapped after content comparison rather than overwriting different cached bytes. Decoding and validation are staged before a single IndexedDB write transaction and project swap. Imported artwork is stored under project-scoped keys; project data without artwork clears stale artwork keys.

## Release metadata and audio tags

The release editor stores validated metadata in the project. Exported MP3 files receive ID3v2.3 text frames using UTF-16LE with a byte-order mark, an APIC front-cover frame, a Producer TXXX frame, and a COMM comment frame. WAV files receive RIFF LIST/INFO metadata before the audio data chunk; RIFF sizes are updated and encoded PCM bytes are preserved. Release ZIPs include the selected mastered WAV/MP3 files, their matching metadata, human-readable release notes, and optional cover art. Audio formats in one package are encoded from the same offline arrangement render.

This implementation does not claim BWF/iXML, RF64, ID3v2.4, gapless MP3 metadata, embedded WAV artwork, or broadcast/streaming certification. Existing MP3 encoder delay/padding remains. WAV INFO and ID3 metadata are limited to the supported fields documented in the Release Studio.

## Browser and memory model

ZIP compression runs in a module Worker when available, with a synchronous fallback. Compression is buffered, not streamed: input payload bytes and the resulting archive coexist in memory. Audio entries are stored to keep the compression ratio predictable, so `.ehs` size can approach the uncompressed media size. The limits and UI warning are safeguards, not a guarantee that every browser/device can process an archive near those limits. Do not treat archive import/export as a cloud backup; the browser's IndexedDB remains the app's local working cache.

## Verification

`tests/release-package.test.js` covers metadata validation, Unicode ID3 frames and cover art, WAV LIST/INFO preservation, archive asset deduplication and checksum verification, float-WAV fallback, schema migration, traversal and tampering rejection, artwork validation, compression-ratio rejection, and Release ZIP contents. Browser round-trip behavior and responsive UI are acceptance checks recorded in `BATCH_004C_REPORT.md`; independent media-player tag interoperability and physical-device memory/performance remain release validation.
