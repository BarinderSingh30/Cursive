# Phase 9a — Brushes & Strokes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whiteboard a real drawing-options bar (color/width/opacity for every shape), brush presets (pencil/marker/highlighter/eraser) for the pen tool, smoother freehand input, and per-user undo/redo.

**Architecture:** Two new shared schema fields (`opacity` on every shape, `blendMode` on freehand) plus a new `"eraser"` tool value. Client-side: pure, unit-tested helper modules for point-sampling and eraser math; a `Y.UndoManager` scoped to a local-only transaction origin for per-user undo; a new `DrawingOptionsBar` component that edits either the currently-selected shape (live) or the defaults used for the next shape drawn.

**Tech Stack:** React + TypeScript, Konva/react-konva, Yjs, Zod, Vitest + Testing Library.

## Global Constraints

- Local file imports use explicit `.js` extensions (this repo's ESM/NodeNext-style convention) — match every existing file in `client/src/canvas/`.
- Vitest is the test runner for the client workspace: `npm run test --workspace=client -- <path>` runs a single file, `npm run test --workspace=client` runs everything.
- `shared/` ships raw TypeScript with no build step; verify it with `npx tsc -p shared/tsconfig.json --noEmit` (no dedicated test suite exists there — don't add one, follow the existing convention).
- CSS is CSS Modules using the existing "Pale Cork" custom properties defined in `client/src/styles/tokens.css` (e.g. `--space-2`, `--paper-sunk`, `--radius-lg`, `--ink-soft`, `--font-hand`, `--font-body`). Don't invent new design tokens.
- Every local Yjs mutation (add/update/remove/split a shape) must go through `doc.transact(fn, LOCAL_ORIGIN)` — this is what makes per-user undo work. A mutation that forgets the origin silently breaks undo scoping without erroring anywhere.
- Existing boards persisted before this phase have shapes with no `opacity`/`blendMode` field. This needs no migration: Konva's own defaults for a missing `opacity` prop (1) and missing `globalCompositeOperation` prop (`"source-over"`) already match this phase's schema defaults exactly.

---

### Task 1: Shared schema — opacity, blendMode, eraser tool

**Files:**
- Modify: `shared/src/canvas/shapes.ts`
- Modify: `shared/src/canvas/tools.ts`

**Interfaces:**
- Produces: `baseShapeSchema` (and therefore every `Shape` variant) gains `opacity: number` (0–1, defaults to 1). `freehandShapeSchema`/`FreehandShape` gains `blendMode: "normal" | "multiply"` (defaults to `"normal"`). `toolSchema`/`Tool` gains the literal `"eraser"`.

- [ ] **Step 1: Update `shared/src/canvas/shapes.ts`**

```ts
import { z } from "zod";

const baseShapeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  strokeColor: z.string(),
  strokeWidth: z.number(),
  opacity: z.number().min(0).max(1).default(1),
});

export const rectangleShapeSchema = baseShapeSchema.extend({
  type: z.literal("rectangle"),
  width: z.number(),
  height: z.number(),
  fillColor: z.string().nullable(),
});

export const ellipseShapeSchema = baseShapeSchema.extend({
  type: z.literal("ellipse"),
  radiusX: z.number(),
  radiusY: z.number(),
  fillColor: z.string().nullable(),
});

export const lineShapeSchema = baseShapeSchema.extend({
  type: z.literal("line"),
  // Flat [x1, y1, x2, y2, ...] pairs, matching Konva's Line `points` prop.
  points: z.array(z.number()),
});

export const freehandShapeSchema = baseShapeSchema.extend({
  type: z.literal("freehand"),
  points: z.array(z.number()),
  blendMode: z.enum(["normal", "multiply"]).default("normal"),
});

export const textShapeSchema = baseShapeSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  fontSize: z.number(),
  fillColor: z.string(),
});

export const shapeSchema = z.discriminatedUnion("type", [
  rectangleShapeSchema,
  ellipseShapeSchema,
  lineShapeSchema,
  freehandShapeSchema,
  textShapeSchema,
]);

export type RectangleShape = z.infer<typeof rectangleShapeSchema>;
export type EllipseShape = z.infer<typeof ellipseShapeSchema>;
export type LineShape = z.infer<typeof lineShapeSchema>;
export type FreehandShape = z.infer<typeof freehandShapeSchema>;
export type TextShape = z.infer<typeof textShapeSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type ShapeType = Shape["type"];
```

- [ ] **Step 2: Update `shared/src/canvas/tools.ts`**

```ts
import { z } from "zod";

export const toolSchema = z.enum([
  "select",
  "rectangle",
  "ellipse",
  "line",
  "freehand",
  "text",
  "eraser",
]);

export type Tool = z.infer<typeof toolSchema>;
```

- [ ] **Step 3: Typecheck the shared workspace**

Run: `npx tsc -p shared/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add shared/src/canvas/shapes.ts shared/src/canvas/tools.ts
git commit -m "Add opacity/blendMode fields and eraser tool to shared shape schema"
```

---

### Task 2: Pure client logic — point sampling, eraser math, brush presets

**Files:**
- Create: `client/src/canvas/tools/pointSampling.ts`
- Create: `client/src/canvas/tools/pointSampling.test.ts`
- Create: `client/src/canvas/tools/eraser.ts`
- Create: `client/src/canvas/tools/eraser.test.ts`
- Create: `client/src/canvas/tools/brushPresets.ts`
- Create: `client/src/canvas/tools/brushPresets.test.ts`

**Interfaces:**
- Produces: `isFarEnoughToSample(lastX: number, lastY: number, x: number, y: number, minDistance: number): boolean`; `eraseFromPoints(points: number[], eraserX: number, eraserY: number, radius: number): number[][]`; `type BrushPreset = "pencil" | "marker" | "highlighter"`; `BRUSH_PRESETS: Record<BrushPreset, { strokeWidth: number; opacity: number; blendMode: "normal" | "multiply" }>`.
- Consumes: nothing from other tasks (fully self-contained, pure functions/data).

- [ ] **Step 1: Write the failing tests for point sampling**

`client/src/canvas/tools/pointSampling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFarEnoughToSample } from "./pointSampling.js";

describe("isFarEnoughToSample", () => {
  it("rejects a point closer than minDistance", () => {
    expect(isFarEnoughToSample(0, 0, 2, 0, 4)).toBe(false);
  });

  it("accepts a point at exactly minDistance", () => {
    expect(isFarEnoughToSample(0, 0, 4, 0, 4)).toBe(true);
  });

  it("accepts a point farther than minDistance", () => {
    expect(isFarEnoughToSample(0, 0, 10, 10, 4)).toBe(true);
  });

  it("rejects a point that hasn't moved at all", () => {
    expect(isFarEnoughToSample(5, 5, 5, 5, 4)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test --workspace=client -- src/canvas/tools/pointSampling.test.ts`
Expected: FAIL — `pointSampling.ts` doesn't exist yet.

- [ ] **Step 3: Implement `pointSampling.ts`**

```ts
/**
 * Whether a newly-captured raw pointer position is far enough from the
 * last sampled point to be worth keeping. Filters mouse-jitter noise out
 * of freehand strokes before it reaches the synced points array — Konva's
 * `tension` prop still handles the actual visual curve smoothing on top.
 */
export function isFarEnoughToSample(
  lastX: number,
  lastY: number,
  x: number,
  y: number,
  minDistance: number,
): boolean {
  const dx = x - lastX;
  const dy = y - lastY;
  return dx * dx + dy * dy >= minDistance * minDistance;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test --workspace=client -- src/canvas/tools/pointSampling.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing tests for eraser math**

`client/src/canvas/tools/eraser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eraseFromPoints } from "./eraser.js";

describe("eraseFromPoints", () => {
  it("returns the original run untouched when the eraser hits nothing", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(eraseFromPoints(points, 100, 100, 5)).toEqual([points]);
  });

  it("trims one end when the eraser hits the first point", () => {
    const points = [0, 0, 10, 0, 20, 0, 30, 0];
    expect(eraseFromPoints(points, 0, 0, 5)).toEqual([[10, 0, 20, 0, 30, 0]]);
  });

  it("splits into two runs when the eraser hits the middle", () => {
    const points = [0, 0, 10, 0, 20, 0, 30, 0, 40, 0];
    expect(eraseFromPoints(points, 20, 0, 5)).toEqual([
      [0, 0, 10, 0],
      [30, 0, 40, 0],
    ]);
  });

  it("returns no runs when the whole stroke is erased", () => {
    const points = [0, 0, 5, 0, 10, 0];
    expect(eraseFromPoints(points, 5, 0, 50)).toEqual([]);
  });

  it("drops a leftover fragment with fewer than 2 points", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(eraseFromPoints(points, 10, 0, 5)).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test --workspace=client -- src/canvas/tools/eraser.test.ts`
Expected: FAIL — `eraser.ts` doesn't exist yet.

- [ ] **Step 7: Implement `eraser.ts`**

```ts
/**
 * Removes every point within `radius` of (eraserX, eraserY) from a flat
 * [x0, y0, x1, y1, ...] points array, and splits what's left into separate
 * runs wherever a gap opens up. A run needs at least 2 points (4 numbers)
 * to render as a Konva Line, so shorter leftover fragments are dropped.
 */
export function eraseFromPoints(
  points: number[],
  eraserX: number,
  eraserY: number,
  radius: number,
): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  const radiusSquared = radius * radius;

  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    const dx = x - eraserX;
    const dy = y - eraserY;
    if (dx * dx + dy * dy <= radiusSquared) {
      if (current.length >= 4) runs.push(current);
      current = [];
    } else {
      current.push(x, y);
    }
  }
  if (current.length >= 4) runs.push(current);
  return runs;
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test --workspace=client -- src/canvas/tools/eraser.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 9: Write the failing tests for brush presets**

`client/src/canvas/tools/brushPresets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BRUSH_PRESETS } from "./brushPresets.js";

describe("BRUSH_PRESETS", () => {
  it("pencil is thin, opaque, and normal blend", () => {
    expect(BRUSH_PRESETS.pencil).toEqual({ strokeWidth: 2, opacity: 1, blendMode: "normal" });
  });

  it("marker is thicker but still fully opaque", () => {
    expect(BRUSH_PRESETS.marker).toEqual({ strokeWidth: 6, opacity: 1, blendMode: "normal" });
  });

  it("highlighter is wider than marker, translucent, and multiply-blended", () => {
    expect(BRUSH_PRESETS.highlighter.strokeWidth).toBeGreaterThan(BRUSH_PRESETS.marker.strokeWidth);
    expect(BRUSH_PRESETS.highlighter.opacity).toBeLessThan(1);
    expect(BRUSH_PRESETS.highlighter.blendMode).toBe("multiply");
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npm run test --workspace=client -- src/canvas/tools/brushPresets.test.ts`
Expected: FAIL — `brushPresets.ts` doesn't exist yet.

- [ ] **Step 11: Implement `brushPresets.ts`**

```ts
export type BrushPreset = "pencil" | "marker" | "highlighter";

interface BrushPresetValues {
  strokeWidth: number;
  opacity: number;
  blendMode: "normal" | "multiply";
}

export const BRUSH_PRESETS: Record<BrushPreset, BrushPresetValues> = {
  pencil: { strokeWidth: 2, opacity: 1, blendMode: "normal" },
  marker: { strokeWidth: 6, opacity: 1, blendMode: "normal" },
  highlighter: { strokeWidth: 14, opacity: 0.35, blendMode: "multiply" },
};
```

- [ ] **Step 12: Run it to verify it passes**

Run: `npm run test --workspace=client -- src/canvas/tools/brushPresets.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 13: Commit**

```bash
git add client/src/canvas/tools/pointSampling.ts client/src/canvas/tools/pointSampling.test.ts client/src/canvas/tools/eraser.ts client/src/canvas/tools/eraser.test.ts client/src/canvas/tools/brushPresets.ts client/src/canvas/tools/brushPresets.test.ts
git commit -m "Add pure point-sampling, eraser-split, and brush-preset logic"
```

---

### Task 3: Yjs layer — local-origin tagging, splitShape, useUndoManager

**Files:**
- Create: `client/src/canvas/yjs/localOrigin.ts`
- Modify: `client/src/canvas/yjs/useYShapes.ts`
- Modify: `client/src/canvas/yjs/useYShapes.test.ts` (new file — none exists yet for this hook)
- Create: `client/src/canvas/yjs/useUndoManager.ts`
- Create: `client/src/canvas/yjs/useUndoManager.test.ts`

**Interfaces:**
- Consumes: `shapeSchema`, `Shape` from `@cursive/shared` (Task 1).
- Produces: `LOCAL_ORIGIN: symbol`. `useYShapes(doc)` now also returns `splitShape(id: string, replacements: Shape[]): void`, and its existing `addShape`/`updateShape`/`removeShape` all tag their transactions with `LOCAL_ORIGIN`. `useUndoManager(doc: Y.Doc): { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }`.

- [ ] **Step 1: Create `localOrigin.ts`**

```ts
/**
 * A shared tag applied to every locally-initiated Yjs transaction in this
 * tab. Y.UndoManager's trackedOrigins uses it to tell "my own edits" apart
 * from a remote peer's — without it, undo would have no way to distinguish
 * the two and could undo a collaborator's stroke out from under them.
 */
export const LOCAL_ORIGIN = Symbol("cursive-local-origin");
```

- [ ] **Step 2: Write the failing test for `useYShapes`'s origin-tagging and split behavior**

`client/src/canvas/yjs/useYShapes.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { RectangleShape } from "@cursive/shared";
import { useYShapes } from "./useYShapes.js";
import { LOCAL_ORIGIN } from "./localOrigin.js";

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
    ...overrides,
  };
}

