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
