import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { shapeSchema, type Shape } from "@cursive/shared";
import { LOCAL_ORIGIN } from "./localOrigin.js";
import { nextZIndex, packContiguous } from "../tools/zOrder.js";

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
      const parsedShape = shapeSchema.parse({ ...shape, zIndex: nextZIndex(shapes) });
      doc.transact(() => {
        yShapes.set(parsedShape.id, shapeToYMap(parsedShape));
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc, shapes],
  );

  const updateShape = useCallback(
    (id: string, changes: Partial<Shape>) => {
      const existing = yShapes.get(id);
      if (!existing) return;
      doc.transact(() => {
        for (const [key, value] of Object.entries(changes)) {
          existing.set(key, value);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  /** Bulk restyle for multi-select — skips locked shapes, one transaction. */
  const updateShapes = useCallback(
    (updates: { id: string; changes: Partial<Shape> }[]) => {
      doc.transact(() => {
        for (const { id, changes } of updates) {
          const existing = yShapes.get(id);
          if (!existing || existing.get("locked")) continue;
          for (const [key, value] of Object.entries(changes)) {
            existing.set(key, value);
          }
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  /** Bulk drag-move for multi-select — skips locked shapes, one transaction. */
  const moveShapes = useCallback(
    (moves: { id: string; x: number; y: number }[]) => {
      doc.transact(() => {
        for (const { id, x, y } of moves) {
          const existing = yShapes.get(id);
          if (!existing || existing.get("locked")) continue;
          existing.set("x", x);
          existing.set("y", y);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const removeShapes = useCallback(
    (ids: string[]) => {
      const removedIds = new Set(ids);
      doc.transact(() => {
        for (const id of ids) yShapes.delete(id);

        // Auto-dissolve any group that drops to <=1 remaining member.
        const remaining = readShapes(yShapes).filter((s) => !removedIds.has(s.id));
        const byGroup = new Map<string, Shape[]>();
        for (const shape of remaining) {
          if (!shape.groupId) continue;
          byGroup.set(shape.groupId, [...(byGroup.get(shape.groupId) ?? []), shape]);
        }
        for (const members of byGroup.values()) {
          if (members.length === 1) yShapes.get(members[0]!.id)?.set("groupId", null);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const removeShape = useCallback((id: string) => removeShapes([id]), [removeShapes]);

  /**
   * Atomically replaces one shape with zero or more others in a single
   * transaction — used by the eraser to split a freehand stroke without
   * ever syncing a half-finished intermediate state.
   */
  const splitShape = useCallback(
    (id: string, replacements: Shape[]) => {
      const parsedReplacements = replacements.map((s) => shapeSchema.parse(s));
      doc.transact(() => {
        yShapes.delete(id);
        for (const shape of parsedReplacements) {
          yShapes.set(shape.id, shapeToYMap(shape));
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const reorderShapes = useCallback(
    (assignments: Map<string, number>) => {
      doc.transact(() => {
        for (const [id, zIndex] of assignments) yShapes.get(id)?.set("zIndex", zIndex);
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  const groupShapes = useCallback(
    (ids: string[]): string => {
      const groupId = `group-${crypto.randomUUID()}`;
      const members = shapes.filter((s) => ids.includes(s.id));
      const topZIndex = members.length > 0 ? Math.max(...members.map((m) => m.zIndex)) : nextZIndex(shapes);
      const assignments = packContiguous(members, topZIndex);
      doc.transact(() => {
        for (const member of members) {
          const map = yShapes.get(member.id);
          map?.set("groupId", groupId);
          map?.set("zIndex", assignments.get(member.id)!);
        }
      }, LOCAL_ORIGIN);
      return groupId;
    },
    [yShapes, doc, shapes],
  );

  const ungroupShapes = useCallback(
    (groupId: string) => {
      doc.transact(() => {
        for (const shape of shapes) {
          if (shape.groupId === groupId) yShapes.get(shape.id)?.set("groupId", null);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc, shapes],
  );

  const setLocked = useCallback(
    (ids: string[], locked: boolean) => {
      doc.transact(() => {
        for (const id of ids) yShapes.get(id)?.set("locked", locked);
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
  );

  return {
    shapes,
    addShape,
    updateShape,
    updateShapes,
    moveShapes,
    removeShape,
    removeShapes,
    splitShape,
    reorderShapes,
    groupShapes,
    ungroupShapes,
    setLocked,
  };
}
