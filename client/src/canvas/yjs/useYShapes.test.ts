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
    zIndex: 1000,
    locked: false,
    groupId: null,
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
});
