import * as Y from "yjs";
import type { Shape } from "@cursive/shared";

// Board cards only need enough shapes to sketch a recognizable preview, not
// the whole document — caps both the CPU cost of decoding a large board's
// history and the response payload size for a list of many boards.
const MAX_THUMBNAIL_SHAPES = 60;

/**
 * Decodes a board's persisted Yjs update (see collab/persistence.ts) into a
 * capped array of shapes for a static thumbnail preview — mirrors exactly
 * how the client's useYShapes reads the "shapes" map off the live document,
 * just applied to a throwaway Y.Doc instead of a synced one.
 */
export function decodeThumbnailShapes(content: Uint8Array | null): Shape[] {
  if (!content || content.length === 0) return [];
  try {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, content);
    const yShapes = doc.getMap<Y.Map<unknown>>("shapes");
    return Array.from(yShapes.values())
      .slice(0, MAX_THUMBNAIL_SHAPES)
      .map((yShape) => yShape.toJSON() as Shape);
  } catch {
    // A corrupt or unreadable update shouldn't break the board list —
    // worst case the card just renders without a preview.
    return [];
  }
}
