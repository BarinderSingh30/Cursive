# Phase 9a — Brushes & Strokes — Design

## Context

Phase 9 is the final phase: bringing the canvas closer to a real creative tool.
It's split into three ordered sub-phases (see `docs/ROADMAP.md`); this spec
covers only **9a**. 9b (layers, real multi-select) and 9c (gradients, shadows,
dash patterns, image import) are explicitly out of scope here.

Today, stroke color is set per-user via 5 fixed swatches in the toolbar and
only applied to freehand ("pen") strokes (`penColor` in
`client/src/canvas/tools/useActiveTool.tsx`). Stroke width is a hardcoded
constant (`DEFAULT_STROKE_WIDTH = 2` in `client/src/canvas/Stage.tsx`) for
every shape type. There is no opacity control, no brush variety, no eraser,
and no undo/redo.

## Goals

1. A drawing-options bar (color, stroke width, opacity) that applies to every
   shape tool (rectangle, ellipse, line, freehand, text) — not just pen
   strokes.
2. Brush presets for the freehand tool: pencil, marker, highlighter, eraser.
3. Stroke smoothing for freehand input.
4. Undo/redo via `Y.UndoManager`, scoped per-user.

## 1. Shared schema changes (`shared/src/canvas/`)

- `baseShapeSchema` (in `shapes.ts`) gains:
  ```ts
  opacity: z.number().min(0).max(1).default(1)
  ```
  Applies uniformly to every shape type via Konva's own `opacity` prop (one
  value covering stroke+fill together — splitting them apart is 9c's job).

- `freehandShapeSchema` gains:
  ```ts
  blendMode: z.enum(["normal", "multiply"]).default("normal")
  ```
  Only freehand shapes need this — it exists solely to support the
  highlighter preset's true multiply-blend look, rendered via Konva's
  `globalCompositeOperation`.

- `toolSchema` (in `tools.ts`) gains `"eraser"` as a real tool value, not just
  a style preset. Erasing has fundamentally different drag behavior
  (hit-test-and-delete/split against existing shapes) rather than drawing a
  new shape, so it needs its own entry in the tool state machine. It's
  presented to the user as one of four brush-preset buttons, but selecting it
  switches the active tool under the hood. Keyboard shortcut: `E`.

- Fill color (`fillColor` on rectangle/ellipse) is untouched by this phase —
  the options bar's color swatch only ever sets `strokeColor`, matching
  today's meaning of "pen colour."

## 2. Brush presets (client-only concept, no shared schema needed beyond the fields above)

Pencil/marker/highlighter are buttons that switch to the freehand tool and set
bundled default values in the drawing-options state:

| Preset | strokeWidth | opacity | blendMode |
|---|---|---|---|
| Pencil | 2 | 1.0 | normal |
| Marker | 6 | 1.0 | normal |
| Highlighter | 14 | 0.35 | multiply |

These are starting points, not locked values — the width/opacity sliders
remain adjustable after picking a preset. The mapping table itself lives in a
new `client/src/canvas/tools/brushPresets.ts` (client-only; the server/shared
layer only ever sees the resulting shape field values).

## 3. Drawing options bar

