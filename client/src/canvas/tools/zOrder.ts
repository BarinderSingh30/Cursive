import type { Shape } from "@cursive/shared";

const INITIAL_GAP = 1000;

export function sortByZIndexAscending(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
}

export function sortByZIndexDescending(shapes: Shape[]): Shape[] {
  return [...shapes].sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id));
}

/**
 * Where a newly-created shape lands: on top of everything else.
 *
 * Filters to finite zIndex values before taking the max so a legacy shape
 * (persisted before zIndex existed, coming back as `undefined`) can never
 * turn this into `Math.max(...[NaN, ...])` === NaN — a NaN zIndex fails Zod's
 * `z.number()` parse the moment anyone tries to draw on an old board.
 */
export function nextZIndex(shapes: Shape[]): number {
  const finite = shapes.map((s) => s.zIndex).filter((z) => Number.isFinite(z));
  if (finite.length === 0) return INITIAL_GAP;
  return Math.max(...finite) + INITIAL_GAP;
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
