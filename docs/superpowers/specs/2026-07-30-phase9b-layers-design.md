# Phase 9b — Layers: Design

## Goal

Replace today's flat, unordered shape list and single-selection model with:
a layers panel showing explicit z-order, grouping/ungrouping (flat, one level),
per-shape lock/hide, and real multi-select (shift-click and marquee).

This is the second of Phase 9's three ordered sub-phases (after 9a — Brushes &
strokes, before 9c — Object styling). See `docs/ROADMAP.md`.

## Current state (before this phase)

- Shapes live in a single `Y.Map<YShape>` keyed by id (`client/src/canvas/yjs/useYShapes.ts`),
  one `Y.Map` per shape so concurrent edits to different fields of the same
  shape both survive (the pattern this whole design continues).
- No ordering, group, lock, or hide concept exists. Render order is whatever
  `Y.Map.values()` iterates in.
- Selection is a single `selectedId: string | null` in `BoardExperience.tsx`,
  passed down to `Stage.tsx` and used by `DrawingOptionsBar` to know which
  shape's style controls to show.
- Every shape's `x`/`y` is a translation offset applied on top of its own
  geometry (`points` for line/freehand, `width`/`height` for rectangle, etc.),
  so a single `{x, y}` delta always moves a shape regardless of type — this is
  what makes bulk drag-move straightforward (Section: Selection & multi-select).
- Viewers (`role === "viewer"`) already have the Toolbar and DrawingOptionsBar
  hidden entirely (`Board.tsx`, `BoardExperience.tsx`); the layers panel
  follows the same gating.

## Data model

`shared/src/canvas/shapes.ts`'s `baseShapeSchema` gains three fields, present
on every shape type:

```ts
zIndex: z.number(),
locked: z.boolean().default(false),
groupId: z.string().nullable().default(null),
```

These are synced Yjs fields like `strokeColor`/`opacity` today — no new Yjs
structures, no new entities. `hiddenIds` (below) is the one exception: it is
deliberately **not** part of the shape schema because hide is local-only.

### zIndex (stacking order)

- Assigned on shape creation as `(current max zIndex across all shapes) + 1000`
  — new shapes render on top, matching today's implicit behavior.
- Canvas draw order (`Stage.tsx`) sorts `shapes` by `zIndex` ascending. The
  layers panel sorts descending (topmost first).
- Reordering (drag a panel row, or a front/back/forward/backward action)
  computes a new `zIndex` as the midpoint between the two neighbors at the
  target position. "To front" = `max + 1000`; "to back" = `min - 1000`. No
  other shape's `zIndex` changes.
- **Rebalancing safeguard**: `useYShapes`' reorder function checks the gap
  between the computed value and its neighbors; if it's below a small epsilon
  (float precision floor), it renumbers *all* shapes to evenly-spaced integers
  (preserving current order) in one transaction before computing the
  requested move. Invisible to the user; cheap at whiteboard scale.
- **Concurrent reorders**: two users moving different shapes into the same
  gap at the same instant both write (last-write-wins per shape's `zIndex`
  field — same semantics as every other shape property today). Worst case the
  two shapes tie and break on `id` string comparison, deterministically on
  every client. No corruption; self-heals on the next reorder.

### groupId (grouping)

- Flat only — a group cannot contain another group. (`groupId: string | null`
  on each member shape; no separate group registry/entity.)
- **Group**: available when 2+ shapes are selected. Generates
  `group-${crypto.randomUUID()}`, stamps it onto every selected shape's map in
  one transaction, and packs their `zIndex` values to be contiguous at the
  position of the topmost selected shape — a group always occupies one
  unbroken stacking range, which is what lets it render as a single row in
  the panel.
