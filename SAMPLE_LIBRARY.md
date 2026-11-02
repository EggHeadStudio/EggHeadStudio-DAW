# Sample Library

The Sample Browser presents **Factory Library** and **My Samples** in one
compact, collapsible tree. Factory samples are grouped by their built-in
category. User samples can be organized into nested folders without changing
their audio asset IDs or project references. Each sample appears beneath its
folder and has Preview, Add (+), and a contextual actions menu.

## Organizing User samples

- **＋ Folder** opens the folder menu: Create Folder, Import Folder, or Import
  ZIP Pack. **＋ Files** imports individual audio files into the selected User
  folder, or the My Samples root if no User folder is selected.
- Tap a folder row to select and expand/collapse it. Use its **⋯** menu for
  Create subfolder, Rename, Move, Remove, and imports into that folder.
- On desktop, right-click a folder row to open its menu. The visible three-dot
  action also works with keyboard and assistive technology. On touch screens,
  long-press opens the same menu; a tap selects or expands the folder.
- Factory folders are read-only. Their menu explains this and offers no
  destructive actions.
- Removing a User folder moves its samples to the parent folder; it does not
  delete audio. Moving and renaming preserve sample asset identities.
- A sample's contextual menu moves it to an existing User folder or My Samples.
  Removing a sample from the visible library hides the entry; project clips
  and instruments retain their audio references.
- Search filters sample rows while preserving their folder context. Full paths
  are available as sample-row tooltips rather than repeated in the tree.

The hierarchy, selection, and folder expansion state are stored in browser
`localStorage` under `pulse-sample-library-v1`. User audio remains in the
existing IndexedDB asset store. Imported samples receive a SHA-256 fingerprint
for content deduplication; legacy User samples without one are fingerprinted
on demand when an import of the same byte length is checked. These are local
browser data, not a cloud backup.

## Importing files and ZIP packs

Use **＋ Files** for selected audio. Use **＋ Folder → Import Folder** to choose
a directory where the browser supports the File System Access API, or to use
the browser's directory-input fallback. Folder imports preserve nested paths
under the selected User folder. **＋ Folder → Import ZIP Pack** and the folder
context menu import nested ZIP content while preserving safe relative paths.
Supported audio suffixes are WAV, MP3, OGG, M4A, AAC and FLAC; actual decoding
support depends on the browser.

ZIP sample-pack checks reject traversal/absolute paths, duplicate entries,
encrypted or ZIP64 entries, unsupported compression methods, corrupt
checksums, excessive compression ratios and oversized archives before audio
is accepted. Current limits are 128 MiB compressed archive, 128 MiB total
uncompressed content, 4,096 entries, 100:1 maximum compression ratio and
64 MiB per audio file. Cancellation is checked between entries. The current
ZIP decoder still reads and extracts the bounded archive in memory; it is not
streaming and cannot be interrupted during its synchronous extraction step.

## Portability

Sample-library folder organization is separate from project data and is not
included in `.EHS`. A portable `.EHS` contains the audio assets referenced by
its project, not the browser's entire library tree. Use the existing `.EHS`
workflow to move a project and its referenced media to another origin.

## Acceptance status

The QA-01.3 UI refinement was exercised in source Chromium at 320px, 390px and
1280px and smoke-checked in the deterministic build at 390px. Browser checks
covered tree expansion, folder create/rename/move/remove, individual-file
import, nested directory import, nested ZIP import, search, preview,
insertion/Undo, duplicate ZIP re-import and reload persistence. The
directory-picker fallback was exercised with automation; physical-device
pickers, persistent filesystem permissions and touch hardware remain
uncertified. The portable-project and archive regression tests pass. See
[QA-01.3](./QA-01_3_REPORT.md).
