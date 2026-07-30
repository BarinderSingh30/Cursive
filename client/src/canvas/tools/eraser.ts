/**
 * For the segment from (ax, ay) to (bx, by), returns the sub-intervals of
 * t in [0, 1] where the segment lies outside the circle centered at
 * (cx, cy) with the given radius. Solves |A + t(B-A) - C|^2 = r^2 for t to
 * find exactly where the segment crosses the circle boundary, so a stroke
 * gets cut at the true geometric edge of the eraser regardless of how far
 * apart its sampled points happen to be.
 */
function segmentOutsideCircleIntervals(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  radius: number,
): [number, number][] {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  const isOutsideWhole = fx * fx + fy * fy > radius * radius;

  if (a === 0) {
    // Zero-length segment: it's either entirely outside or entirely inside.
    return isOutsideWhole ? [[0, 1]] : [];
  }

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant <= 0) {
    // The segment's infinite line never crosses the circle boundary.
    return c > 0 ? [[0, 1]] : [];
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const r1 = (-b - sqrtDiscriminant) / (2 * a);
  const r2 = (-b + sqrtDiscriminant) / (2 * a);
  const enter = Math.max(Math.min(r1, r2), 0);
  const exit = Math.min(Math.max(r1, r2), 1);

  if (enter >= exit) {
    // The circle crosses the segment's line, but outside the [0, 1] range.
    return c > 0 ? [[0, 1]] : [];
  }

  const intervals: [number, number][] = [];
  if (enter > 0) intervals.push([0, enter]);
  if (exit < 1) intervals.push([exit, 1]);
  return intervals;
}

function pointAt(ax: number, ay: number, bx: number, by: number, t: number): [number, number] {
  return [ax + t * (bx - ax), ay + t * (by - ay)];
}

/**
 * Clips a freehand stroke's flat [x0, y0, x1, y1, ...] points array against
 * the eraser circle at (eraserX, eraserY), keeping only the portions of the
 * stroke that lie outside it. Cuts land at the exact circle boundary — not
 * just at whichever sampled points happen to fall inside — so a sparse or
 * fast-drawn stroke erases just as precisely as a densely-sampled one.
 * Splits what's left into separate runs wherever a gap opens up. A run
 * needs at least 2 points (4 numbers) to render as a Konva Line, so shorter
 * leftover fragments are dropped.
 */
export function eraseFromPoints(
  points: number[],
  eraserX: number,
  eraserY: number,
  radius: number,
): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];

  const flush = () => {
    if (current.length >= 4) runs.push(current);
    current = [];
  };

  const pointCount = points.length / 2;
  for (let i = 0; i < pointCount - 1; i++) {
    const ax = points[i * 2]!;
    const ay = points[i * 2 + 1]!;
    const bx = points[(i + 1) * 2]!;
    const by = points[(i + 1) * 2 + 1]!;

    const intervals = segmentOutsideCircleIntervals(ax, ay, bx, by, eraserX, eraserY, radius);

    if (intervals.length === 0) {
      flush();
      continue;
    }

    for (const [t0, t1] of intervals) {
      if (t0 > 0 || current.length === 0) {
        flush();
        const [startX, startY] = pointAt(ax, ay, bx, by, t0);
        current.push(startX, startY);
      }
      const [endX, endY] = pointAt(ax, ay, bx, by, t1);
      current.push(endX, endY);
      if (t1 < 1) flush();
    }
  }
  flush();
  return runs;
}