- **Ungroup**: clears `groupId` on every member of the selected group, in one
  transaction. Their existing relative z-order is preserved (no repacking
  needed — they're already contiguous).
- **Auto-dissolve**: whenever a shape is removed (delete key, bulk delete, or
  the eraser deleting a whole shape) and that removal drops its group to ≤1
  remaining member, the last member's `groupId` is cleared in the same
  transaction as the removal. No dangling single-shape "group."
- Clicking any member (canvas or panel) selects the whole group. Locking or
  hiding a group's panel row applies the action to every member individually
  (there is no group-level `locked`/hidden flag — see Lock and Hide below).

### locked (synced)

- A board-wide protection, not a personal view preference — locking a shape
  protects it from every collaborator, not just the person who locked it.
- A locked shape cannot be dragged, deleted, restyled (via the options bar),
  or swept into a marquee selection. It remains individually clickable (on
  canvas or via its panel row) so it can be selected and unlocked.
- Toggled from a lock icon on each layers-panel row. Toggling a group's row
  sets `locked` on every member individually (unlocking one member of a
  locked group just un-protects that shape — there's no group-level state to
  keep consistent).

### hiddenIds (local-only, not synced)

- Lives as `hiddenIds: Set<string>` in React state on `BoardExperience`, not
  in the Yjs doc. Two collaborators can have different shapes hidden from
  their own view at the same time — this is a personal declutter filter, not
  a shared board edit.
- Does not persist across reload (resets each session). Simplest option;
  revisit only if it's actually missed in practice.
- Hidden shapes are filtered out of the Konva render and out of
  marquee/selection, but still appear in the layers panel (dimmed, eye-off
  icon) so they can be un-hidden. A hidden shape cannot be selected or edited
  while hidden — only un-hidden (or deleted from the panel).

## Selection & multi-select

`BoardExperience`'s `selectedId: string | null` becomes `selectedIds: string[]`.
A new pure helper (unit-testable, shared by `Stage.tsx` and the layers panel
so canvas clicks and panel clicks behave identically) resolves what a
click/shift-click/marquee does to the current selection:

- **Plain click** on a shape → replaces selection with just that shape (or,
  if it belongs to a group, the whole group's member ids).
- **Shift-click** on a shape → toggles that shape (or its whole group) in the
  current selection.
- **Click on empty canvas** → clears selection (unchanged from today).
- **Marquee**: mousedown-drag starting on empty canvas with the Select tool
  active draws a drag rectangle; on mouseup, selects every shape whose
  bounding box **intersects** the rectangle (not full-containment), excluding
  locked shapes and locally-hidden shapes. Plain marquee replaces the
  selection; shift+marquee adds to it.
- **Bulk drag-move**: dragging any one selected shape translates every
  selected shape by the same `{x, y}` delta, applied in a single Yjs
  transaction on drag end.
- **Bulk delete**: Delete/Backspace removes every selected, unlocked shape.
- **Bulk restyle**: `DrawingOptionsBar` reads `selectedShapes: Shape[]`
  instead of a single shape. Its color/width/opacity controls display the
  **first** selected shape's current values; changing a control applies that
  value to every selected, unlocked shape in one transaction. Mixed-value
  display ("multiple values" indicator) is out of scope.

## Layers panel

New `client/src/canvas/layers/LayersPanel.tsx`. One row per shape, or one row
per group (showing a member count, expandable to show members indented one
level — flat grouping only). Rows sorted topmost-first (descending `zIndex`).

Each row: type icon, auto-generated label (e.g. "Rectangle", "Freehand",
"Group (3)" — no editable names), lock toggle, hide toggle, a drag handle for
reordering, and click/shift-click to select (mirrors canvas selection
exactly, via the same helper). A hover/right-click affordance exposes
bring-to-front / send-to-back / forward / backward as a faster path than
dragging for the common one-step case.

Hidden entirely for the viewer role, same as the Toolbar and
DrawingOptionsBar. Exact placement (which side of the canvas) and visual
styling are left to the `ui-ux-designer` subagent during implementation —
this spec fixes behavior, not pixels.

All new mutation logic (reorder, group, ungroup, lock) is added as new
exported functions on the existing `useYShapes` hook — `reorderShape`,
`groupShapes`, `ungroupShapes`, `setLocked` — rather than a parallel hook, so
every Yjs transaction touching the shapes map stays in one place.

## Authorization

No new authorization surface: reorder/group/ungroup/lock are all writes to
the same Yjs shapes map that `boardAccess.ts` already gates at the Hocuspocus
sync connection. A viewer role is already rejected for any write to that map
today; this phase needs that behavior re-verified against the new operations,
not re-implemented.

## Testing & verification

Following this project's existing convention (Vitest, pure-function unit
tests colocated next to the module — see `eraser.test.ts`,
`pointSampling.test.ts`, `brushPresets.test.ts` — plus hook tests like
`useYShapes.test.ts`):

- **Pure logic, unit-tested directly:**
  - Fractional `zIndex` math (midpoint calc, front/back, rebalance-on-precision-limit).
  - Marquee bounding-box intersection test, per shape type.
  - Selection-resolution helper (plain click / shift-click / group expansion).
  - Group auto-dissolve rule.
- **`useYShapes` hook tests** (extending the existing test file):
  `reorderShape`, `groupShapes`, `ungroupShapes`, `setLocked` — same style as
  the current `addShape`/`updateShape`/`splitShape` tests.
- **`multiplayer-sim-tester` subagent** (standing pattern for every phase
  touching sync): verify over real concurrent Hocuspocus connections that
  (a) two clients reordering different shapes at once converge to a
  consistent stacking order with no lost shapes, (b) two clients grouping
  overlapping selections at once converge without a corrupted/partial group,
  (c) a viewer-role connection's attempt to reorder/group/lock is rejected
  server-side.
- **Manual browser walkthrough**: multi-select via shift-click and marquee,
  bulk move/delete/restyle, group/ungroup, lock (drag/delete/restyle blocked,
  marquee skips it), hide (local-only — confirm a second tab still sees the
  shape), drag-to-reorder in the panel, front/back buttons, two-tab check
  that reordering/grouping/locking sync while hide does not.

## Edge cases explicitly handled

- A group dropping to ≤1 member auto-dissolves (clears the last member's `groupId`).
- `zIndex` gap exhaustion triggers a one-time rebalance transaction.
- A locked shape inside a marquee rectangle is skipped, not selected.
- Deleting a shape that's the last *visible* member of an otherwise
  locally-hidden group still runs the same auto-dissolve rule (hide is
  local, so this is evaluated against the real Yjs group membership, not the
  hiding user's filtered view).
- Unlocking one shape inside a locked group only unlocks that shape — lock is
  purely per-shape, so a group has no "all locked" state to keep consistent.

## Explicitly out of scope (YAGNI)

- Nested groups (groups containing groups).
- Editable layer names.
- Shared/synced hide (hide is local-only per the design above).
- Mixed-value indication in the options bar during bulk restyle.
- Persisting `hiddenIds` across reloads.
