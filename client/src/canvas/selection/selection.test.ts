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
