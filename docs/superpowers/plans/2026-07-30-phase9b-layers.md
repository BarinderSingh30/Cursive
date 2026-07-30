# Phase 9b — Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit z-ordering, flat grouping/ungrouping, per-shape lock (synced), per-user hide (local-only), and real multi-select (shift-click + marquee) to the whiteboard, plus a layers panel to drive all of it — replacing today's flat unordered shape list and single-selection model.

**Architecture:** Three new fields (`zIndex`, `locked`, `groupId`) join every shape's existing `Y.Map`, so they sync via the same per-field CRDT merge as `strokeColor`/`opacity` today — no new Yjs structures. All new mutations (reorder, group, ungroup, lock, bulk move, bulk restyle, bulk delete) are added as new exported functions on the existing `useYShapes` hook, each wrapped in one `doc.transact(..., LOCAL_ORIGIN)`. Selection becomes an array (`selectedIds`) instead of a single id. Hide is plain React state, never touching Yjs.

**Tech Stack:** React + TypeScript, Konva/`react-konva`, Yjs, Zod, Vitest + `@testing-library/react`.

## Global Constraints

- Every shape mutation must go through a `doc.transact(fn, LOCAL_ORIGIN)` call (from `client/src/canvas/yjs/localOrigin.ts`) so per-user undo/redo (`useUndoManager.ts`) keeps working — never call `Y.Map.set`/`.delete` outside a tagged transaction.
- Hide state (`hiddenIds`) must never be written to the Yjs doc — it is local-only per the approved spec.
- `locked` is synced and must block: drag, Delete key, options-bar restyle, eraser, and marquee selection — but never block clicking the shape directly (on canvas or in the panel) to select/unlock it.
- Groups are flat only — no group may contain another group.
- No editable layer names, no mixed-value indicator in the options bar, no persistence of `hiddenIds` across reload — all explicitly out of scope per the spec.
- Follow existing test conventions: Vitest, pure-function tests colocated as `*.test.ts` next to the module (see `eraser.test.ts`, `pointSampling.test.ts`), hook tests in the style of `useYShapes.test.ts`.
- Full spec: `docs/superpowers/specs/2026-07-30-phase9b-layers-design.md`.

---

## File Structure

**Create:**
- `client/src/canvas/tools/zOrder.ts` + `zOrder.test.ts` — pure z-order math (sort, next zIndex, contiguous packing for groups).
- `client/src/canvas/selection/boundingBox.ts` + `boundingBox.test.ts` — per-shape-type bounding box + rectangle intersection.
- `client/src/canvas/selection/selection.ts` + `selection.test.ts` — click/shift-click/marquee selection resolution.
- `client/src/canvas/layers/layerRows.ts` + `layerRows.test.ts` — builds the layers panel's row list (shapes + collapsed groups) and computes the minimal zIndex reassignment for a row reorder (falling back to a full rebalance only when precision is exhausted).
- `client/src/canvas/layers/LayersPanel.tsx` + `LayersPanel.module.css` — the panel UI.

**Modify:**
- `shared/src/canvas/shapes.ts` — add `zIndex`, `locked`, `groupId` to `baseShapeSchema`.
- `client/src/canvas/yjs/useYShapes.ts` + `useYShapes.test.ts` — auto-assign `zIndex` on create; add `moveShapes`, `updateShapes`, `removeShapes` (bulk, with group auto-dissolve), `reorderShapes`, `groupShapes`, `ungroupShapes`, `setLocked`.
- `client/src/canvas/Stage.tsx` — multi-select (`selectedIds`), marquee drag, bulk move on drag-end, render order by `zIndex`, locked shapes non-draggable/eraser-proof, new shape-creation literals get the 3 new fields.
- `client/src/canvas/shapes/ShapeInteraction.ts` — `onClick` signature gains the Konva event (for `shiftKey`).
- `client/src/canvas/BoardExperience.tsx` + `BoardExperience.module.css` — `selectedIds`/`hiddenIds` state, bulk restyle wiring, visible-shapes filtering, mounts `LayersPanel`.

---

### Task 1: Shape schema gains zIndex, locked, groupId

**Files:**
- Modify: `shared/src/canvas/shapes.ts:3-11`
- Modify: `client/src/canvas/yjs/useYShapes.test.ts:8-23`

**Interfaces:**
- Produces: `Shape.zIndex: number`, `Shape.locked: boolean`, `Shape.groupId: string | null` — every later task relies on these three fields existing on every shape type.

- [ ] **Step 1: Update the schema**

In `shared/src/canvas/shapes.ts`, change `baseShapeSchema`:

```ts
const baseShapeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  strokeColor: z.string(),
  strokeWidth: z.number(),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number(),
  locked: z.boolean().default(false),
  groupId: z.string().nullable().default(null),
});
```

- [ ] **Step 2: Update the `useYShapes.test.ts` fixture so the suite still compiles**

```ts
function makeRectangle(overrides: Partial<RectangleShape> = {}): RectangleShape {
  return {
    id: "shape-1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    strokeColor: "#000000",
    strokeWidth: 2,
    opacity: 1,
    fillColor: null,
    zIndex: 1000,
    locked: false,
    groupId: null,
    ...overrides,
  };
}
```

- [ ] **Step 3: Run the client test suite and confirm it still typechecks and passes**

Run: `npm run test --workspace client`
Expected: PASS (the two existing `useYShapes` tests still pass; no other test file constructs a shape literal, so nothing else breaks).

- [ ] **Step 4: Commit**

```bash
git add shared/src/canvas/shapes.ts client/src/canvas/yjs/useYShapes.test.ts
git commit -m "Add zIndex, locked, groupId fields to the shape schema"
```

---

### Task 2: z-order pure helpers (`zOrder.ts`)

**Files:**
- Create: `client/src/canvas/tools/zOrder.ts`
- Create: `client/src/canvas/tools/zOrder.test.ts`

**Interfaces:**
- Consumes: `Shape` (from `@cursive/shared`), each with `.zIndex: number`, `.id: string`.
- Produces: `sortByZIndexAscending(shapes: Shape[]): Shape[]`, `sortByZIndexDescending(shapes: Shape[]): Shape[]`, `nextZIndex(shapes: Shape[]): number`, `packContiguous(members: Shape[], topZIndex: number): Map<string, number>` — consumed by Task 6 (`useYShapes`) and Task 7 (`Stage.tsx` render order).

- [ ] **Step 1: Write the failing tests**

```ts
// client/src/canvas/tools/zOrder.test.ts
import { describe, expect, it } from "vitest";
import type { RectangleShape } from "@cursive/shared";
import { nextZIndex, packContiguous, sortByZIndexAscending, sortByZIndexDescending } from "./zOrder.js";

function rect(id: string, zIndex: number): RectangleShape {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    strokeColor: "#000",
    strokeWidth: 1,
    opacity: 1,
    fillColor: null,
    zIndex,
    locked: false,
    groupId: null,
  };
}

describe("sortByZIndexAscending / sortByZIndexDescending", () => {
  it("orders shapes by zIndex, breaking ties on id", () => {
    const shapes = [rect("b", 5), rect("a", 5), rect("c", 1)];
    expect(sortByZIndexAscending(shapes).map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(sortByZIndexDescending(shapes).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});

describe("nextZIndex", () => {
  it("returns 1000 for an empty board", () => {
    expect(nextZIndex([])).toBe(1000);
  });

  it("returns the current max plus 1000", () => {
    expect(nextZIndex([rect("a", 500), rect("b", 3000)])).toBe(4000);
  });
});

describe("packContiguous", () => {
  it("assigns descending integer zIndexes starting at topZIndex, preserving each member's relative order", () => {
    const members = [rect("a", 10), rect("b", 30), rect("c", 20)];
    const assignments = packContiguous(members, 100);
    expect(assignments.get("b")).toBe(100);
    expect(assignments.get("c")).toBe(99);
    expect(assignments.get("a")).toBe(98);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace client -- zOrder`
Expected: FAIL with "Cannot find module './zOrder.js'"

- [ ] **Step 3: Implement**

