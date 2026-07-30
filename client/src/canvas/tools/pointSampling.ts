/**
 * Whether a newly-captured raw pointer position is far enough from the
 * last sampled point to be worth keeping. Filters mouse-jitter noise out
 * of freehand strokes before it reaches the synced points array — Konva's
 * `tension` prop still handles the actual visual curve smoothing on top.
 */
export function isFarEnoughToSample(
  lastX: number,
  lastY: number,
  x: number,
  y: number,
  minDistance: number,
): boolean {
  const dx = x - lastX;
  const dy = y - lastY;
  return dx * dx + dy * dy >= minDistance * minDistance;
}
