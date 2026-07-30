/**
 * Removes every point within `radius` of (eraserX, eraserY) from a flat
 * [x0, y0, x1, y1, ...] points array, and splits what's left into separate
 * runs wherever a gap opens up. A run needs at least 2 points (4 numbers)
 * to render as a Konva Line, so shorter leftover fragments are dropped.
 */
export function eraseFromPoints(
  points: number[],
  eraserX: number,
  eraserY: number,
  radius: number,
): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  const radiusSquared = radius * radius;

  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    const dx = x - eraserX;
    const dy = y - eraserY;
    if (dx * dx + dy * dy <= radiusSquared) {
      if (current.length >= 4) runs.push(current);
      current = [];
    } else {
      current.push(x, y);
    }
  }
  if (current.length >= 4) runs.push(current);
  return runs;
}
