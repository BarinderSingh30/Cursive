import { describe, expect, it } from "vitest";
import { eraseFromPoints } from "./eraser.js";

describe("eraseFromPoints", () => {
  it("returns the original run untouched when the eraser hits nothing", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(eraseFromPoints(points, 100, 100, 5)).toEqual([points]);
  });

  it("clips precisely at the circle boundary instead of dropping the whole segment", () => {
    // A fast/coarse stroke can have widely-spaced sample points; erasing
    // near one of them must only remove the touched sliver of the segment,
    // not the entire stretch down to the next surviving point.
    const points = [0, 0, 100, 0];
    expect(eraseFromPoints(points, 100, 0, 10)).toEqual([[0, 0, 90, 0]]);
  });

  it("trims one end at the exact circle boundary when the eraser hits the first point", () => {
    const points = [0, 0, 10, 0, 20, 0, 30, 0];
    expect(eraseFromPoints(points, 0, 0, 5)).toEqual([[5, 0, 10, 0, 20, 0, 30, 0]]);
  });

  it("splits into two runs, each cut at the exact circle boundary, when the eraser hits the middle", () => {
    const points = [0, 0, 10, 0, 20, 0, 30, 0, 40, 0];
    expect(eraseFromPoints(points, 20, 0, 5)).toEqual([
      [0, 0, 10, 0, 15, 0],
      [25, 0, 30, 0, 40, 0],
    ]);
  });

  it("returns no runs when the whole stroke is erased", () => {
    const points = [0, 0, 5, 0, 10, 0];
    expect(eraseFromPoints(points, 5, 0, 50)).toEqual([]);
  });

  it("keeps precisely-clipped fragments on both sides of a middle hit even though the original bounding points are gone", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(eraseFromPoints(points, 10, 0, 5)).toEqual([
      [0, 0, 5, 0],
      [15, 0, 20, 0],
    ]);
  });

  it("is a structural no-op when the eraser misses every point in the stroke", () => {
    // This is the exact case Stage.tsx's eraseAtPointer must detect and skip:
    // a single run whose point count matches the original, meaning nothing
    // was actually erased, so no update should be broadcast to peers.
    const points = [0, 0, 10, 0, 20, 0, 30, 0];
    const runs = eraseFromPoints(points, 1000, 1000, 5);
    expect(runs).toEqual([points]);
    expect(runs.length).toBe(1);
    expect(runs[0]!.length).toBe(points.length);
  });
});