New component `client/src/canvas/tools/DrawingOptionsBar.tsx`, rendered as a
second, always-visible toolbar row beneath the existing tool-select pill
(replacing today's pen-colour-only group). Contains:

- **Color**: existing fixed swatches + a native `<input type="color">` swatch
  for free-form color choice.
- **Width**: a range slider with numeric readout.
- **Opacity**: a range slider (0–100%).
- **Brush presets**: 4 buttons (Pencil, Marker, Highlighter, Eraser), enabled
  only when the freehand or eraser tool is active.
- **Undo/Redo**: two buttons, disabled when there's nothing to undo/redo.

**Context-sensitive behavior**: if a shape is currently selected (select
tool), changing color/width/opacity restyles that shape live via
`onUpdateShape`. If nothing is selected, the same controls just set the
defaults used for the *next* shape drawn. This requires lifting `selectedId`
out of `Stage.tsx` and into `BoardExperience.tsx` (passed down to `Stage` as a
controlled prop instead of local state) so the options bar can read/act on
the current selection.

`useActiveTool.tsx`'s context grows from `{ tool, penColor }` to also carry
`strokeWidth`, `opacity`, and the brush-preset application helper. `penColor`
is conceptually renamed `strokeColor` at the same time (its meaning now spans
all shape types, not just the pen).

## 4. Stroke smoothing

Freehand shapes keep their existing representation: a flat `points` array
rendered as a Konva `Line` with `tension={0.4}`. No new geometry, no outline
polygons (ruled out — bigger rework, and would complicate eraser
segment-splitting significantly).

`Stage.tsx`'s freehand branch of `handleMouseMove` adds distance-based
sampling: a new point is only appended to the draft's `points` array if it's
at least `MIN_POINT_DISTANCE` (~4px) away from the last captured point. This
filters out mouse-jitter noise before it ever reaches the CRDT, while the
existing Konva `tension` continues to handle visual curve smoothing.

## 5. Eraser

While the eraser tool is active, dragging over the canvas does not create a
draft shape. Instead, on each pointer move, the pointer position is hit-tested
against existing shapes (via Konva's own hit graph, e.g.
`stage.getIntersection(pointer)` — reusing Konva's hit-testing rather than
reimplementing shape geometry). The eraser's touch radius reuses the
drawing-options bar's **width** value (no separate control needed).

- **Freehand strokes**: only the touched point range is removed.
  - If removing that range leaves two disjoint remaining point runs, the
    original shape is replaced — in one `doc.transact` — with two new shapes
    (fresh ids), and the original is deleted. Never sync a partial/half-split
    state.
  - If one run remains, the shape is updated in place with the trimmed
    `points`.
  - If no points remain, the shape is removed entirely.
- **Rectangle/ellipse/line/text**: the eraser deletes the whole shape on
  first touch — same effect as selecting it and pressing Delete today. These
  shape types have no meaningful notion of a "partial" erase.

Concurrent-edit note: if two collaborators erase near the same freehand
stroke at the same time, resolution happens at the `shapes` Y.Map level
(whichever transaction's delete/set lands last wins for that shape id) — the
same last-shape-wins-on-delete behavior `removeShape` already has today. This
is an accepted, pre-existing characteristic of the shape-level CRDT model,
not a new risk introduced by this phase.

## 6. Undo/redo

New hook `client/src/canvas/yjs/useUndoManager.ts` wraps `Y.UndoManager`:

- Scoped to the `shapes` Y.Map (`doc.getMap<YShape>("shapes")`, the same map
  `useYShapes` already reads).
- `trackedOrigins` set to a single local-only origin symbol
  (`LOCAL_ORIGIN`), used on every local mutation. This is what makes undo
  **per-user**: only transactions tagged with this client's own origin are
  ever undoable locally, so Ctrl+Z can never undo a collaborator's edit.
- `useYShapes`'s `addShape`, `updateShape`, and `removeShape` (plus the new
  eraser split logic in section 5) all wrap their Yjs mutations in
  `doc.transact(fn, LOCAL_ORIGIN)` instead of untagged transactions.
- Exposes `{ undo, redo, canUndo, canRedo }`, with `canUndo`/`canRedo` kept in
  React state, updated via the `UndoManager`'s `stack-item-added` /
  `stack-item-popped` events.
- Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo) — wired
  alongside the existing Delete/Escape keydown handling in `Stage.tsx`,
  respecting the same "ignore keystrokes while typing in an input" guard
  already in place there and in `Toolbar.tsx`.
- The Undo/Redo buttons in the drawing-options bar (section 3) call
  `undo`/`redo` directly and disable based on `canUndo`/`canRedo`.

## Testing

- **Vitest unit tests**:
  - Point-sampling helper (section 4): given a raw sequence of points,
    verify the sampled output respects `MIN_POINT_DISTANCE`.
  - Eraser split logic (section 5): given a freehand shape's `points` and an
    erased index range, verify the correct 0/1/2-shape outcome.
  - Brush-preset-to-style mapping (section 2).
- **`multiplayer-sim-tester` subagent pass**:
  - Two simulated clients drawing with different presets concurrently;
    confirm each client's undo only ever undoes its own last local action and
    never touches the other client's stroke.
  - Concurrent erasing near the same freehand stroke from two clients;
    confirm the doc converges to a valid (non-corrupted) state.
- **Manual browser walkthrough**: draw with each brush preset (verify the
  highlighter's visual multiply-blend), split a pen stroke with the eraser,
  delete a rectangle with the eraser, undo/redo a sequence of mixed actions,
  and confirm — across two browser tabs — that undoing in one tab never
  removes/reverts a stroke drawn in the other.