```ts
// client/src/canvas/tools/zOrder.ts
import type { Shape } from "@cursive/shared";

const INITIAL_GAP = 1000;

export function sortByZIndexAscending(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
}

export function sortByZIndexDescending(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id));
}

/** Where a newly-created shape lands: on top of everything else. */
export function nextZIndex(shapes: Shape[]): number {
  if (shapes.length === 0) return INITIAL_GAP;
  return Math.max(...shapes.map((s) => s.zIndex)) + INITIAL_GAP;
}

/**
 * Assigns each member a descending integer zIndex starting at topZIndex,
 * preserving their existing relative order — used when grouping shapes so
 * the group occupies one contiguous stacking range (with 1000-unit gaps
 * around it, a foreign shape landing exactly on one of these integers is
 * astronomically unlikely at whiteboard scale).
 */
export function packContiguous(members: Shape[], topZIndex: number): Map<string, number> {
  const sorted = sortByZIndexDescending(members);
  const assignments = new Map<string, number>();
  sorted.forEach((member, i) => assignments.set(member.id, topZIndex - i));
  return assignments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace client -- zOrder`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/tools/zOrder.ts client/src/canvas/tools/zOrder.test.ts
git commit -m "Add z-order pure helpers for shape creation and grouping"
```

---

### Task 3: Bounding box + intersection (`boundingBox.ts`)

**Files:**
- Create: `client/src/canvas/selection/boundingBox.ts`
- Create: `client/src/canvas/selection/boundingBox.test.ts`

**Interfaces:**
- Consumes: `Shape` (from `@cursive/shared`).
- Produces: `Box { x1, y1, x2, y2 }`, `boundingBox(shape: Shape): Box`, `rectsIntersect(a: Box, b: Box): boolean` — consumed by Task 4 (`selection.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// client/src/canvas/selection/boundingBox.test.ts
import { describe, expect, it } from "vitest";
import type { EllipseShape, FreehandShape, RectangleShape, TextShape } from "@cursive/shared";
import { boundingBox, rectsIntersect } from "./boundingBox.js";

const base = {
  rotation: 0,
  strokeColor: "#000",
  strokeWidth: 1,
  opacity: 1,
  zIndex: 1000,
  locked: false,
  groupId: null,
};

describe("boundingBox", () => {
  it("handles a rectangle drawn with negative width/height", () => {
    const shape: RectangleShape = { ...base, id: "r", type: "rectangle", x: 10, y: 10, width: -5, height: -5, fillColor: null };
    expect(boundingBox(shape)).toEqual({ x1: 5, y1: 5, x2: 10, y2: 10 });
  });

  it("handles an ellipse centered at x,y", () => {
    const shape: EllipseShape = { ...base, id: "e", type: "ellipse", x: 0, y: 0, radiusX: 4, radiusY: 2, fillColor: null };
    expect(boundingBox(shape)).toEqual({ x1: -4, y1: -2, x2: 4, y2: 2 });
  });

  it("handles freehand points offset by x,y", () => {
    const shape: FreehandShape = { ...base, id: "f", type: "freehand", x: 100, y: 100, points: [0, 0, 10, 5, -2, 8], blendMode: "normal" };
    expect(boundingBox(shape)).toEqual({ x1: 98, y1: 100, x2: 110, y2: 108 });
  });

  it("approximates a text shape's box from font size and text length", () => {
    const shape: TextShape = { ...base, id: "t", type: "text", x: 0, y: 0, text: "hi", fontSize: 10, fillColor: "#000" };
    expect(boundingBox(shape)).toEqual({ x1: 0, y1: 0, x2: 12, y2: 12 });
  });
});

