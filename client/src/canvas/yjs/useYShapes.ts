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

/**
 * Boards drawn on before this phase have shapes with no `zIndex`/`locked`/
 * `groupId` keys at all — `toJSON()` on those comes back with `zIndex:
 * undefined`, which poisons `nextZIndex` into returning NaN and then fails
 * Zod's `z.number()` parse the instant anyone draws a new shape. Normalizing
 * at read time (rather than writing a migration) means it can never race a
 * concurrent client and stays undo-safe.
 */
function readShapes(yShapes: Y.Map<YShape>): Shape[] {
  return Array.from(yShapes.values()).map((yShape) => {
    const raw = yShape.toJSON() as Shape;
    return {
      ...raw,
      zIndex: Number.isFinite(raw.zIndex) ? raw.zIndex : 0,
      locked: raw.locked ?? false,
      groupId: raw.groupId ?? null,
    } as Shape;
  });
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
      // Reads live Yjs state (not the React-state `shapes` closure) so the
      // new shape's zIndex is computed from what's actually in the doc right
      // now, consistent with groupShapes/ungroupShapes.
      const parsedShape = shapeSchema.parse({ ...shape, zIndex: nextZIndex(readShapes(yShapes)) });
      doc.transact(() => {
        yShapes.set(parsedShape.id, shapeToYMap(parsedShape));
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
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
      doc.transact(() => {
        // Guard against deleting a locked shape here too — this must not
        // rely solely on callers pre-filtering, since a caller working off a
        // filtered/stale shape list (e.g. a hidden-and-locked shape missing
        // from a visible-only list) could otherwise pass a locked id through.
        const removedIds = new Set<string>();
        for (const id of ids) {
          const existing = yShapes.get(id);
          if (!existing || existing.get("locked")) continue;
          yShapes.delete(id);
          removedIds.add(id);
        }

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
      const idSet = new Set(ids);
      const allShapes = readShapes(yShapes);
      const members = allShapes.filter((s) => idSet.has(s.id));
      const topZIndex = members.length > 0 ? Math.max(...members.map((m) => m.zIndex)) : nextZIndex(allShapes);
      const assignments = packContiguous(members, topZIndex);
      doc.transact(() => {
        for (const member of members) {
          const map = yShapes.get(member.id);
          map?.set("groupId", groupId);
          map?.set("zIndex", assignments.get(member.id)!);
        }

        // Auto-dissolve any prior group that drops to <=1 remaining member
        // because some of its members just moved into the new group.
        const remaining = readShapes(yShapes).filter((s) => !idSet.has(s.id));
        const byGroup = new Map<string, Shape[]>();
        for (const shape of remaining) {
          if (!shape.groupId) continue;
          byGroup.set(shape.groupId, [...(byGroup.get(shape.groupId) ?? []), shape]);
        }
        for (const groupMembers of byGroup.values()) {
          if (groupMembers.length === 1) yShapes.get(groupMembers[0]!.id)?.set("groupId", null);
        }
      }, LOCAL_ORIGIN);
      return groupId;
    },
    [yShapes, doc],
  );

  const ungroupShapes = useCallback(
    (groupId: string) => {
      doc.transact(() => {
        for (const shape of readShapes(yShapes)) {
          if (shape.groupId === groupId) yShapes.get(shape.id)?.set("groupId", null);
        }
      }, LOCAL_ORIGIN);
    },
    [yShapes, doc],
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
