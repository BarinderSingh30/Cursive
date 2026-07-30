import { describe, expect, it } from "vitest";
import { eraseFromPoints } from "./eraser.js";

describe("eraseFromPoints", () => {
  it("returns the original run untouched when the eraser hits nothing", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(eraseFromPoints(points, 100, 100, 5)).toEqual([points]);
  });

  it("trims one end when the eraser hits the first point", () => {
    const points = [0, 0, 10, 0, 20, 0, 30, 0];
    expect(eraseFromPoints(points, 0, 0, 5)).toEqual([[10, 0, 20, 0, 30, 0]]);
  });

  it("splits into two runs when the eraser hits the middle", () => {
    const points = [0, 0, 10, 0, 20, 0, 30, 0, 40, 0];
    expect(eraseFromPoints(points, 20, 0, 5)).toEqual([
      [0, 0, 10, 0],
      [30, 0, 40, 0],
    ]);
  });

  it("returns no runs when the whole stroke is erased", () => {
    const points = [0, 0, 5, 0, 10, 0];
    expect(eraseFromPoints(points, 5, 0, 50)).toEqual([]);
  });

  it("drops a leftover fragment with fewer than 2 points", () => {
    const points = [0, 0, 10, 0, 20, 0];
    expect(eraseFromPoints(points, 10, 0, 5)).toEqual([]);
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
