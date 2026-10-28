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

Schema 0/legacy project objects are migrated to schema 1 on import. Schema 2 is reserved for projects containing typed instrument clips; a schema-2 archive must declare `compatibility.requiredFeatures: ["instrumentClips"]`. Archives with schema 2 are rejected by older application versions that only support schema 1. Invalid or unknown schema versions are rejected without replacing the active project. Every referenced audio clip, sampler, and Drum Rack pad asset must be present. Conflicting local asset IDs are remapped after content comparison rather than overwriting different cached bytes. Decoding and validation are staged before a single IndexedDB write transaction and project swap. Imported artwork is stored under project-scoped keys; project data without artwork clears stale artwork keys.

## Optional audio-clip editing metadata

Archive format remains **version 1**. Projects without typed instrument clips use project schema 1; projects with typed instrument clips use project schema 2. Existing audio clip fields keep their meanings: `bar` is the Arrangement start in bars (four beats per bar), `start`/`end` are source seconds, `rate` is source playback rate, and a loop clip's `duration` is its Arrangement duration in seconds.

Non-destructive slicing can add these optional, finite, non-negative numeric fields:

- `loopOffset`: source seconds elapsed from the loop's source start, wrapped within `end - start`. It preserves the phase when copying or splitting a loop.
- `envelopeOffset`: Arrangement seconds elapsed within the original clip's gain/fade envelope.
- `envelopeDuration`: original envelope duration in Arrangement seconds, so a partial copy does not restart or stretch its fades.

Missing offsets default to zero; missing envelope duration uses the clip's normal duration. Both live and offline scheduling consume these fields. Import rejects invalid optional numeric fields before replacement. Existing v1 archives remain readable. Older app revisions may ignore the new fields and therefore play sliced loops/fades differently; forward playback equivalence with older renderers is not guaranteed.

Selection, clipboard, insertion marker and panel layout are transient workspace state, not portable project fields. Project loop start/end remain bar-based. The application supplies safe defaults for missing/invalid legacy loop fields without changing the general JSON parser's round-trip behavior.

## Typed instrument clips (project schema 2)

Project schema 2 supports `track.patterns` and Arrangement clips tagged `kind: "instrument"`. A pattern has a non-empty track-scoped ID, a name, `lengthBeats` from greater than zero through 64, and note events with unique IDs, beat positions, MIDI pitches (0–127), positive durations and velocities (0–1). An instrument clip references a pattern on the same track and stores its ID, bar position, positive `durationBeats`, non-negative `offsetBeats`, boolean loop state and optional non-negative gain. Instrument sample/pad configuration remains on the track. Audio clips retain their source asset and second-based fields. Sampler and Drum Rack asset references, audio clips, typed pattern references and note/clip/pattern limits are validated before an archive is accepted. Project safety limits remain 256 tracks, 100,000 clips, 100,000 patterns and 1,000,000 notes.

The portable container stays format version 1. Schema-2 manifests declare `compatibility.requiredFeatures: ["instrumentClips"]`; this explicitly signals that older applications rejecting schema versions above 1 cannot open the project. Schema 1 archives and the existing project factory remain unchanged. The explicit `migrateInstrumentArrangement(project, idFactory)` helper converts representable legacy whole-track patterns into independent typed pattern/clip data and is idempotent. Migrated clips carry `legacyTail: true` so the final note retains its legacy voice tail beyond the clip boundary. Moving an unchanged clip preserves this behavior; partial slicing and deliberate resizing remove `legacyTail`, so the edited clip boundary constrains note tails. Empty legacy patterns do not extend the prior default render duration; migration sizes their silent clip to the existing project/audio duration. Use `normalizeProjectSchema(project)` after migration or typed-clip creation to validate typed references and stamp schema 2 (or schema 1 when no typed clips exist). `createProjectTrack(settings, id, {instrumentClipModel: true})` creates a Sampler/Drum Rack track with an empty `patterns` collection while leaving the default factory behavior unchanged.

## Recording take metadata and clip mute (additive, Batch 005A.6C)

Audio clips may carry an optional boolean `mute` and an optional `recording` object: `takeId` (must equal the clip `id`), non-empty `groupId` (≤128 chars), `name` (≤120 chars), integer `frames` > 0, integer `startFrame` ≥ 0, `sampleRate` 8,000–192,000, `positionSeconds` ≥ 0, `offsetMs` within ±2,000, and non-negative `inputLatency`/`outputLatency`. These fields are validated on import (`validateRecordingClip`). The recording itself is a normal 32-bit float WAV asset referenced by `clip.asset`, so existing asset packaging, checksums and limits apply. Muted clips are excluded from live playback and offline rendering. Container format version 1 and project schemas 1/2 are unchanged; older applications ignore the unknown fields and would play all takes, including muted alternates.

