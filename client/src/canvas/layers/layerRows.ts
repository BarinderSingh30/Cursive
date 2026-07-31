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
