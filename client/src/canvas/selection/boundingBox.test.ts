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
