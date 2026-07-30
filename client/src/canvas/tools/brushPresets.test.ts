import { describe, expect, it } from "vitest";
import { BRUSH_PRESETS } from "./brushPresets.js";

describe("BRUSH_PRESETS", () => {
  it("pencil is thin, opaque, and normal blend", () => {
    expect(BRUSH_PRESETS.pencil).toEqual({ strokeWidth: 2, opacity: 1, blendMode: "normal" });
  });

  it("marker is thicker but still fully opaque", () => {
    expect(BRUSH_PRESETS.marker).toEqual({ strokeWidth: 6, opacity: 1, blendMode: "normal" });
  });

  it("highlighter is wider than marker, translucent, and multiply-blended", () => {
    expect(BRUSH_PRESETS.highlighter.strokeWidth).toBeGreaterThan(BRUSH_PRESETS.marker.strokeWidth);
    expect(BRUSH_PRESETS.highlighter.opacity).toBeLessThan(1);
    expect(BRUSH_PRESETS.highlighter.blendMode).toBe("multiply");
  });
});
