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
