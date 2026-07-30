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
