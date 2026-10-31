# Mobile Arrangement Gestures

## Selecting and editing a clip

1. Tap a clip to select it. Its action bar offers **Move**, **Trim**,
   **Duplicate** and **Delete**.
2. To move it without first changing modes, press and hold the clip body
   briefly, then drag. A floating preview follows the pointer across lanes and
   snaps to the current grid.
3. Alternatively, select **Move** and drag the clip body immediately.
4. Select **Trim** to activate the visible start/end handles. Drag either
   handle to resize the clip on the current grid. Dragging the start handle
   updates its source offset while retaining the opposite boundary.
5. Double-tap a clip to open its existing clip editor.

Only compatible track destinations are accepted. Rejected moves report an
error and do not silently change the clip's track.

## Zoom, scrolling and insertion

- Pinch with two fingers on the ruler, a clip, the loop control or a lane to
  zoom around the fingers' midpoint. Zoom is clamped to the existing 0.4x–4x
  range. The gesture is scoped to Arrangement; page zoom remains available
  elsewhere.
- Release commits one zoom change. Cancelling either pointer clears the
  preview and leaves the prior zoom unchanged.
- Drag on blank timeline space to use its normal scroll behavior. Clip bodies
  and resize handles reserve touch input for editing; use an empty lane when
  panning through time.
- **+** in Sample Browser inserts on the selected Audio track at the current
  playhead, snapped to the selected grid. An incompatible track is not changed.

Desktop drag/resize controls and the existing Arrangement data model remain
unchanged. These gestures do not create a second clip state or audio graph.

## Verification limits

The reported Chromium checks used emulated CDP touch input at 390x844. They
verify application handlers, not trusted physical touch, native scrolling on
every browser, mobile Safari behavior or Android/iOS device ergonomics. See
[the 5F.4 acceptance report](./BATCH_005B_5F_4_REPORT.md) for verified
gestures, test results and outstanding gates.

The 5F.5 source-app follow-up additionally verified explicit Move,
compatible/incompatible cross-track destinations, both trim handles,
Duplicate/Delete and their Undo/Redo behavior. The deterministic build verified
long-press movement, Undo/Redo and end trim. The QA-01.1 follow-up added source
Chromium checks for downward cross-track movement, pinch beginning on a clip
and ruler, and pinch cancellation over the loop. These are synthetic browser
results only. Pointer-cancellation physical behavior, lost capture, double-tap,
native scrolling at nonzero offsets and built-app pinch remain unaccepted; see
the [5F.5 report](./BATCH_005B_5F_5_REPORT.md) and
[QA-01.1 report](./QA-01_1_EXTENDED_REPORT.md).
