import { useCallback, useEffect, useMemo, useState } from "react";
import type * as Y from "yjs";
import { shapeSchema, type Shape } from "@cursive/shared";

export function useYShapes(doc: Y.Doc) {
  const yShapes = useMemo(() => doc.getMap<Shape>("shapes"), [doc]);
  const [shapes, setShapes] = useState<Shape[]>(() => Array.from(yShapes.values()));

  useEffect(() => {
    const sync = () => setShapes(Array.from(yShapes.values()));
    sync();
    yShapes.observe(sync);
    return () => yShapes.unobserve(sync);
  }, [yShapes]);

  const addShape = useCallback(
    (shape: Shape) => {
      shapeSchema.parse(shape);
      yShapes.set(shape.id, shape);
    },
    [yShapes],
  );

  const updateShape = useCallback(
    (id: string, changes: Partial<Shape>) => {
      const existing = yShapes.get(id);
      if (!existing) return;
      yShapes.set(id, { ...existing, ...changes } as Shape);
    },
    [yShapes],
  );

  const removeShape = useCallback(
    (id: string) => {
      yShapes.delete(id);
    },
    [yShapes],
  );

  return { shapes, addShape, updateShape, removeShape };
}