describe("rectsIntersect", () => {
  it("is true when boxes overlap", () => {
    expect(rectsIntersect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 5, y1: 5, x2: 15, y2: 15 })).toBe(true);
  });

  it("is true when boxes only touch at an edge", () => {
    expect(rectsIntersect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 10, y1: 0, x2: 20, y2: 10 })).toBe(true);
  });

  it("is false when boxes are disjoint", () => {
    expect(rectsIntersect({ x1: 0, y1: 0, x2: 10, y2: 10 }, { x1: 11, y1: 11, x2: 20, y2: 20 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace client -- boundingBox`
Expected: FAIL with "Cannot find module './boundingBox.js'"

- [ ] **Step 3: Implement**

```ts
// client/src/canvas/selection/boundingBox.ts
import type { Shape } from "@cursive/shared";

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Approximate axis-aligned bounding box in stage coordinates, ignoring
 * rotation — consistent with this codebase's existing degenerate-shape
 * checks (Stage.tsx's isDegenerate), which also ignore rotation for the
 * same reason: simple, testable geometry beats pixel-perfect precision for
 * a selection/marquee test.
 */
export function boundingBox(shape: Shape): Box {
  switch (shape.type) {
    case "rectangle": {
      const x1 = Math.min(shape.x, shape.x + shape.width);
      const x2 = Math.max(shape.x, shape.x + shape.width);
      const y1 = Math.min(shape.y, shape.y + shape.height);
      const y2 = Math.max(shape.y, shape.y + shape.height);
      return { x1, y1, x2, y2 };
    }
    case "ellipse":
      return {
        x1: shape.x - shape.radiusX,
        y1: shape.y - shape.radiusY,
        x2: shape.x + shape.radiusX,
        y2: shape.y + shape.radiusY,
      };
    case "line":
    case "freehand": {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      return {
        x1: shape.x + Math.min(...xs),
        y1: shape.y + Math.min(...ys),
        x2: shape.x + Math.max(...xs),
        y2: shape.y + Math.max(...ys),
      };
    }
    case "text": {
      const width = shape.fontSize * 0.6 * shape.text.length;
      const height = shape.fontSize * 1.2;
      return { x1: shape.x, y1: shape.y, x2: shape.x + width, y2: shape.y + height };
    }
  }
}

export function rectsIntersect(a: Box, b: Box): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace client -- boundingBox`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/selection/boundingBox.ts client/src/canvas/selection/boundingBox.test.ts
git commit -m "Add per-shape bounding box and rectangle intersection helpers"
```

---

### Task 4: Selection resolution (`selection.ts`)

**Files:**
- Create: `client/src/canvas/selection/selection.ts`
- Create: `client/src/canvas/selection/selection.test.ts`

**Interfaces:**
- Consumes: `Shape` (from `@cursive/shared`), `Box`/`boundingBox`/`rectsIntersect` (from `./boundingBox.js`).
- Produces: `expandToGroup(shapes, id): string[]`, `toggleSelection(ids, currentSelection, shiftKey): string[]`, `resolveClickSelection(shapes, clickedId, currentSelection, shiftKey): string[]`, `shapesInMarquee(shapes, marquee): string[]` — consumed by Task 7 (`Stage.tsx`) and Task 9 (`LayersPanel.tsx`, via `toggleSelection`).

- [ ] **Step 1: Write the failing tests**

```ts
// client/src/canvas/selection/selection.test.ts
import { describe, expect, it } from "vitest";
import type { RectangleShape } from "@cursive/shared";
import { expandToGroup, resolveClickSelection, shapesInMarquee, toggleSelection } from "./selection.js";

function rect(overrides: Partial<RectangleShape> & { id: string }): RectangleShape {
  return {
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    strokeColor: "#000",
    strokeWidth: 1,
    opacity: 1,
    zIndex: 1000,
    locked: false,
    groupId: null,
    fillColor: null,
    ...overrides,
  };
}

describe("expandToGroup", () => {
  it("returns just the shape's id when it has no group", () => {
    const shapes = [rect({ id: "a" })];
    expect(expandToGroup(shapes, "a")).toEqual(["a"]);
  });

  it("returns every member's id when the shape belongs to a group", () => {
    const shapes = [rect({ id: "a", groupId: "g1" }), rect({ id: "b", groupId: "g1" }), rect({ id: "c" })];
    expect(expandToGroup(shapes, "a").sort()).toEqual(["a", "b"]);
  });
});

describe("toggleSelection", () => {
  it("replaces the selection without shift", () => {
    expect(toggleSelection(["a"], ["x", "y"], false)).toEqual(["a"]);
  });

  it("adds to the selection with shift when not already selected", () => {
    expect(toggleSelection(["a"], ["x"], true)).toEqual(["x", "a"]);
  });

  it("removes from the selection with shift when already selected", () => {
    expect(toggleSelection(["a"], ["x", "a"], true)).toEqual(["x"]);
  });
});

describe("resolveClickSelection", () => {
  it("expands a grouped shape's click to the whole group before toggling", () => {
    const shapes = [rect({ id: "a", groupId: "g1" }), rect({ id: "b", groupId: "g1" })];
    expect(resolveClickSelection(shapes, "a", [], false).sort()).toEqual(["a", "b"]);
  });
});

describe("shapesInMarquee", () => {
  const shapes = [
    rect({ id: "inside", x: 0, y: 0 }),
    rect({ id: "outside", x: 1000, y: 1000 }),
    rect({ id: "locked-inside", x: 0, y: 0, locked: true }),
  ];

  it("selects only unlocked shapes intersecting the marquee", () => {
    const marquee = { x1: -5, y1: -5, x2: 5, y2: 5 };
    expect(shapesInMarquee(shapes, marquee)).toEqual(["inside"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace client -- selection.test`
Expected: FAIL with "Cannot find module './selection.js'"

- [ ] **Step 3: Implement**

```ts
// client/src/canvas/selection/selection.ts
import type { Shape } from "@cursive/shared";
import { boundingBox, rectsIntersect, type Box } from "./boundingBox.js";

/** Clicking a grouped shape selects the whole group; an ungrouped shape selects just itself. */
export function expandToGroup(shapes: Shape[], id: string): string[] {
  const shape = shapes.find((s) => s.id === id);
  if (!shape || !shape.groupId) return [id];
  return shapes.filter((s) => s.groupId === shape.groupId).map((s) => s.id);
}

export function toggleSelection(ids: string[], currentSelection: string[], shiftKey: boolean): string[] {
  if (!shiftKey) return ids;
  const isAlreadySelected = ids.some((id) => currentSelection.includes(id));
  if (isAlreadySelected) return currentSelection.filter((id) => !ids.includes(id));
  return [...currentSelection, ...ids.filter((id) => !currentSelection.includes(id))];
}

export function resolveClickSelection(
  shapes: Shape[],
  clickedId: string,
  currentSelection: string[],
  shiftKey: boolean,
): string[] {
  return toggleSelection(expandToGroup(shapes, clickedId), currentSelection, shiftKey);
}

/** Shapes whose bounding box intersects the marquee rectangle, excluding locked shapes. Hidden shapes never reach this function — they're filtered out of the `shapes` array before it gets here (BoardExperience.tsx). */
export function shapesInMarquee(shapes: Shape[], marquee: Box): string[] {
  return shapes.filter((s) => !s.locked && rectsIntersect(boundingBox(s), marquee)).map((s) => s.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace client -- selection.test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/selection/selection.ts client/src/canvas/selection/selection.test.ts
git commit -m "Add click/shift-click/marquee selection resolution helpers"
```

---

### Task 5: Layers panel rows and reorder (`layerRows.ts`)

**Files:**
- Create: `client/src/canvas/layers/layerRows.ts`
- Create: `client/src/canvas/layers/layerRows.test.ts`

**Interfaces:**
- Consumes: `Shape` (from `@cursive/shared`), `sortByZIndexDescending` (from `../tools/zOrder.js`).
- Produces: `LayerRow { key: string; kind: "shape" | "group"; label: string; shapeIds: string[]; locked: boolean; topZIndex: number; bottomZIndex: number }`, `buildLayerRows(shapes: Shape[]): LayerRow[]`, `reorderRows(rows: LayerRow[], movingKey: string, targetIndex: number): Map<string, number>`, `labelForShape(shape: Shape): string` (exported so Task 9 can label a group's individual members when expanded) — consumed by Task 9 (`LayersPanel.tsx`) and Task 8 (`BoardExperience.tsx`'s reorder handler).

- [ ] **Step 1: Write the failing tests**

```ts
// client/src/canvas/layers/layerRows.test.ts
import { describe, expect, it } from "vitest";
import type { RectangleShape } from "@cursive/shared";
import { buildLayerRows, reorderRows } from "./layerRows.js";

function rect(overrides: Partial<RectangleShape> & { id: string; zIndex: number }): RectangleShape {
  return {
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    strokeColor: "#000",
    strokeWidth: 1,
    opacity: 1,
    locked: false,
    groupId: null,
    fillColor: null,
    ...overrides,
  };
}

describe("buildLayerRows", () => {
  it("lists ungrouped shapes topmost-first, one row each", () => {
    const shapes = [rect({ id: "a", zIndex: 100 }), rect({ id: "b", zIndex: 200 })];
    const rows = buildLayerRows(shapes);
    expect(rows.map((r) => r.key)).toEqual(["b", "a"]);
    expect(rows[0]!.kind).toBe("shape");
  });

  it("collapses a group into a single row at its topmost member's position", () => {
    const shapes = [
      rect({ id: "a", zIndex: 300, groupId: "g1" }),
      rect({ id: "b", zIndex: 200 }),
      rect({ id: "c", zIndex: 100, groupId: "g1" }),
    ];
    const rows = buildLayerRows(shapes);
    expect(rows.map((r) => r.key)).toEqual(["group:g1", "b"]);
    expect(rows[0]!.shapeIds.sort()).toEqual(["a", "c"]);
    expect(rows[0]!.label).toBe("Group (2)");
  });

  it("marks a group row locked only when every member is locked", () => {
    const shapes = [
      rect({ id: "a", zIndex: 200, groupId: "g1", locked: true }),
      rect({ id: "b", zIndex: 100, groupId: "g1", locked: false }),
    ];
    expect(buildLayerRows(shapes)[0]!.locked).toBe(false);
  });
});

describe("reorderRows", () => {
  it("moves a single-shape row to the front, touching only that shape's zIndex", () => {
    const shapes = [rect({ id: "a", zIndex: 300 }), rect({ id: "b", zIndex: 200 }), rect({ id: "c", zIndex: 100 })];
    const rows = buildLayerRows(shapes); // ["a", "b", "c"]
    const assignments = reorderRows(rows, "c", 0);
    expect(assignments.size).toBe(1);
    expect(assignments.get("c")!).toBeGreaterThan(300);
  });

  it("keeps a group's members contiguous, in relative order, touching only their zIndex", () => {
    const shapes = [
      rect({ id: "a", zIndex: 300, groupId: "g1" }),
      rect({ id: "b", zIndex: 200 }),
      rect({ id: "c", zIndex: 100, groupId: "g1" }),
    ];
    const rows = buildLayerRows(shapes); // ["group:g1" (a top, c bottom), "b"]
    const assignments = reorderRows(rows, "group:g1", 1); // move group below "b"
    expect([...assignments.keys()].sort()).toEqual(["a", "c"]);
    expect(assignments.get("a")!).toBeLessThan(200);
    expect(assignments.get("a")!).toBeGreaterThan(assignments.get("c")!);
  });

  it("falls back to a full rebalance only when the neighboring gap is too small for the move", () => {
    const shapes = [
      rect({ id: "a", zIndex: 3 }),
      rect({ id: "b", zIndex: 1.0000001 }),
      rect({ id: "c", zIndex: 1 }),
      rect({ id: "d", zIndex: 0 }),
    ];
    const rows = buildLayerRows(shapes); // ["a", "b", "c", "d"]
    const assignments = reorderRows(rows, "d", 2); // squeeze "d" between "b" and "c" — gap is 1e-7
    expect(assignments.size).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace client -- layerRows`
Expected: FAIL with "Cannot find module './layerRows.js'"

- [ ] **Step 3: Implement**

```ts
// client/src/canvas/layers/layerRows.ts
import type { Shape } from "@cursive/shared";
import { sortByZIndexDescending } from "../tools/zOrder.js";

export interface LayerRow {
  key: string;
  kind: "shape" | "group";
  label: string;
  /** Sorted topmost-first within the row. */
  shapeIds: string[];
  locked: boolean;
  /** The highest zIndex among this row's shape(s). */
  topZIndex: number;
  /** The lowest zIndex among this row's shape(s) (equals topZIndex for a plain shape row). */
  bottomZIndex: number;
}

const INITIAL_GAP = 1000;
const MIN_GAP = 1e-6;

export function labelForShape(shape: Shape): string {
  switch (shape.type) {
    case "rectangle":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "line":
      return "Line";
    case "freehand":
      return "Freehand";
    case "text":
      return "Text";
  }
}

/** Topmost-first row list: one row per ungrouped shape, one row per group (collapsing its members). */
export function buildLayerRows(shapes: Shape[]): LayerRow[] {
  const ordered = sortByZIndexDescending(shapes);
  const rows: LayerRow[] = [];
  const seenGroups = new Set<string>();

  for (const shape of ordered) {
    if (shape.groupId) {
      if (seenGroups.has(shape.groupId)) continue;
      seenGroups.add(shape.groupId);
      const members = sortByZIndexDescending(shapes.filter((s) => s.groupId === shape.groupId));
      rows.push({
        key: `group:${shape.groupId}`,
        kind: "group",
        label: `Group (${members.length})`,
        shapeIds: members.map((m) => m.id),
        locked: members.every((m) => m.locked),
        topZIndex: members[0]!.zIndex,
        bottomZIndex: members[members.length - 1]!.zIndex,
      });
    } else {
      rows.push({
        key: shape.id,
        kind: "shape",
        label: labelForShape(shape),
        shapeIds: [shape.id],
        locked: shape.locked,
        topZIndex: shape.zIndex,
        bottomZIndex: shape.zIndex,
      });
    }
  }
  return rows;
}

/**
 * Moves the row identified by `movingKey` to `targetIndex` and returns a new
 * zIndex for *only* that row's shape(s) — squeezed via fractional midpoint
 * math into the gap between its new neighbors, mirroring the single-shape
 * zIndex scheme from Task 2's `nextZIndex`. This keeps a reorder's write
 * footprint minimal: two people reordering different, unrelated shapes at
 * the same moment never touch each other's shapes' zIndex fields, matching
 * the spec's concurrency model. Falls back to renumbering every shape in
 * the new order only when the neighboring gap has shrunk below floating
 * point precision — the same rare-case safeguard the spec calls for.
 */
export function reorderRows(rows: LayerRow[], movingKey: string, targetIndex: number): Map<string, number> {
  const moving = rows.find((r) => r.key === movingKey);
  if (!moving) return new Map();
  const count = moving.shapeIds.length;

  const withoutMoving = rows.filter((r) => r.key !== movingKey);
  const clampedIndex = Math.max(0, Math.min(targetIndex, withoutMoving.length));
  const above = withoutMoving[clampedIndex - 1] ?? null;
  const below = withoutMoving[clampedIndex] ?? null;

  const aboveEdge = above ? above.bottomZIndex : null;
  const belowEdge = below ? below.topZIndex : null;

  const gapTooSmall = aboveEdge !== null && belowEdge !== null && aboveEdge - belowEdge < (count + 1) * MIN_GAP;

  if (gapTooSmall) {
    const newOrder = [...withoutMoving.slice(0, clampedIndex), moving, ...withoutMoving.slice(clampedIndex)];
    const assignments = new Map<string, number>();
    let z = newOrder.length * INITIAL_GAP;
    for (const row of newOrder) {
      for (const id of row.shapeIds) {
        assignments.set(id, z);
        z -= INITIAL_GAP;
      }
    }
    return assignments;
  }

  const assignments = new Map<string, number>();
  if (aboveEdge === null && belowEdge === null) {
    moving.shapeIds.forEach((id, i) => assignments.set(id, (count - i) * INITIAL_GAP));
  } else if (aboveEdge === null) {
    moving.shapeIds.forEach((id, i) => assignments.set(id, belowEdge! + (count - i) * INITIAL_GAP));
  } else if (belowEdge === null) {
    moving.shapeIds.forEach((id, i) => assignments.set(id, aboveEdge - (i + 1) * INITIAL_GAP));
  } else {
    const step = (aboveEdge - belowEdge) / (count + 1);
    moving.shapeIds.forEach((id, i) => assignments.set(id, aboveEdge - step * (i + 1)));
  }
  return assignments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace client -- layerRows`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/layers/layerRows.ts client/src/canvas/layers/layerRows.test.ts
git commit -m "Add layers panel row builder and minimal-touch reorder reassignment"
```

---

### Task 6: Extend `useYShapes` with bulk/z-order/group/lock operations

**Files:**
- Modify: `client/src/canvas/yjs/useYShapes.ts`
- Modify: `client/src/canvas/yjs/useYShapes.test.ts`

**Interfaces:**
- Consumes: `nextZIndex`, `packContiguous` (from `../tools/zOrder.js`).
- Produces (added to `useYShapes`'s return value): `moveShapes(moves: { id: string; x: number; y: number }[]): void`, `updateShapes(updates: { id: string; changes: Partial<Shape> }[]): void`, `removeShapes(ids: string[]): void`, `reorderShapes(assignments: Map<string, number>): void`, `groupShapes(ids: string[]): string`, `ungroupShapes(groupId: string): void`, `setLocked(ids: string[], locked: boolean): void`. `removeShape(id)` becomes a thin wrapper over `removeShapes([id])`. `addShape` now assigns `zIndex` itself via `nextZIndex`, ignoring whatever the caller passed for that field.

- [ ] **Step 1: Write the failing tests**

Append to `client/src/canvas/yjs/useYShapes.test.ts` (keep the existing `makeRectangle` helper and its two existing tests from Task 1):

```ts
  it("addShape assigns zIndex above the current max, ignoring any zIndex the caller passed", () => {
    const doc = new Y.Doc();
    const { result } = renderHook(() => useYShapes(doc));

    act(() => result.current.addShape(makeRectangle({ id: "shape-1", zIndex: 999999 })));
    act(() => result.current.addShape(makeRectangle({ id: "shape-2", zIndex: 1 })));

    const [first, second] = result.current.shapes.sort((a, b) => a.id.localeCompare(b.id));
    expect(first!.zIndex).toBe(1000);
    expect(second!.zIndex).toBe(2000);
  });

  it("moveShapes translates multiple shapes in one transaction and skips locked ones", () => {
    const doc = new Y.Doc();
    let transactionCount = 0;
    doc.on("afterTransaction", () => (transactionCount += 1));

    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle({ id: "a" })));
    act(() => result.current.addShape(makeRectangle({ id: "b" })));
    act(() => result.current.setLocked(["b"], true));
    transactionCount = 0;

    act(() =>
      result.current.moveShapes([
        { id: "a", x: 50, y: 60 },
        { id: "b", x: 999, y: 999 },
      ]),
    );

    expect(transactionCount).toBe(1);
    const a = result.current.shapes.find((s) => s.id === "a")!;
    const b = result.current.shapes.find((s) => s.id === "b")!;
    expect([a.x, a.y]).toEqual([50, 60]);
    expect([b.x, b.y]).toEqual([0, 0]);
  });

  it("updateShapes applies per-shape changes in one transaction and skips locked shapes", () => {
    const doc = new Y.Doc();
    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle({ id: "a" })));
    act(() => result.current.addShape(makeRectangle({ id: "b" })));
    act(() => result.current.setLocked(["b"], true));

    act(() =>
      result.current.updateShapes([
        { id: "a", changes: { strokeColor: "#fff" } },
        { id: "b", changes: { strokeColor: "#fff" } },
      ]),
    );

    expect(result.current.shapes.find((s) => s.id === "a")!.strokeColor).toBe("#fff");
    expect(result.current.shapes.find((s) => s.id === "b")!.strokeColor).toBe("#000000");
  });

  it("removeShapes auto-dissolves a group that drops to one remaining member", () => {
    const doc = new Y.Doc();
    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle({ id: "a" })));
    act(() => result.current.addShape(makeRectangle({ id: "b" })));
    act(() => result.current.addShape(makeRectangle({ id: "c" })));
    act(() => result.current.groupShapes(["a", "b", "c"]));

    act(() => result.current.removeShapes(["a", "b"]));

    expect(result.current.shapes.map((s) => s.id)).toEqual(["c"]);
    expect(result.current.shapes[0]!.groupId).toBeNull();
  });

  it("groupShapes stamps a shared groupId and packs zIndex contiguously", () => {
    const doc = new Y.Doc();
    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle({ id: "a" })));
    act(() => result.current.addShape(makeRectangle({ id: "b" })));

    let groupId = "";
    act(() => {
      groupId = result.current.groupShapes(["a", "b"]);
    });

    const a = result.current.shapes.find((s) => s.id === "a")!;
    const b = result.current.shapes.find((s) => s.id === "b")!;
    expect(a.groupId).toBe(groupId);
    expect(b.groupId).toBe(groupId);
    expect(Math.abs(a.zIndex - b.zIndex)).toBe(1);
  });

  it("ungroupShapes clears groupId on every member", () => {
    const doc = new Y.Doc();
    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle({ id: "a" })));
    act(() => result.current.addShape(makeRectangle({ id: "b" })));
    let groupId = "";
    act(() => {
      groupId = result.current.groupShapes(["a", "b"]);
    });

    act(() => result.current.ungroupShapes(groupId));

    expect(result.current.shapes.every((s) => s.groupId === null)).toBe(true);
  });

  it("reorderShapes writes every id in the assignment map in one transaction", () => {
    const doc = new Y.Doc();
    let transactionCount = 0;
    doc.on("afterTransaction", () => (transactionCount += 1));

    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle({ id: "a" })));
    act(() => result.current.addShape(makeRectangle({ id: "b" })));
    transactionCount = 0;

    act(() => result.current.reorderShapes(new Map([["a", 5000], ["b", 4000]])));

    expect(transactionCount).toBe(1);
    expect(result.current.shapes.find((s) => s.id === "a")!.zIndex).toBe(5000);
    expect(result.current.shapes.find((s) => s.id === "b")!.zIndex).toBe(4000);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test --workspace client -- useYShapes`
Expected: FAIL — `result.current.moveShapes is not a function` (and similarly for the other new functions).

- [ ] **Step 3: Implement**

Replace `client/src/canvas/yjs/useYShapes.ts` with:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { shapeSchema, type Shape } from "@cursive/shared";
import { LOCAL_ORIGIN } from "./localOrigin.js";
import { nextZIndex, packContiguous } from "../tools/zOrder.js";

type YShape = Y.Map<unknown>;

function shapeToYMap(shape: Shape): YShape {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(shape)) {
    map.set(key, value);
  }
  return map;
}

function readShapes(yShapes: Y.Map<YShape>): Shape[] {
  return Array.from(yShapes.values()).map((yShape) => yShape.toJSON() as Shape);
}

export function useYShapes(doc: Y.Doc) {
  const yShapes = useMemo(() => doc.getMap<YShape>("shapes"), [doc]);
  const [shapes, setShapes] = useState<Shape[]>(() => readShapes(yShapes));

  useEffect(() => {
    const sync = () => setShapes(readShapes(yShapes));
    sync();
    yShapes.observeDeep(sync);
    return () => yShapes.unobserveDeep(sync);
  }, [yShapes]);

  const addShape = useCallback(
    (shape: Shape) => {
      const parsedShape = shapeSchema.parse({ ...shape, zIndex: nextZIndex(shapes) });
      doc.transact(() => {
        yShapes.set(parsedShape.id, shapeToYMap(parsedShape));
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc, shapes],
  );

  const updateShape = useCallback(
    (id: string, changes: Partial<Shape>) => {
      const existing = yShapes.get(id);
      if (!existing) return;
      doc.transact(() => {
        for (const [key, value] of Object.entries(changes)) {
          existing.set(key, value);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  /** Bulk restyle for multi-select — skips locked shapes, one transaction. */
  const updateShapes = useCallback(
    (updates: { id: string; changes: Partial<Shape> }[]) => {
      doc.transact(() => {
        for (const { id, changes } of updates) {
          const existing = yShapes.get(id);
          if (!existing || existing.get("locked")) continue;
          for (const [key, value] of Object.entries(changes)) {
            existing.set(key, value);
          }
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  /** Bulk drag-move for multi-select — skips locked shapes, one transaction. */
  const moveShapes = useCallback(
    (moves: { id: string; x: number; y: number }[]) => {
      doc.transact(() => {
        for (const { id, x, y } of moves) {
          const existing = yShapes.get(id);
          if (!existing || existing.get("locked")) continue;
          existing.set("x", x);
          existing.set("y", y);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const removeShapes = useCallback(
    (ids: string[]) => {
      const removedIds = new Set(ids);
      doc.transact(() => {
        for (const id of ids) yShapes.delete(id);

        // Auto-dissolve any group that drops to <=1 remaining member.
        const remaining = readShapes(yShapes).filter((s) => !removedIds.has(s.id));
        const byGroup = new Map<string, Shape[]>();
        for (const shape of remaining) {
          if (!shape.groupId) continue;
          byGroup.set(shape.groupId, [...(byGroup.get(shape.groupId) ?? []), shape]);
        }
        for (const members of byGroup.values()) {
          if (members.length === 1) yShapes.get(members[0]!.id)?.set("groupId", null);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const removeShape = useCallback((id: string) => removeShapes([id]), [removeShapes]);

  const splitShape = useCallback(
    (id: string, replacements: Shape[]) => {
      const parsedReplacements = replacements.map((s) => shapeSchema.parse(s));
      doc.transact(() => {
        yShapes.delete(id);
        for (const shape of parsedReplacements) {
          yShapes.set(shape.id, shapeToYMap(shape));
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const reorderShapes = useCallback(
    (assignments: Map<string, number>) => {
      doc.transact(() => {
        for (const [id, zIndex] of assignments) yShapes.get(id)?.set("zIndex", zIndex);
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const groupShapes = useCallback(
    (ids: string[]): string => {
      const groupId = `group-${crypto.randomUUID()}`;
      const members = shapes.filter((s) => ids.includes(s.id));
      const topZIndex = members.length > 0 ? Math.max(...members.map((m) => m.zIndex)) : nextZIndex(shapes);
      const assignments = packContiguous(members, topZIndex);
      doc.transact(() => {
        for (const member of members) {
          const map = yShapes.get(member.id);
          map?.set("groupId", groupId);
          map?.set("zIndex", assignments.get(member.id)!);
        }
      }, LOCAL_ORIGIN);
      return groupId;
    },
    [yShapes, doc, shapes],
  );

  const ungroupShapes = useCallback(
    (groupId: string) => {
      doc.transact(() => {
        for (const shape of shapes) {
          if (shape.groupId === groupId) yShapes.get(shape.id)?.set("groupId", null);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc, shapes],
  );

  const setLocked = useCallback(
    (ids: string[], locked: boolean) => {
      doc.transact(() => {
        for (const id of ids) yShapes.get(id)?.set("locked", locked);
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  return {
    shapes,
    addShape,
    updateShape,
    updateShapes,
    moveShapes,
    removeShape,
    removeShapes,
    splitShape,
    reorderShapes,
    groupShapes,
    ungroupShapes,
    setLocked,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --workspace client -- useYShapes`
