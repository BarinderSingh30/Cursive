import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { shapeSchema, type Shape } from "@cursive/shared";

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
      yShapes.set(shape.id, shapeToYMap(shape));
    },
    [yShapes],
  );

  const updateShape = useCallback(
    (id: string, changes: Partial<Shape>) => {
      const existing = yShapes.get(id);
      if (!existing) return;
      doc.transact(() => {
        for (const [key, value] of Object.entries(changes)) {
          existing.set(key, value);
        }
      });
    },
    [yShapes, doc],
  );

  const removeShape = useCallback(
    (id: string) => {
      yShapes.delete(id);
    },
    [yShapes],
  );

  return { shapes, addShape, updateShape, removeShape };
}