describe("useYShapes", () => {
  it("tags addShape/updateShape/removeShape transactions with LOCAL_ORIGIN", () => {
    const doc = new Y.Doc();
    const origins: unknown[] = [];
    doc.on("afterTransaction", (tr) => origins.push(tr.origin));

    const { result } = renderHook(() => useYShapes(doc));

    act(() => result.current.addShape(makeRectangle()));
    act(() => result.current.updateShape("shape-1", { strokeWidth: 4 }));
    act(() => result.current.removeShape("shape-1"));

    expect(origins).toEqual([LOCAL_ORIGIN, LOCAL_ORIGIN, LOCAL_ORIGIN]);
  });

  it("splitShape atomically replaces one shape with several others", () => {
    const doc = new Y.Doc();
    let transactionCount = 0;
    doc.on("afterTransaction", () => (transactionCount += 1));

    const { result } = renderHook(() => useYShapes(doc));
    act(() => result.current.addShape(makeRectangle()));
    transactionCount = 0;

    const replacement1 = makeRectangle({ id: "shape-2" });
    const replacement2 = makeRectangle({ id: "shape-3" });
    act(() => result.current.splitShape("shape-1", [replacement1, replacement2]));

    expect(transactionCount).toBe(1);
    expect(result.current.shapes.map((s) => s.id).sort()).toEqual(["shape-2", "shape-3"]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test --workspace=client -- src/canvas/yjs/useYShapes.test.ts`
Expected: FAIL — `splitShape` doesn't exist and transactions aren't tagged yet.

- [ ] **Step 4: Update `useYShapes.ts`**

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { shapeSchema, type Shape } from "@cursive/shared";
import { LOCAL_ORIGIN } from "./localOrigin.js";

/**
 * Each shape is stored as its own Y.Map (one CRDT entry per field), not as a
 * single plain object. That's what lets two people edit different fields of
 * the same shape at the same instant and have both edits survive — if the
 * whole shape were one value, whichever edit landed last would silently wipe
 * out the other, which is exactly the "last write wins" data loss this app
 * exists to avoid.
 */
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
    // observeDeep (not observe) so edits to a shape's individual fields —
    // not just whole shapes being added/removed — trigger a re-render.
    yShapes.observeDeep(sync);
    return () => yShapes.unobserveDeep(sync);
  }, [yShapes]);

  const addShape = useCallback(
    (shape: Shape) => {
      shapeSchema.parse(shape);
      doc.transact(() => {
        yShapes.set(shape.id, shapeToYMap(shape));
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
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

  const removeShape = useCallback(
    (id: string) => {
      doc.transact(() => {
        yShapes.delete(id);
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  /**
   * Atomically replaces one shape with zero or more others in a single
   * transaction — used by the eraser to split a freehand stroke without
   * ever syncing a half-finished intermediate state.
   */
  const splitShape = useCallback(
    (id: string, replacements: Shape[]) => {
      for (const shape of replacements) shapeSchema.parse(shape);
      doc.transact(() => {
        yShapes.delete(id);
        for (const shape of replacements) {
          yShapes.set(shape.id, shapeToYMap(shape));
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  return { shapes, addShape, updateShape, removeShape, splitShape };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test --workspace=client -- src/canvas/yjs/useYShapes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing test for `useUndoManager`**

`client/src/canvas/yjs/useUndoManager.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { useUndoManager } from "./useUndoManager.js";
import { LOCAL_ORIGIN } from "./localOrigin.js";

describe("useUndoManager", () => {
  it("starts with nothing to undo or redo", () => {
    const doc = new Y.Doc();
    const { result } = renderHook(() => useUndoManager(doc));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("can undo a local change but never one made under a different origin", () => {
    const doc = new Y.Doc();
    const shapes = doc.getMap("shapes");
    const { result } = renderHook(() => useUndoManager(doc));

    act(() => {
      doc.transact(() => shapes.set("mine", "value"), LOCAL_ORIGIN);
    });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(shapes.has("mine")).toBe(false);
    expect(result.current.canUndo).toBe(false);

    act(() => {
      doc.transact(() => shapes.set("theirs", "value"), Symbol("remote-peer"));
    });
    expect(result.current.canUndo).toBe(false);
  });

  it("can redo after an undo", () => {
    const doc = new Y.Doc();
    const shapes = doc.getMap("shapes");
    const { result } = renderHook(() => useUndoManager(doc));

    act(() => {
      doc.transact(() => shapes.set("mine", "value"), LOCAL_ORIGIN);
    });
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(shapes.has("mine")).toBe(true);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test --workspace=client -- src/canvas/yjs/useUndoManager.test.ts`
Expected: FAIL — `useUndoManager.ts` doesn't exist yet.

- [ ] **Step 8: Implement `useUndoManager.ts`**

```ts
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { LOCAL_ORIGIN } from "./localOrigin.js";

/**
 * Wraps Y.UndoManager scoped to the "shapes" map, tracking only this tab's
 * own transactions (tagged with LOCAL_ORIGIN). That's what makes undo
 * per-user: a collaborator's edits carry their own tab's origin, never
 * this one, so Ctrl+Z can only ever step back through local history.
 */
export function useUndoManager(doc: Y.Doc) {
  const manager = useMemo(
    () => new Y.UndoManager(doc.getMap("shapes"), { trackedOrigins: new Set([LOCAL_ORIGIN]) }),
    [doc],
  );

  useEffect(() => () => manager.destroy(), [manager]);

  const [canUndo, setCanUndo] = useState(() => manager.undoStack.length > 0);
  const [canRedo, setCanRedo] = useState(() => manager.redoStack.length > 0);

  useEffect(() => {
    const sync = () => {
      setCanUndo(manager.undoStack.length > 0);
      setCanRedo(manager.redoStack.length > 0);
    };
    sync();
    manager.on("stack-item-added", sync);
    manager.on("stack-item-popped", sync);
    return () => {
      manager.off("stack-item-added", sync);
      manager.off("stack-item-popped", sync);
    };
  }, [manager]);

  return {
    undo: () => manager.undo(),
    redo: () => manager.redo(),
    canUndo,
    canRedo,
  };
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm run test --workspace=client -- src/canvas/yjs/useUndoManager.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add client/src/canvas/yjs/localOrigin.ts client/src/canvas/yjs/useYShapes.ts client/src/canvas/yjs/useYShapes.test.ts client/src/canvas/yjs/useUndoManager.ts client/src/canvas/yjs/useUndoManager.test.ts
git commit -m "Scope shape mutations to a local origin and add per-user undo/redo"
```

---

### Task 4: Shape-renderer components — id, opacity, blend mode

**Files:**
- Modify: `client/src/canvas/shapes/RectangleShape.tsx`
- Modify: `client/src/canvas/shapes/EllipseShape.tsx`
- Modify: `client/src/canvas/shapes/TextShape.tsx`
- Modify: `client/src/canvas/shapes/PolylineShape.tsx`

**Interfaces:**
- Consumes: `opacity`/`blendMode` fields on `Shape` (Task 1).
- Produces: every rendered shape node now has a Konva `id` matching `shape.id` (needed by Task 6's eraser hit-testing) and respects `shape.opacity`; freehand strokes additionally respect `shape.blendMode`.

No dedicated test files exist for these presentational components today (react-konva renders to a canvas, not real DOM, and the codebase has no precedent for testing them) — this task is verified by typecheck plus the manual walkthrough in Task 8.

- [ ] **Step 1: Update `RectangleShape.tsx`**

```tsx
import { Rect } from "react-konva";
import type { RectangleShape as RectangleShapeType } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: RectangleShapeType;
}

export function RectangleShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Rect
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      opacity={shape.opacity}
      fill={shape.fillColor ?? undefined}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
```

- [ ] **Step 2: Update `EllipseShape.tsx`**

```tsx
import { Ellipse } from "react-konva";
import type { EllipseShape as EllipseShapeType } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: EllipseShapeType;
}

export function EllipseShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Ellipse
      id={shape.id}
      x={shape.x}
      y={shape.y}
      radiusX={shape.radiusX}
      radiusY={shape.radiusY}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      opacity={shape.opacity}
      fill={shape.fillColor ?? undefined}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
```

- [ ] **Step 3: Update `TextShape.tsx`**

```tsx
import { Text } from "react-konva";
import type { TextShape as TextShapeType } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: TextShapeType;
}

export function TextShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Text
      id={shape.id}
      x={shape.x}
      y={shape.y}
      text={shape.text}
      fontSize={shape.fontSize}
      rotation={shape.rotation}
      fill={shape.fillColor}
      opacity={shape.opacity}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
```

- [ ] **Step 4: Update `PolylineShape.tsx`**

```tsx
import { Line } from "react-konva";
import type { FreehandShape, LineShape } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: LineShape | FreehandShape;
}

export function PolylineShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Line
      id={shape.id}
      x={shape.x}
      y={shape.y}
      points={shape.points}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      opacity={shape.opacity}
      globalCompositeOperation={shape.type === "freehand" && shape.blendMode === "multiply" ? "multiply" : "source-over"}
      lineCap="round"
      lineJoin="round"
      tension={shape.type === "freehand" ? 0.4 : 0}
      hitStrokeWidth={Math.max(shape.strokeWidth, 16)}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
```

- [ ] **Step 5: Typecheck the client workspace**

Run: `npx tsc -b client --noEmit` (or `npm run build --workspace=client` if a quick `--noEmit` pass isn't convenient)
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/canvas/shapes/RectangleShape.tsx client/src/canvas/shapes/EllipseShape.tsx client/src/canvas/shapes/TextShape.tsx client/src/canvas/shapes/PolylineShape.tsx
git commit -m "Render shape opacity/blend mode and expose shape id on every Konva node"
```

---

### Task 5: Active-tool context + Toolbar trim

**Files:**
- Modify: `client/src/canvas/tools/useActiveTool.tsx`
- Modify: `client/src/canvas/tools/Toolbar.tsx`
- Modify: `client/src/canvas/tools/Toolbar.module.css`

**Interfaces:**
- Consumes: `BRUSH_PRESETS`, `BrushPreset` from `client/src/canvas/tools/brushPresets.ts` (Task 2).
- Produces: `useActiveTool()` returns `{ tool, setTool, strokeColor, setStrokeColor, strokeWidth, setStrokeWidth, opacity, setOpacity, blendMode, applyBrushPreset }`. Exported constant `STROKE_COLORS: string[]` (renamed from `PEN_COLORS` — its meaning now spans every shape type, not just the pen). `applyBrushPreset(preset: BrushPreset)` switches the tool to `"freehand"` and applies that preset's width/opacity/blendMode.

No dedicated test file exists for `useActiveTool.tsx` or `Toolbar.tsx` today — this task is a context/UI rewrite verified by typecheck; behavior is exercised end-to-end once Task 8 wires everything together.

- [ ] **Step 1: Rewrite `useActiveTool.tsx`**

```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Tool } from "@cursive/shared";
import { BRUSH_PRESETS, type BrushPreset } from "./brushPresets.js";

export const STROKE_COLORS = ["#4A3B2A", "#E24B3A", "#3D7A5A", "#1971C2", "#B5451F"];

const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_OPACITY = 1;

interface ActiveToolContextValue {
  tool: Tool;
  setTool: (tool: Tool) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  blendMode: "normal" | "multiply";
  applyBrushPreset: (preset: BrushPreset) => void;
}

const ActiveToolContext = createContext<ActiveToolContextValue | null>(null);

export function ActiveToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState<string>(STROKE_COLORS[0]!);
  const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_STROKE_WIDTH);
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);
  const [blendMode, setBlendMode] = useState<"normal" | "multiply">("normal");

  const applyBrushPreset = useCallback((preset: BrushPreset) => {
    const values = BRUSH_PRESETS[preset];
    setTool("freehand");
    setStrokeWidth(values.strokeWidth);
    setOpacity(values.opacity);
    setBlendMode(values.blendMode);
  }, []);

  return (
    <ActiveToolContext.Provider
      value={{
        tool,
        setTool,
        strokeColor,
        setStrokeColor,
        strokeWidth,
        setStrokeWidth,
        opacity,
        setOpacity,
        blendMode,
        applyBrushPreset,
      }}
    >
      {children}
    </ActiveToolContext.Provider>
  );
}

export function useActiveTool() {
  const ctx = useContext(ActiveToolContext);
  if (!ctx) {
    throw new Error("useActiveTool must be used within an ActiveToolProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Rewrite `Toolbar.tsx`**

The eraser is reachable via its `E` shortcut and the brush-preset row (Task 7), not as a 7th button in this tool-select pill — it's presented to the user as a brush preset, not a drawing shape.

```tsx
import { useEffect } from "react";
import { toolSchema, type Tool } from "@cursive/shared";
import { useActiveTool } from "./useActiveTool.js";
import styles from "./Toolbar.module.css";

const TOOL_LABELS: Record<string, string> = {
  select: "Select",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  freehand: "Pen",
  text: "Text",
};

const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: "select",
  r: "rectangle",
  o: "ellipse",
  l: "line",
  p: "freehand",
  t: "text",
  e: "eraser",
};

const PILL_TOOLS = toolSchema.options.filter((option) => option !== "eraser");

export function Toolbar() {
  const { tool, setTool } = useActiveTool();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "Escape") {
        setTool("select");
        return;
      }
      const next = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool]);

  return (
    <div className={styles.pill}>
      {PILL_TOOLS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setTool(option)}
          className={`${styles.tool} ${tool === option ? styles.toolActive : ""}`}
        >
          {TOOL_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Trim `Toolbar.module.css`**

The color-swatch styles move to `DrawingOptionsBar.module.css` in Task 7 — remove them here so nothing is duplicated:

```css
.pill {
  display: flex;
  gap: 4px;
  background: var(--paper-sunk);
  border-radius: var(--radius-lg);
  padding: 4px;
  flex-wrap: wrap;
}

.tool {
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font-family: var(--font-hand);
  font-size: 15px;
  padding: 5px 11px;
  border-radius: 5px;
  cursor: pointer;
}

.tool:hover {
  color: var(--ink);
}

.toolActive {
  background: var(--note-yellow);
  color: var(--ink);
  box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.15);
}
```

- [ ] **Step 4: Typecheck the client workspace**

Run: `npx tsc -b client --noEmit`
Expected: no errors. (Note: this will still fail until Task 7 removes the last reference to the old `PEN_COLORS` export if anything else imports it — grep for `PEN_COLORS` across `client/src` and confirm `Toolbar.tsx` was its only consumer before moving on.)

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/tools/useActiveTool.tsx client/src/canvas/tools/Toolbar.tsx client/src/canvas/tools/Toolbar.module.css
git commit -m "Extend active-tool context with width/opacity/blend and trim Toolbar to tool selection"
```

---

### Task 6: Stage.tsx — controlled selection, input smoothing, eraser

**Files:**
- Modify: `client/src/canvas/Stage.tsx`

**Interfaces:**
- Consumes: `isFarEnoughToSample` (Task 2), `eraseFromPoints` (Task 2), `splitShape` signature `(id: string, replacements: Shape[]) => void` (Task 3).
- Produces: `CanvasStage` now takes `strokeWidth: number`, `opacity: number`, `blendMode: "normal" | "multiply"`, `selectedId: string | null`, `onSelectShape: (id: string | null) => void`, and `onSplitShape: (id: string, replacements: Shape[]) => void` as new props (selection is no longer internal state — Task 8's `BoardExperience` owns it so the options bar can read/act on it).

- [ ] **Step 1: Replace `Stage.tsx` in full**

```tsx
import { useEffect, useRef, useState } from "react";
import { Layer, Stage as KonvaStage } from "react-konva";
import type Konva from "konva";
import type { Shape, Tool } from "@cursive/shared";
import { ShapeRenderer } from "./shapes/index.js";
import { RemoteCursors } from "./cursors/RemoteCursors.js";
import type { PresenceState } from "./yjs/useAwareness.js";
import { isFarEnoughToSample } from "./tools/pointSampling.js";
import { eraseFromPoints } from "./tools/eraser.js";

const MIN_DRAG_DISTANCE = 3;
const MIN_POINT_DISTANCE = 4;

interface Props {
  shapes: Shape[];
  peers: Map<number, PresenceState>;
  activeTool: Tool;
  /** Style used for newly-drawn shapes — the drawing-options bar's current defaults. */
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  blendMode: "normal" | "multiply";
  selectedId: string | null;
  onSelectShape: (id: string | null) => void;
  readOnly?: boolean;
  onAddShape: (shape: Shape) => void;
  onUpdateShape: (id: string, changes: Partial<Shape>) => void;
  onSplitShape: (id: string, replacements: Shape[]) => void;
  onRemoveShape: (id: string) => void;
  onCursorMove: (cursor: { x: number; y: number } | null) => void;
}

// Sizes the stage to the space its own container actually has, not the full
// window — the container shrinks when the chat sidebar is open, and the
// canvas must shrink with it. Using window.innerWidth here previously made
// the (invisible) canvas 300px wider than its box; because Konva's stage div
// is `position: relative`, CSS paints positioned elements above plain
// in-flow siblings regardless of DOM order, so that overflow silently sat on
// top of the chat panel and swallowed every click meant for it.
function useContainerSize(ref: { current: HTMLDivElement | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function isDegenerate(shape: Shape): boolean {
  if (shape.type === "rectangle") {
    return Math.abs(shape.width) < MIN_DRAG_DISTANCE && Math.abs(shape.height) < MIN_DRAG_DISTANCE;
  }
  if (shape.type === "ellipse") {
    return shape.radiusX < MIN_DRAG_DISTANCE && shape.radiusY < MIN_DRAG_DISTANCE;
  }
  if (shape.type === "line") {
    const [x1, y1, x2, y2] = shape.points;
    return Math.abs(x2 - x1) < MIN_DRAG_DISTANCE && Math.abs(y2 - y1) < MIN_DRAG_DISTANCE;
  }
  if (shape.type === "freehand") {
    return shape.points.length <= 2;
  }
  return false;
}

export function CanvasStage({
  shapes,
  peers,
  activeTool,
  strokeColor,
  strokeWidth,
  opacity,
  blendMode,
  selectedId,
  onSelectShape,
  readOnly = false,
  onAddShape,
  onUpdateShape,
  onSplitShape,
  onRemoveShape,
  onCursorMove,
}: Props) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const isDrawing = useRef(false);
  const isErasing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        onRemoveShape(selectedId);
        onSelectShape(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, onRemoveShape, onSelectShape, readOnly]);

  const getPointer = (stage: Konva.Stage) => stage.getPointerPosition();

  const startDraft = (x: number, y: number): Shape | null => {
    const id = crypto.randomUUID();
    switch (activeTool) {
      case "rectangle":
        return {
          id,
          type: "rectangle",
          x,
          y,
          width: 0,
          height: 0,
          rotation: 0,
          strokeColor,
          strokeWidth,
          opacity,
          fillColor: null,
        };
      case "ellipse":
        return {
          id,
          type: "ellipse",
          x,
          y,
          radiusX: 0,
          radiusY: 0,
          rotation: 0,
          strokeColor,
          strokeWidth,
          opacity,
          fillColor: null,
        };
      case "line":
        return {
          id,
          type: "line",
          x: 0,
          y: 0,
          points: [x, y, x, y],
          rotation: 0,
          strokeColor,
          strokeWidth,
          opacity,
        };
      case "freehand":
        return {
          id,
          type: "freehand",
          x: 0,
          y: 0,
          points: [x, y],
          rotation: 0,
          strokeColor,
          strokeWidth,
          opacity,
          blendMode,
        };
      default:
        return null;
    }
  };

  // Only freehand strokes can be meaningfully split at the erased point
  // range; every other shape type is deleted outright on first touch.
  const eraseAtPointer = (e: Konva.KonvaEventObject<MouseEvent>, pointer: { x: number; y: number }) => {
    const stage = e.target.getStage();
    if (!stage || e.target === stage) return;
    const hitId = e.target.id();
    if (!hitId) return;
    const shape = shapes.find((s) => s.id === hitId);
    if (!shape) return;

    if (shape.type === "freehand") {
      const runs = eraseFromPoints(shape.points, pointer.x - shape.x, pointer.y - shape.y, strokeWidth);
      if (runs.length === 0) {
        onRemoveShape(shape.id);
      } else if (runs.length === 1) {
        onUpdateShape(shape.id, { points: runs[0]! });
      } else {
        onSplitShape(
          shape.id,
          runs.map((points) => ({ ...shape, id: crypto.randomUUID(), points })),
        );
      }
      return;
    }

    onRemoveShape(shape.id);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;

    if (e.target === stage) {
      onSelectShape(null);
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
    if (activeTool === "eraser") {
      isErasing.current = false;
      return;
    }
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (draft && !isDegenerate(draft)) onAddShape(draft);
    setDraft(null);
  };

  return (
    <div ref={containerRef} className="canvas-dot-grid" style={{ width: "100%", height: "100%" }}>
      <KonvaStage
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <Layer>
          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              draggable={!readOnly && activeTool === "select"}
              isSelected={shape.id === selectedId}
              onDragEnd={(x, y) => onUpdateShape(shape.id, { x, y })}
              onClick={() => {
                if (!readOnly && activeTool === "select") onSelectShape(shape.id);
              }}
            />
          ))}
          {draft && <ShapeRenderer shape={draft} draggable={false} isSelected={false} onDragEnd={() => {}} onClick={() => {}} />}
        </Layer>
        <RemoteCursors peers={peers} />
      </KonvaStage>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the client workspace**

Run: `npx tsc -b client --noEmit`
Expected: errors referencing `BoardExperience.tsx` (it still calls `<CanvasStage>` with the old prop set) — that's expected until Task 8. Confirm there are no errors *within* `Stage.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add client/src/canvas/Stage.tsx
git commit -m "Wire controlled selection, freehand smoothing, and eraser hit-testing into CanvasStage"
```

---

### Task 7: DrawingOptionsBar component

**Files:**
- Create: `client/src/canvas/tools/DrawingOptionsBar.tsx`
- Create: `client/src/canvas/tools/DrawingOptionsBar.module.css`

**Interfaces:**
- Consumes: `STROKE_COLORS` from `useActiveTool.tsx` (Task 5), `BrushPreset` from `brushPresets.ts` (Task 2).
- Produces: `<DrawingOptionsBar>`, a presentational component taking `color`, `strokeWidth`, `opacity`, `onColorChange`, `onStrokeWidthChange`, `onOpacityChange`, `onApplyBrushPreset`, `isEraserActive`, `onSelectEraser`, `canUndo`, `canRedo`, `onUndo`, `onRedo`. It doesn't know whether it's editing a selected shape or the next-shape defaults — that decision is made by its caller (Task 8), which passes in whichever values/handlers apply.

Note on the approved spec: the design doc said brush-preset buttons should be "enabled only when the freehand or eraser tool is active." Implemented literally, that's a dead end — those buttons are the *only* way to switch into freehand/eraser from another tool, so disabling them until you're already on that tool makes them unreachable. This plan corrects that to "always enabled" (they always work as tool-switchers); flagged here rather than silently diverging from the written spec.

- [ ] **Step 1: Create `DrawingOptionsBar.module.css`**

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  background: var(--paper-sunk);
  border-radius: var(--radius-lg);
  padding: var(--space-2) var(--space-3);
}

.colorGroup {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.label {
  font-family: var(--font-body);
  font-size: 12.5px;
  color: var(--ink-faint);
}

.swatches {
  display: flex;
  align-items: center;
  gap: 6px;
}

.swatch {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-round);
  border: none;
  cursor: pointer;
  padding: 0;
}

.swatchActive {
  box-shadow: 0 0 0 2px var(--paper-sunk), 0 0 0 4px currentColor;
}

.colorInput {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: var(--radius-round);
  cursor: pointer;
  background: none;
}

.sliderGroup {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.sliderValue {
  font-family: var(--font-body);
  font-size: 12.5px;
  color: var(--ink-soft);
  min-width: 34px;
}

.pill {
  display: flex;
  gap: 4px;
  background: var(--paper);
  border-radius: var(--radius-lg);
  padding: 4px;
  flex-wrap: wrap;
}

.tool {
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font-family: var(--font-hand);
  font-size: 14px;
  padding: 5px 11px;
  border-radius: 5px;
  cursor: pointer;
}

.tool:hover {
  color: var(--ink);
}

.tool:disabled {
  color: var(--paper-border);
  cursor: not-allowed;
}

.toolActive {
  background: var(--note-yellow);
  color: var(--ink);
  box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.15);
}

.undoGroup {
  display: flex;
  gap: 4px;
  margin-left: auto;
}
```

- [ ] **Step 2: Create `DrawingOptionsBar.tsx`**

```tsx
import { STROKE_COLORS } from "./useActiveTool.js";
import type { BrushPreset } from "./brushPresets.js";
import styles from "./DrawingOptionsBar.module.css";

interface Props {
  color: string;
  strokeWidth: number;
  opacity: number;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onOpacityChange: (opacity: number) => void;
  onApplyBrushPreset: (preset: BrushPreset) => void;
  isEraserActive: boolean;
  onSelectEraser: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const BRUSH_BUTTONS: { key: BrushPreset; label: string }[] = [
  { key: "pencil", label: "Pencil" },
  { key: "marker", label: "Marker" },
  { key: "highlighter", label: "Highlighter" },
];

export function DrawingOptionsBar({
  color,
  strokeWidth,
  opacity,
  onColorChange,
  onStrokeWidthChange,
  onOpacityChange,
  onApplyBrushPreset,
  isEraserActive,
  onSelectEraser,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.colorGroup}>
        <span className={styles.label}>colour</span>
        <div className={styles.swatches}>
          {STROKE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Colour ${swatch}`}
              onClick={() => onColorChange(swatch)}
              className={`${styles.swatch} ${color === swatch ? styles.swatchActive : ""}`}
              style={{ background: swatch, color: swatch }}
            />
          ))}
          <input
            type="color"
            aria-label="Custom colour"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className={styles.colorInput}
          />
        </div>
      </div>

      <label className={styles.sliderGroup}>
        <span className={styles.label}>width</span>
        <input
          type="range"
          min={1}
          max={24}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
        />
        <span className={styles.sliderValue}>{strokeWidth}px</span>
      </label>

      <label className={styles.sliderGroup}>
        <span className={styles.label}>opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
        />
        <span className={styles.sliderValue}>{Math.round(opacity * 100)}%</span>
      </label>

      <div className={styles.pill}>
        {BRUSH_BUTTONS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => onApplyBrushPreset(key)} className={styles.tool}>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onSelectEraser}
          className={`${styles.tool} ${isEraserActive ? styles.toolActive : ""}`}
        >
          Eraser
        </button>
      </div>

      <div className={styles.undoGroup}>
        <button type="button" onClick={onUndo} disabled={!canUndo} className={styles.tool} aria-label="Undo">
          ↶ Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className={styles.tool} aria-label="Redo">
          ↷ Redo
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck the client workspace**

Run: `npx tsc -b client --noEmit`
Expected: no new errors introduced by this file (the pre-existing `BoardExperience.tsx` mismatch from Task 6 is still expected until Task 8).

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/tools/DrawingOptionsBar.tsx client/src/canvas/tools/DrawingOptionsBar.module.css
git commit -m "Add DrawingOptionsBar component for color/width/opacity/brush/undo controls"
```

---

### Task 8: BoardExperience wiring

**Files:**
- Modify: `client/src/canvas/BoardExperience.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 3, 5, 6, 7 (`useUndoManager`, extended `useActiveTool`, updated `CanvasStage` props, `DrawingOptionsBar`).
- Produces: the fully wired editing experience — this is the task where the feature becomes usable end-to-end.

- [ ] **Step 1: Replace `BoardExperience.tsx` in full**

```tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { useYjsDocument } from "./yjs/useYjsDocument.js";
import { useYShapes } from "./yjs/useYShapes.js";
import { useAwareness } from "./yjs/useAwareness.js";
import { useUndoManager } from "./yjs/useUndoManager.js";
import { useActiveTool } from "./tools/useActiveTool.js";
import { DrawingOptionsBar } from "./tools/DrawingOptionsBar.js";
import { PresenceList } from "./cursors/PresenceList.js";
import { CanvasStage } from "./Stage.js";
import { colorForUser } from "./presenceColors.js";
import { useCall } from "../call/useCall.js";
import { JoinCallButton } from "../call/JoinCallButton.js";
import { CallStrip } from "../call/CallStrip.js";
import { CallStatusCard } from "../call/CallStatusCard.js";
import { useBoardChatSocket } from "../boardChat/useBoardChatSocket.js";
import { BoardChatPanel } from "../boardChat/BoardChatPanel.js";
import type { ShareRequestContext } from "../viewer/shareContext.js";
import styles from "./BoardExperience.module.css";

interface Props {
  boardId: string;
  role: BoardRole;
  /** The real session user id, or null for a fully anonymous share-link visitor. */
  userId: string | null;
  userName: string;
  /** Present only when reached via a public /watch/:shareToken link. */
  shareContext?: ShareRequestContext;
  /** When provided, the Join Call button renders here (e.g. the owner page's top nav bar) instead of in the row above the canvas. */
  joinCallSlot?: HTMLElement | null;
  /** The public /watch page's canvas renders dimmed with a "read-only view" pill — a regular invited viewer on /board/:id does not. */
  readOnlyBadge?: boolean;
  onMembershipChanged?: () => void;
  onBoardDeleted?: () => void;
}

/**
 * The canvas + live presence + call + chat experience shared by the
 * authenticated editing page (Board.tsx) and the public watch page
 * (viewer/WatchPage.tsx) — everything except each page's own top-bar chrome
 * (owner controls vs. a plain "watching via public link" banner).
 */
export function BoardExperience({
  boardId,
  role,
  userId,
  userName,
  shareContext,
  joinCallSlot,
  readOnlyBadge = false,
  onMembershipChanged,
  onBoardDeleted,
}: Props) {
  const { doc, provider } = useYjsDocument(boardId, shareContext);
  const { shapes, addShape, updateShape, removeShape, splitShape } = useYShapes(doc);
  const { undo, redo, canUndo, canRedo } = useUndoManager(doc);
  const preferredColor = useMemo(() => colorForUser(userId ?? "guest"), [userId]);
  const isViewer = role === "viewer";

  const { peers, viewerPeers, updateCursor, setInCall, callParticipantCount, localPresence } = useAwareness(
    provider,
    userName,
    preferredColor,
    role,
  );
  const {
    tool,
    setTool,
    strokeColor,
    setStrokeColor,
    strokeWidth,
    setStrokeWidth,
    opacity,
    setOpacity,
    blendMode,
    applyBrushPreset,
  } = useActiveTool();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedShape = useMemo(() => shapes.find((s) => s.id === selectedId) ?? null, [shapes, selectedId]);

  const canPublish = roleAtLeast(role, "collaborator");
  const { isJoined, participants, join, leave, toggleCamera, toggleMic } = useCall(boardId, canPublish, shareContext);
  const [callError, setCallError] = useState<string | null>(null);

  useEffect(() => {
    setInCall(canPublish && isJoined);
  }, [canPublish, isJoined]);

  // Per-user undo: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z only ever step back
  // through this tab's own edits (see useUndoManager's LOCAL_ORIGIN scoping).
  useEffect(() => {
    if (isViewer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      const isRedo = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z";
      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isViewer, undo, redo]);

  const handleJoinCall = async () => {
    setCallError(null);
    try {
      await join();
    } catch {
      setCallError("Couldn't join the call. Check your connection and try again.");
    }
  };
  const handleLeaveCall = () => leave();

  const handleToggleMic = async () => {
    setCallError(null);
    try {
      await toggleMic();
    } catch {
      setCallError("Couldn't access the microphone. Check your device/permissions and try again.");
    }
  };
  const handleToggleCamera = async () => {
    setCallError(null);
    try {
      await toggleCamera();
    } catch {
      setCallError("Couldn't access the camera. Check your device/permissions and try again.");
    }
  };

  // Viewers (invited or share-link, logged in or anonymous) have no Join
  // Call button — they auto-watch/listen whenever a collaborator/owner is
  // actually in a call, and auto-disconnect the moment none remain.
  useEffect(() => {
    if (canPublish) return;
    if (callParticipantCount > 0 && !isJoined) {
      join().catch(() => {});
    } else if (callParticipantCount === 0 && isJoined) {
      leave();
    }
  }, [canPublish, callParticipantCount, isJoined, join, leave]);

  useEffect(() => {
    if (!provider) return;
    const onStateless = ({ payload }: { payload: string }) => {
      try {
        const message = JSON.parse(payload);
        if (message?.type === "membership-changed") onMembershipChanged?.();
        if (message?.type === "board-deleted") onBoardDeleted?.();
      } catch {
        // ignore malformed/unrelated stateless payloads
      }
    };
    provider.on("stateless", onStateless);
    return () => {
      provider.off("stateless", onStateless);
    };
  }, [provider, onMembershipChanged, onBoardDeleted]);

  const { messages: chatMessages, loadMore: loadMoreChat, sendMessage: sendChatMessage } = useBoardChatSocket(
    boardId,
    shareContext,
  );
  useEffect(() => {
    loadMoreChat();
    // Only ever load the initial page once per board — pagination past that
    // is user-triggered via BoardChatPanel's onReachTop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // When a shape is selected, these edit it live; with nothing selected,
  // they fall back to setting the defaults used for the next shape drawn.
  const handleColorChange = (color: string) => {
    if (selectedShape) updateShape(selectedShape.id, { strokeColor: color });
    else setStrokeColor(color);
  };
  const handleStrokeWidthChange = (width: number) => {
    if (selectedShape) updateShape(selectedShape.id, { strokeWidth: width });
    else setStrokeWidth(width);
  };
  const handleOpacityChange = (nextOpacity: number) => {
    if (selectedShape) updateShape(selectedShape.id, { opacity: nextOpacity });
    else setOpacity(nextOpacity);
  };

  const joinCallControls = canPublish ? (
    <>
      <JoinCallButton
        isJoined={isJoined}
        othersInCallCount={callParticipantCount}
        onJoin={handleJoinCall}
        onLeave={handleLeaveCall}
      />
      {callError && <span style={{ fontSize: 12, color: "var(--alert)" }}>{callError}</span>}
    </>
  ) : null;

  return (
    <div className={styles.body}>
      {joinCallSlot && joinCallControls ? createPortal(joinCallControls, joinCallSlot) : null}
      <div className={styles.canvasCol}>
        <div className={styles.presenceRow}>
          {!joinCallSlot && joinCallControls}
          <PresenceList self={localPresence} peers={peers} viewerPeers={viewerPeers} />
        </div>
        {!isViewer && (
          <DrawingOptionsBar
            color={selectedShape?.strokeColor ?? strokeColor}
            strokeWidth={selectedShape?.strokeWidth ?? strokeWidth}
            opacity={selectedShape?.opacity ?? opacity}
            onColorChange={handleColorChange}
            onStrokeWidthChange={handleStrokeWidthChange}
            onOpacityChange={handleOpacityChange}
            onApplyBrushPreset={applyBrushPreset}
            isEraserActive={tool === "eraser"}
            onSelectEraser={() => setTool("eraser")}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
          />
        )}
        <div className={`${styles.canvasArea} ${readOnlyBadge ? styles.dimmed : ""}`}>
          <CanvasStage
            shapes={shapes}
            peers={peers}
            activeTool={tool}
            strokeColor={strokeColor}
            strokeWidth={strokeWidth}
            opacity={opacity}
            blendMode={blendMode}
            selectedId={selectedId}
            onSelectShape={setSelectedId}
            readOnly={isViewer}
            onAddShape={addShape}
            onUpdateShape={updateShape}
            onSplitShape={splitShape}
            onRemoveShape={removeShape}
            onCursorMove={updateCursor}
          />
          {readOnlyBadge && <span className={styles.readOnlyPill}>read-only view</span>}
        </div>
      </div>
      <div className={styles.rail}>
        {isJoined ? (
          <CallStrip
            participants={participants}
            canPublish={canPublish}
            micEnabled={participants.find((p) => p.isLocal)?.micEnabled ?? false}
            cameraEnabled={participants.find((p) => p.isLocal)?.cameraEnabled ?? false}
            onToggleMic={handleToggleMic}
            onToggleCamera={handleToggleCamera}
            onLeave={handleLeaveCall}
          />
        ) : (
          <CallStatusCard peers={peers} />
        )}
        <BoardChatPanel
          messages={chatMessages}
          canPost={userId !== null}
          onSend={sendChatMessage}
          onReachTop={loadMoreChat}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the client workspace**

Run: `npx tsc -b client --noEmit`
Expected: no errors anywhere in `client/`.

- [ ] **Step 3: Run the full client test suite**

Run: `npm run test --workspace=client`
Expected: PASS — every existing test still passes, plus the new tests from Tasks 2 and 3.

- [ ] **Step 4: Manual browser walkthrough**

Run: `npm run dev --workspace=client` and `npm run dev --workspace=server` (or `docker-compose up` if that's the current dev setup), then open a board and check:
1. Draw a rectangle, ellipse, line, freehand stroke, and text with different colors/widths/opacities from the bar — each should render with the chosen style.
2. Click Pencil/Marker/Highlighter — confirm the tool switches to the pen and the next stroke drawn matches that preset's width/opacity; confirm the Highlighter stroke visibly darkens where it overlaps another stroke underneath (the multiply blend).
3. Select an already-drawn shape and change the bar's color/width/opacity — confirm it restyles that shape live, not just future shapes.
4. Click Eraser (or press `E`), drag it across the middle of a freehand stroke — confirm the stroke splits into two independent pieces. Drag it across a rectangle — confirm the whole rectangle disappears on first touch.
5. Draw a few shapes, then Ctrl+Z repeatedly — confirm they undo in reverse order — then Ctrl+Shift+Z to redo them back.
6. Open the same board in a second browser tab as a second identity; draw a stroke in tab A and a different stroke in tab B; press Ctrl+Z in tab A — confirm only tab A's stroke disappears, tab B's stroke is untouched.

- [ ] **Step 5: Commit**

```bash
git add client/src/canvas/BoardExperience.tsx
git commit -m "Wire drawing options, brush presets, eraser, and undo/redo into the board experience"
```

---

### Task 9: Multiplayer verification pass

**Files:** none (verification only).

- [ ] **Step 1: Dispatch the `multiplayer-sim-tester` subagent**

Prompt: "Verify two properties of the Phase 9a brushes/strokes work against the local dev server, using real concurrent Yjs/WebSocket clients (not mocks): (1) per-user undo isolation — have two simulated clients each draw a distinct freehand stroke on the same board, then have client A call undo; confirm client A's own stroke is removed from the shared doc and client B's stroke is untouched, then confirm client A's redo brings its stroke back. (2) concurrent-erase convergence — have both clients simultaneously erase overlapping/adjacent segments of the same freehand stroke (or near-simultaneous, sub-100ms apart); confirm the shared Yjs doc converges to a valid state afterward (no corrupted/partial shape entries, no duplicate ids) on both clients. Report exactly what you simulated and the outcome of each check."

- [ ] **Step 2: Review the findings and fix any issues before considering Phase 9a done**

If the sim-tester finds a convergence bug or an undo-isolation leak, fix it in the relevant file from Tasks 3 or 6 and re-run the affected unit tests (`npm run test --workspace=client -- src/canvas/yjs`) plus this verification pass before moving on.

---

## After this plan

Once all 9 tasks are done and verified, update `docs/ROADMAP.md`'s Phase 9 entry to check off the 9a line (only after the manual walkthrough and sim-tester pass both hold up — not just because the files exist), and move on to brainstorming 9b (Layers).