Expected: PASS (all original + new tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/yjs/useYShapes.ts client/src/canvas/yjs/useYShapes.test.ts
git commit -m "Add bulk move/restyle/delete, reorder, group, and lock to useYShapes"
```

---

### Task 7: Multi-select, marquee, and locked/z-order rendering in `Stage.tsx`

**Files:**
- Modify: `client/src/canvas/Stage.tsx` (whole file — props, `handleMouseDown`/`Move`/`Up`, render)
- Modify: `client/src/canvas/shapes/ShapeInteraction.ts:1-6`

**Interfaces:**
- Consumes: `sortByZIndexAscending` (from `./tools/zOrder.js`), `shapesInMarquee`, `resolveClickSelection` (from `./selection/selection.js`), `Box` (from `./selection/boundingBox.js`).
- Produces: `CanvasStage` now takes `selectedIds: string[]`, `onSelectionChange: (ids: string[]) => void`, `onMoveShapes: (moves: { id: string; x: number; y: number }[]) => void`, `onRemoveShapes: (ids: string[]) => void` in place of the old `selectedId`/`onSelectShape` — consumed by Task 8 (`BoardExperience.tsx`).

- [ ] **Step 1: Update `ShapeInteractionProps`**

```ts
// client/src/canvas/shapes/ShapeInteraction.ts
import type Konva from "konva";

export interface ShapeInteractionProps {
  draggable: boolean;
  isSelected: boolean;
  onDragEnd: (x: number, y: number) => void;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export const SELECTION_HIGHLIGHT = {
  shadowColor: "#1971c2",
  shadowBlur: 12,
  shadowOpacity: 0.6,
};
```

(`RectangleShape.tsx`, `EllipseShape.tsx`, `PolylineShape.tsx`, `TextShape.tsx` need no changes — they already do `onClick={onClick}`, and Konva always passes the event object to the handler regardless of the declared arity.)

- [ ] **Step 2: Rewrite `Stage.tsx`'s props, selection/marquee logic, and render**

Replace the whole file's `Props` interface, `handleMouseDown`/`handleMouseMove`/`handleMouseUp`, the Delete-key effect, and the render section:

```tsx
import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage as KonvaStage } from "react-konva";
import type Konva from "konva";
import type { Shape, Tool } from "@cursive/shared";
import { ShapeRenderer } from "./shapes/index.js";
import { RemoteCursors } from "./cursors/RemoteCursors.js";
import type { PresenceState } from "./yjs/useAwareness.js";
import { isFarEnoughToSample } from "./tools/pointSampling.js";
import { eraseFromPoints } from "./tools/eraser.js";
import { sortByZIndexAscending } from "./tools/zOrder.js";
import { resolveClickSelection, shapesInMarquee } from "./selection/selection.js";
import type { Box } from "./selection/boundingBox.js";

const MIN_DRAG_DISTANCE = 3;
const MIN_POINT_DISTANCE = 4;

interface Props {
  shapes: Shape[];
  peers: Map<number, PresenceState>;
  activeTool: Tool;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  blendMode: "normal" | "multiply";
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  readOnly?: boolean;
  onAddShape: (shape: Shape) => void;
  onUpdateShape: (id: string, changes: Partial<Shape>) => void;
  onMoveShapes: (moves: { id: string; x: number; y: number }[]) => void;
  onSplitShape: (id: string, replacements: Shape[]) => void;
  onRemoveShapes: (ids: string[]) => void;
  onCursorMove: (cursor: { x: number; y: number } | null) => void;
}
```

(`useContainerSize` and `isDegenerate` stay exactly as they are.)

```tsx
export function CanvasStage({
  shapes,
  peers,
  activeTool,
  strokeColor,
  strokeWidth,
  opacity,
  blendMode,
  selectedIds,
  onSelectionChange,
  readOnly = false,
  onAddShape,
  onUpdateShape,
  onMoveShapes,
  onSplitShape,
  onRemoveShapes,
  onCursorMove,
}: Props) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const [eraserPreview, setEraserPreview] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<(Box & { shiftKey: boolean }) | null>(null);
  const isDrawing = useRef(false);
  const isErasing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);
  const eraserRadius = Math.max(strokeWidth, 8);
  const orderedShapes = sortByZIndexAscending(shapes);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        const removableIds = selectedIds.filter((id) => !shapes.find((s) => s.id === id)?.locked);
        if (removableIds.length > 0) onRemoveShapes(removableIds);
        onSelectionChange([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, shapes, onRemoveShapes, onSelectionChange, readOnly]);
