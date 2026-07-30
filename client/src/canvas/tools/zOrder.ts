import type { Shape } from "@cursive/shared";

const INITIAL_GAP = 1000;

export function sortByZIndexAscending(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
}

export function sortByZIndexDescending(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id));
}

/** Where a newly-created shape lands: on top of everything else. */
export function nextZIndex(shapes: Shape[]): number {
  if (shapes.length === 0) return INITIAL_GAP;
  return Math.max(...shapes.map((s) => s.zIndex)) + INITIAL_GAP;
}

/**
 * Assigns each member a descending integer zIndex starting at topZIndex,
 * preserving their existing relative order — used when grouping shapes so
 * the group occupies one contiguous stacking range (with 1000-unit gaps
 * around it, a foreign shape landing exactly on one of these integers is
 * astronomically unlikely at whiteboard scale).
 */
export function packContiguous(members: Shape[], topZIndex: number): Map<string, number> {
  const sorted = sortByZIndexDescending(members);
  const assignments = new Map<string, number>();
  sorted.forEach((member, i) => assignments.set(member.id, topZIndex - i));
  return assignments;
}
