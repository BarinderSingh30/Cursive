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