## Release metadata and audio tags

The release editor stores validated metadata in the project. Exported MP3 files receive ID3v2.3 text frames using UTF-16LE with a byte-order mark, an APIC front-cover frame, a Producer TXXX frame, and a COMM comment frame. WAV files receive RIFF LIST/INFO metadata before the audio data chunk; RIFF sizes are updated and encoded PCM bytes are preserved. Release ZIPs include the selected mastered WAV/MP3 files, their matching metadata, human-readable release notes, and optional cover art. Audio formats in one package are encoded from the same offline arrangement render.

This implementation does not claim BWF/iXML, RF64, ID3v2.4, gapless MP3 metadata, embedded WAV artwork, or broadcast/streaming certification. Existing MP3 encoder delay/padding remains. WAV INFO and ID3 metadata are limited to the supported fields documented in the Release Studio.

## Browser and memory model

ZIP compression runs in a module Worker when available, with a synchronous fallback. Import also runs ZIP preflight, unpacking, CRC/SHA verification and manifest/reference validation in a module Worker; the main page passes an immutable Blob and receives verified asset Blobs and project metadata rather than a full extracted byte-array map. Worker failures are reported, not silently retried on the main thread. The no-Worker fallback retains the same validation, with cancellation checks between verification steps; its synchronous unpacking cannot be interrupted mid-step.

Import reports progress and can be cancelled during validation or audio staging. Cancellation terminates the import Worker and leaves the active project untouched. The UI disables cancellation when the final IndexedDB write transaction begins. Identical embedded audio paths/MIME types reuse an immutable Blob; restoration reuses decoded audio for identical hashes and for matching local buffers known to have been decoded from the same packaged bytes. Matching a stored file alone does not establish that an edited in-memory buffer has identical PCM. Decoding consumes the staging ArrayBuffer directly instead of copying it first.

ZIP output uses fflate's incremental writer: stored audio/artwork and compressed metadata are pushed in at most 1 MiB input slices, with output collected as Blob parts instead of one contiguous output Uint8Array. Version-1 ZIP data descriptors are checked against the central directory on import. The output byte budget is enforced as chunks arrive. Export also rejects oversized stored assets before reading/encoding them when their size is known, and enforces the existing JSON limits before creating an archive.

This is **chunked ZIP output, not end-to-end streaming**. Source payload collection, SHA-256 calls and import extraction still need complete buffers. Blob parts and collected payloads may coexist, and Worker/native memory is additional to the page's reported heap. No archive limit was raised. Audio entries are stored to keep the compression ratio predictable, so `.ehs` size can approach the uncompressed media size. The limits and UI warning are safeguards, not a guarantee that every browser/device can process an archive near those limits. Do not treat archive import/export as a cloud backup; the browser's IndexedDB remains the app's local working cache.

Export cancellation stops the ZIP Worker (or checks between chunks in the no-Worker path). It snapshots project metadata before packaging; edits made afterward are not marked backed up by that older export. Import writes verified assets before persisting the incoming metadata and swapping the active project. Metadata quota failure does not swap the active project; verified cache entries may remain. IndexedDB and localStorage cannot form one cross-storage transaction, so browser/process termination during this commit is not claimed to be fully crash-atomic.

## Verification

`tests/release-package.test.js` covers metadata validation, Unicode ID3 frames and cover art, WAV LIST/INFO preservation, archive asset deduplication and checksum verification, float-WAV fallback, schema migration, traversal and tampering rejection, artwork validation, compression-ratio rejection, and Release ZIP contents. Browser round-trip behavior and responsive UI are acceptance checks recorded in `BATCH_004C_REPORT.md`; independent media-player tag interoperability and physical-device memory/performance remain release validation.

## Batch 005A.7-UX additive fields (format version stays 1)

- drumRack.visibleCount (integer, optional): floor for how many leading pads are displayed.
- drumRack.pads[].id (string, stable): pad identity. Pad `note` remains the note mapping used by pattern notes.
- Step notes may carry padId.
- Pad cap raised from 16 to 32. Legacy 16-pad racks load unchanged; trailing untouched default pads are hidden, never deleted. Older app versions ignore the new fields and re-pad to 16.
- The Piano Roll velocity lane edits the existing note `velocity` (0-1). It adds no archive/schema field; collapsed state, zoom and scroll remain editor state. The toolbar slider still supplies the default for newly created notes.