```

(`getPointer` and `startDraft` are unchanged, except every branch of `startDraft` gains the three new required fields — see Step 3.)

```tsx
  // Erasing is a delete-by-a-different-name — a locked shape is protected
  // from it exactly like Delete/drag/restyle.
  const eraseAtPointer = (e: Konva.KonvaEventObject<MouseEvent>, pointer: { x: number; y: number }) => {
    const stage = e.target.getStage();
    if (!stage || e.target === stage) return;
    const hitId = e.target.id();
    if (!hitId) return;
    const shape = shapes.find((s) => s.id === hitId);
    if (!shape || shape.locked) return;

    if (shape.type === "freehand") {
      const runs = eraseFromPoints(shape.points, pointer.x - shape.x, pointer.y - shape.y, eraserRadius);
      if (runs.length === 0) {
        onRemoveShapes([shape.id]);
      } else if (runs.length === 1) {
        const totalPoints = runs.reduce((sum, run) => sum + run.length, 0);
        if (totalPoints === shape.points.length) return;
        onUpdateShape(shape.id, { points: runs[0]! });
      } else {
        onSplitShape(
          shape.id,
          runs.map((points) => ({ ...shape, id: crypto.randomUUID(), points })),
        );
      }
      return;
    }

    onRemoveShapes([shape.id]);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;

    if (e.target === stage) {
      if (activeTool === "select") {
        const pointer = getPointer(stage);
        if (pointer) setMarquee({ x1: pointer.x, y1: pointer.y, x2: pointer.x, y2: pointer.y, shiftKey: e.evt.shiftKey });
        if (!e.evt.shiftKey) onSelectionChange([]);
      } else {
        onSelectionChange([]);
      }
    }

    if (activeTool === "eraser") {
      isErasing.current = true;
      const pointer = getPointer(stage);
      if (pointer) eraseAtPointer(e, pointer);
      return;
    }

    if (activeTool === "select") return;
    const pointer = getPointer(stage);
    if (!pointer) return;

    if (activeTool === "text") {
      const text = window.prompt("Text:");
      if (text) {
        onAddShape({
          id: crypto.randomUUID(),
          type: "text",
          x: pointer.x,
          y: pointer.y,
          rotation: 0,
          strokeColor,
          strokeWidth: 0,
          opacity,
          text,
          fontSize: 20,
          fillColor: strokeColor,
          zIndex: 0,
          locked: false,
          groupId: null,
        });
      }
      return;
    }

    isDrawing.current = true;
    setDraft(startDraft(pointer.x, pointer.y));
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = getPointer(stage);
    if (!pointer) return;

    onCursorMove(pointer);

    if (activeTool === "eraser") setEraserPreview(pointer);

    if (e.evt.buttons === 0) {
      isErasing.current = false;
      isDrawing.current = false;
      return;
    }

    if (marquee) {
      setMarquee({ ...marquee, x2: pointer.x, y2: pointer.y });
      return;
    }

    if (activeTool === "eraser") {
      if (isErasing.current) eraseAtPointer(e, pointer);
      return;
    }

    if (!isDrawing.current) return;

    setDraft((current) => {
      if (!current) return current;
      if (current.type === "rectangle") {
        return { ...current, width: pointer.x - current.x, height: pointer.y - current.y };
      }
      if (current.type === "ellipse") {
        return { ...current, radiusX: Math.abs(pointer.x - current.x), radiusY: Math.abs(pointer.y - current.y) };
      }
      if (current.type === "line") {
        return { ...current, points: [current.points[0], current.points[1], pointer.x, pointer.y] };
      }
      if (current.type === "freehand") {
        const lastX = current.points[current.points.length - 2]!;
        const lastY = current.points[current.points.length - 1]!;
        if (!isFarEnoughToSample(lastX, lastY, pointer.x, pointer.y, MIN_POINT_DISTANCE)) return current;
        return { ...current, points: [...current.points, pointer.x, pointer.y] };
      }
      return current;
    });
  };

  const handleMouseUp = () => {
    if (marquee) {
      const width = Math.abs(marquee.x2 - marquee.x1);
      const height = Math.abs(marquee.y2 - marquee.y1);
      // A plain click (no real drag) on empty canvas — not a marquee. Without
      // this, a zero-size box would still "intersect" any shape whose
      // bounding box happens to cover that point, spuriously re-selecting a
      // shape Konva itself correctly saw the click miss (e.g. clicking
      // inside an unfilled rectangle's interior). Selection was already
      // cleared (or left alone under shift) in handleMouseDown.
      if (width < MIN_DRAG_DISTANCE && height < MIN_DRAG_DISTANCE) {
        setMarquee(null);
        return;
      }
      const box: Box = {
        x1: Math.min(marquee.x1, marquee.x2),
        y1: Math.min(marquee.y1, marquee.y2),
        x2: Math.max(marquee.x1, marquee.x2),
        y2: Math.max(marquee.y1, marquee.y2),
      };
      const hitIds = shapesInMarquee(shapes, box);
      onSelectionChange(
        marquee.shiftKey ? [...new Set([...selectedIds, ...hitIds])] : hitIds,
      );
      setMarquee(null);
      return;
    }
    if (activeTool === "eraser") {
      isErasing.current = false;
      return;
    }
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (draft && !isDegenerate(draft)) onAddShape(draft);
    setDraft(null);
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setEraserPreview(null);
  };

  useEffect(() => {
    if (activeTool !== "eraser") setEraserPreview(null);
  }, [activeTool]);
