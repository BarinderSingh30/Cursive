import { describe, expect, it } from "vitest";
import { isFarEnoughToSample } from "./pointSampling.js";

describe("isFarEnoughToSample", () => {
  it("rejects a point closer than minDistance", () => {
    expect(isFarEnoughToSample(0, 0, 2, 0, 4)).toBe(false);
  });

  it("accepts a point at exactly minDistance", () => {
    expect(isFarEnoughToSample(0, 0, 4, 0, 4)).toBe(true);
  });

  it("accepts a point farther than minDistance", () => {
    expect(isFarEnoughToSample(0, 0, 10, 10, 4)).toBe(true);
  });

  it("rejects a point that hasn't moved at all", () => {
    expect(isFarEnoughToSample(5, 5, 5, 5, 4)).toBe(false);
  });
});
