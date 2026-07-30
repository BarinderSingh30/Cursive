import type { Shape } from "@cursive/shared";
import { boundingBox, rectsIntersect, type Box } from "./boundingBox.js";

/** Clicking a grouped shape selects the whole group; an ungrouped shape selects just itself. */
export function expandToGroup(shapes: Shape[], id: string): string[] {
  const shape = shapes.find((s) => s.id === id);
  if (!shape || !shape.groupId) return [id];
  return shapes.filter((s) => s.groupId === shape.groupId).map((s) => s.id);
}

export function toggleSelection(ids: string[], currentSelection: string[], shiftKey: boolean): string[] {
  if (!shiftKey) return ids;
  const isAlreadySelected = ids.some((id) => currentSelection.includes(id));
  if (isAlreadySelected) return currentSelection.filter((id) => !ids.includes(id));
  return [...currentSelection, ...ids.filter((id) => !currentSelection.includes(id))];
}

export function resolveClickSelection(
  shapes: Shape[],
  clickedId: string,
  currentSelection: string[],
  shiftKey: boolean,
): string[] {
  return toggleSelection(expandToGroup(shapes, clickedId), currentSelection, shiftKey);
}

/** Shapes whose bounding box intersects the marquee rectangle, excluding locked shapes. Hidden shapes never reach this function — they're filtered out of the `shapes` array before it gets here (BoardExperience.tsx). */
export function shapesInMarquee(shapes: Shape[], marquee: Box): string[] {
  return shapes.filter((s) => !s.locked && rectsIntersect(boundingBox(s), marquee)).map((s) => s.id);
}