```

```tsx
  return (
    <div
      ref={containerRef}
      className="canvas-dot-grid"
      style={{ width: "100%", height: "100%", cursor: activeTool === "eraser" ? "none" : undefined }}
    >
      <KonvaStage
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <Layer>
          {orderedShapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              draggable={!readOnly && activeTool === "select" && !shape.locked}
              isSelected={selectedIds.includes(shape.id)}
              onDragEnd={(x, y) => {
                const dx = x - shape.x;
                const dy = y - shape.y;
                const moves = selectedIds.includes(shape.id)
                  ? selectedIds.map((id) => {
                      if (id === shape.id) return { id, x, y };
                      const other = shapes.find((s) => s.id === id);
                      return { id, x: (other?.x ?? 0) + dx, y: (other?.y ?? 0) + dy };
                    })
                  : [{ id: shape.id, x, y }];
                onMoveShapes(moves);
              }}
              onClick={(e) => {
                if (readOnly || activeTool !== "select") return;
                onSelectionChange(resolveClickSelection(shapes, shape.id, selectedIds, e.evt.shiftKey));
              }}
            />
          ))}
          {draft && (
            <ShapeRenderer shape={draft} draggable={false} isSelected={false} onDragEnd={() => {}} onClick={() => {}} />
          )}
          {activeTool === "eraser" && eraserPreview && (
            <Rect
              x={eraserPreview.x}
              y={eraserPreview.y}
              offsetX={eraserRadius * 1.1}
              offsetY={eraserRadius * 0.75}
              width={eraserRadius * 2.2}
              height={eraserRadius * 1.5}
              cornerRadius={eraserRadius * 0.3}
              rotation={-8}
              fill="#ffdce4"
              stroke="#96677a"
              strokeWidth={1.5}
              shadowColor="black"
              shadowBlur={6}
              shadowOffsetX={2}
              shadowOffsetY={3}
              shadowOpacity={0.35}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(25, 113, 194, 0.12)"
              stroke="#1971c2"
              strokeWidth={1}
              listening={false}
            />
          )}
        </Layer>
        <RemoteCursors peers={peers} />
      </KonvaStage>
    </div>
  );
}
```

- [ ] **Step 3: Add the three new required fields to every `startDraft` branch and the text-shape literal**

In `startDraft`, every returned object (`rectangle`, `ellipse`, `line`, `freehand`) gains:

```ts
zIndex: 0,
locked: false,
groupId: null,
```

(placed after `opacity`/`blendMode`, same as the `rotation`/`opacity` fields already there — the real `zIndex` is assigned by `useYShapes.addShape`, so `0` here is a harmless placeholder that only needs to satisfy the `Shape` type). The inline text-shape object in `handleMouseDown` (Step 2 above) already includes these three fields.

- [ ] **Step 4: Typecheck and run the client test suite**

Run: `npm run test --workspace client`
Expected: PASS. (`Stage.tsx` has no dedicated test file today — its behavior is exercised via the manual walkthrough in Task 10 and the `multiplayer-sim-tester` pass. This step just confirms the refactor didn't break the existing suite or the TypeScript build.)

Run: `npm run build --workspace client`
Expected: PASS with no type errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/Stage.tsx client/src/canvas/shapes/ShapeInteraction.ts
git commit -m "Add multi-select, marquee, bulk move, and z-order rendering to the canvas"
```

