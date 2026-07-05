import { describe, expect, it } from "vitest";
import { orderedPair } from "./orderedPair.js";

describe("orderedPair", () => {
  it("returns the smaller id first regardless of argument order", () => {
    expect(orderedPair("b", "a")).toEqual(["a", "b"]);
    expect(orderedPair("a", "b")).toEqual(["a", "b"]);
  });

  it("is stable for the same pair called in either order", () => {
    expect(orderedPair("user-2", "user-1")).toEqual(orderedPair("user-1", "user-2"));
  });
});
