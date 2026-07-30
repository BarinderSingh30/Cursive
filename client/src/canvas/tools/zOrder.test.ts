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