---

### Task 8: Wire multi-select, hide, and bulk restyle into `BoardExperience.tsx`

**Files:**
- Modify: `client/src/canvas/BoardExperience.tsx`

**Interfaces:**
- Consumes: `moveShapes`, `updateShapes`, `removeShapes`, `reorderShapes`, `groupShapes`, `ungroupShapes`, `setLocked` (from `./yjs/useYShapes.js`, Task 6); `buildLayerRows`, `reorderRows` (from `./layers/layerRows.js`, Task 5); `toggleSelection` (from `./selection/selection.js`, Task 4); `LayersPanel` (from `./layers/LayersPanel.js`, Task 9 — imported here but built in the next task; this task's own tests don't depend on it existing yet, see Step 1).
- Produces: `BoardExperience` now manages `selectedIds: string[]` and `hiddenIds: Set<string>` instead of `selectedId`.

- [ ] **Step 1: This task has no new pure logic of its own — Steps are the file edit + a manual smoke check, not a red/green unit test cycle**

(Everything genuinely testable here — selection resolution, bulk-op payload shape, reorder math — was already covered in Tasks 2–6's unit tests. `BoardExperience.tsx` is wiring: passing the right callbacks to `Stage.tsx` and the new `LayersPanel`. Its correctness is verified by the manual walkthrough and `multiplayer-sim-tester` pass in Task 10.)

- [ ] **Step 2: Replace selection state and derived values**

```tsx
const { shapes, addShape, updateShape, updateShapes, moveShapes, removeShapes, splitShape, reorderShapes, groupShapes, ungroupShapes, setLocked } =
  useYShapes(doc);
// ...
const [selectedIds, setSelectedIds] = useState<string[]>([]);
const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
const selectedShapes = useMemo(() => shapes.filter((s) => selectedIds.includes(s.id)), [shapes, selectedIds]);
const visibleShapes = useMemo(() => shapes.filter((s) => !hiddenIds.has(s.id)), [shapes, hiddenIds]);
const canGroup = selectedIds.length >= 2;
const commonGroupId = useMemo(() => {
  if (selectedShapes.length < 2) return null;
  const first = selectedShapes[0]!.groupId;
  return first && selectedShapes.every((s) => s.groupId === first) ? first : null;
}, [selectedShapes]);
```

Replace the existing tool-change effect:

```tsx
useEffect(() => {
  if (tool !== "select") setSelectedIds([]);
}, [tool]);
```

- [ ] **Step 3: Replace the bulk restyle handlers**

```tsx
const handleColorChange = (color: string) => {
  if (selectedShapes.length > 0) {
    updateShapes(
      selectedShapes.map((s) => ({
        id: s.id,
        changes: s.type === "text" ? { strokeColor: color, fillColor: color } : { strokeColor: color },
      })),
    );
  } else {
    setStrokeColor(color);
  }
};
const handleStrokeWidthChange = (width: number) => {
  if (selectedShapes.length > 0) {
    updateShapes(selectedShapes.map((s) => ({ id: s.id, changes: { strokeWidth: width } })));
  } else {
    setStrokeWidth(width);
  }
};
const handleOpacityChange = (nextOpacity: number) => {
  if (selectedShapes.length > 0) {
    updateShapes(selectedShapes.map((s) => ({ id: s.id, changes: { opacity: nextOpacity } })));
  } else {
    setOpacity(nextOpacity);
  }
};
```

Update the `DrawingOptionsBar` call site: `color={selectedShapes[0]?.strokeColor ?? strokeColor}`, `strokeWidth={selectedShapes[0]?.strokeWidth ?? strokeWidth}`, `opacity={selectedShapes[0]?.opacity ?? opacity}` (same three props, now reading `selectedShapes[0]` instead of the old `selectedShape`).

- [ ] **Step 4: Add the layers-panel handlers**

```tsx
const handleSelectRow = (ids: string[], shiftKey: boolean) => setSelectedIds((current) => toggleSelection(ids, current, shiftKey));

const handleToggleLocked = (ids: string[], locked: boolean) => setLocked(ids, locked);

const handleToggleHidden = (ids: string[]) => {
  setHiddenIds((current) => {
    const next = new Set(current);
    const allHidden = ids.every((id) => next.has(id));
    for (const id of ids) (allHidden ? next.delete(id) : next.add(id));
    return next;
  });
};

const handleReorder = (rowKey: string, targetIndex: number) => {
  const rows = buildLayerRows(shapes);
  reorderShapes(reorderRows(rows, rowKey, targetIndex));
};

const handleGroup = () => {
  if (selectedIds.length >= 2) groupShapes(selectedIds);
};

const handleUngroup = () => {
  if (commonGroupId) ungroupShapes(commonGroupId);
};
```

- [ ] **Step 5: Update the `CanvasStage` and add the `LayersPanel` JSX**

```tsx
<CanvasStage
  shapes={visibleShapes}
  peers={peers}
  activeTool={tool}
  strokeColor={strokeColor}
  strokeWidth={strokeWidth}
  opacity={opacity}
  blendMode={blendMode}
  selectedIds={selectedIds}
  onSelectionChange={setSelectedIds}
  readOnly={isViewer}
  onAddShape={addShape}
  onUpdateShape={updateShape}
  onMoveShapes={moveShapes}
  onSplitShape={splitShape}
  onRemoveShapes={removeShapes}
  onCursorMove={updateCursor}
/>
```

In the `.rail` div, before the call/chat block:

```tsx
<div className={styles.rail}>
  {!isViewer && (
    <LayersPanel
      shapes={shapes}
      selectedIds={selectedIds}
      hiddenIds={hiddenIds}
      onSelectRow={handleSelectRow}
      onToggleLocked={handleToggleLocked}
      onToggleHidden={handleToggleHidden}
      onReorder={handleReorder}
      onGroup={handleGroup}
      onUngroup={handleUngroup}
      canGroup={canGroup}
      canUngroup={commonGroupId !== null}
    />
  )}
  {isJoined ? ( ... ) : ( ... )}
  <BoardChatPanel ... />
</div>
```

(the `CallStrip`/`CallStatusCard`/`BoardChatPanel` JSX already there is unchanged — `LayersPanel` is just a new sibling before them.)

Add the imports at the top of the file: `import { LayersPanel } from "./layers/LayersPanel.js";`, `import { buildLayerRows, reorderRows } from "./layers/layerRows.js";`, `import { toggleSelection } from "./selection/selection.js";`.

- [ ] **Step 6: Typecheck**

Run: `npm run build --workspace client`
Expected: FAILS at this point with "Cannot find module './layers/LayersPanel.js'" — expected, since Task 9 creates it next. Confirm the *only* error is that missing-module error (i.e. everything else in this task's edit typechecks cleanly) before moving on.

- [ ] **Step 7: Commit**

```bash
git add client/src/canvas/BoardExperience.tsx
git commit -m "Wire multi-select, hide, and bulk restyle into BoardExperience"
```

---

### Task 9: `LayersPanel` component

**Files:**
- Create: `client/src/canvas/layers/LayersPanel.tsx`
- Create: `client/src/canvas/layers/LayersPanel.module.css`

**Interfaces:**
- Consumes: `buildLayerRows`, `labelForShape` (from `./layerRows.js`, Task 5).
- Produces: `LayersPanel` component with the props referenced in Task 8, Step 5.

- [ ] **Step 1: Implement the component**

A group row can expand to show its members indented underneath, each with its own select/lock/hide — this is what makes the spec's "unlock one shape inside a locked group" case reachable at all (clicking a shape *on canvas* always selects its whole group per Task 4's `expandToGroup`; drilling into one member is only possible from this panel). Expand/collapse is purely local UI state — it doesn't need to be lifted to `BoardExperience`.

```tsx
// client/src/canvas/layers/LayersPanel.tsx
import { useState } from "react";
import type { Shape } from "@cursive/shared";
import { buildLayerRows, labelForShape } from "./layerRows.js";
import styles from "./LayersPanel.module.css";

interface Props {
  shapes: Shape[];
  selectedIds: string[];
  hiddenIds: ReadonlySet<string>;
  onSelectRow: (shapeIds: string[], shiftKey: boolean) => void;
  onToggleLocked: (shapeIds: string[], locked: boolean) => void;
  onToggleHidden: (shapeIds: string[]) => void;
  onReorder: (rowKey: string, targetIndex: number) => void;
  onGroup: () => void;
  onUngroup: () => void;
  canGroup: boolean;
  canUngroup: boolean;
}

export function LayersPanel({
  shapes,
  selectedIds,
  hiddenIds,
  onSelectRow,
  onToggleLocked,
  onToggleHidden,
  onReorder,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
}: Props) {
  const rows = buildLayerRows(shapes);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleExpanded = (rowKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Layers</span>
        <div className={styles.actions}>
          <button type="button" disabled={!canGroup} onClick={onGroup} className={styles.actionButton}>
            Group
          </button>
          <button type="button" disabled={!canUngroup} onClick={onUngroup} className={styles.actionButton}>
            Ungroup
          </button>
        </div>
      </div>
      <ul className={styles.list}>
        {rows.map((row, index) => {
          const isSelected = row.shapeIds.some((id) => selectedIds.includes(id));
          const isHidden = row.shapeIds.every((id) => hiddenIds.has(id));
          const isExpanded = row.kind === "group" && expandedGroups.has(row.key);
          return (
            <li key={row.key}>
              <div
                className={`${styles.row} ${isSelected ? styles.rowSelected : ""} ${isHidden ? styles.rowHidden : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", row.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromKey = e.dataTransfer.getData("text/plain");
                  if (fromKey && fromKey !== row.key) onReorder(fromKey, index);
                }}
                onClick={(e) => onSelectRow(row.shapeIds, e.shiftKey)}
              >
                {row.kind === "group" && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={isExpanded ? "Collapse group" : "Expand group"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(row.key);
                    }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                )}
                <span className={styles.label}>{row.label}</span>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Move backward"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorder(row.key, index + 1);
                    }}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Move forward"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorder(row.key, index - 1);
                    }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={row.locked ? "Unlock" : "Lock"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLocked(row.shapeIds, !row.locked);
                    }}
                  >
                    {row.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={isHidden ? "Show" : "Hide"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHidden(row.shapeIds);
                    }}
                  >
                    {isHidden ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <ul className={styles.memberList}>
                  {row.shapeIds.map((memberId) => {
                    const member = shapes.find((s) => s.id === memberId);
                    if (!member) return null;
                    const memberSelected = selectedIds.includes(memberId);
                    const memberHidden = hiddenIds.has(memberId);
                    return (
                      <li
                        key={memberId}
                        className={`${styles.memberRow} ${memberSelected ? styles.rowSelected : ""} ${memberHidden ? styles.rowHidden : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRow([memberId], e.shiftKey);
                        }}
                      >
                        <span className={styles.label}>{labelForShape(member)}</span>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={member.locked ? "Unlock" : "Lock"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleLocked([memberId], !member.locked);
                            }}
                          >
                            {member.locked ? "🔒" : "🔓"}
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={memberHidden ? "Show" : "Hide"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleHidden([memberId]);
                            }}
                          >
                            {memberHidden ? "🙈" : "👁"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Add a minimal stylesheet**

```css
/* client/src/canvas/layers/LayersPanel.module.css */
.panel {
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-paper-panel);
  padding: var(--space-2);
  min-width: 220px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: var(--space-2);
}

.title {
  font-family: var(--font-hand);
  font-size: 14px;
  color: var(--ink-soft);
}

.actions {
  display: flex;
  gap: var(--space-1);
}

.actionButton {
  font-size: 12px;
  padding: 2px 8px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
}

.rowSelected {
  background: var(--paper-highlight, rgba(25, 113, 194, 0.12));
}

.rowHidden {
  opacity: 0.5;
}

.memberList {
  list-style: none;
  margin: 0;
  padding: 0 0 0 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.memberRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 6px;
  border-radius: var(--radius-sm, 4px);
  cursor: pointer;
  font-size: 12px;
}

.label {
  font-size: 13px;
}

.rowActions {
  display: flex;
  gap: 2px;
}

.iconButton {
  font-size: 11px;
  line-height: 1;
  padding: 2px 4px;
  background: transparent;
  border: none;
  cursor: pointer;
}
```

(Placement, sizing, and visual polish are intentionally minimal here — per the spec, final layout/styling is a follow-up pass for the `ui-ux-designer` subagent, not part of this plan.)

- [ ] **Step 3: Typecheck and run the full client build**

Run: `npm run build --workspace client`
Expected: PASS (this resolves the "Cannot find module" error left at the end of Task 8).

Run: `npm run test --workspace client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/layers/LayersPanel.tsx client/src/canvas/layers/LayersPanel.module.css
git commit -m "Add the layers panel UI"
```

---

### Task 10: Sync verification and manual walkthrough

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite one more time from the repo root**

Run: `npm run test --workspace client && npm run test --workspace server`
Expected: PASS across both workspaces (server tests are untouched by this phase but should still pass — this phase makes no server-side changes, since all new writes go through the same Yjs sync path `boardAccess.ts` already gates).

- [ ] **Step 2: Dispatch the `multiplayer-sim-tester` subagent**

Ask it to verify, over real concurrent Hocuspocus WebSocket connections against the local dev server:
- Two clients reordering different shapes at the same time converge to a consistent stacking order with no shape lost.
- Two clients grouping overlapping selections at the same time converge without a corrupted/partial group.
- A viewer-role connection's attempt to reorder, group, ungroup, or lock a shape is rejected server-side, same as today's plain `updateShape` already is.

- [ ] **Step 3: Manual browser walkthrough**

With two browser tabs on the same board:
- Shift-click two shapes, then marquee-drag a third into the selection; drag the group and confirm all three move together.
- Bulk-restyle the selection's color/width/opacity from the options bar; confirm all three update, and that a `text` shape's fill (not just stroke) changes too.
- Group the selection, confirm the panel now shows one "Group (3)" row; ungroup it, confirm three separate rows return.
- Lock a shape from the panel: confirm it can't be dragged, deleted, restyled, or swept into a marquee, but can still be clicked directly to unlock.
- Hide a shape from the panel: confirm it disappears from the canvas and is excluded from marquee selection in **this** tab, but the second tab still sees and can select it (hide is local-only).
- Drag a row to reorder it in the panel, and use the ▲/▼ buttons; confirm the canvas stacking order updates immediately in both tabs.
- Confirm the whole layers panel is absent for a viewer-role visitor.

- [ ] **Step 4: Update the roadmap**

In `docs/ROADMAP.md`, change the Phase 9 sub-bullet `- **9b — Layers.** ...` to `- [x] **9b — Layers.** ...` and append a short verification summary sentence in the same style as the 9a entry (what was built, what the `multiplayer-sim-tester` pass and manual walkthrough confirmed, any bugs found and fixed along the way).

- [ ] **Step 5: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "Mark Phase 9b (Layers) complete"
```
