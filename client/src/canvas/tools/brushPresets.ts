export type BrushPreset = "pencil" | "marker" | "highlighter";

interface BrushPresetValues {
  strokeWidth: number;
  opacity: number;
  blendMode: "normal" | "multiply";
}

export const BRUSH_PRESETS: Record<BrushPreset, BrushPresetValues> = {
  pencil: { strokeWidth: 2, opacity: 1, blendMode: "normal" },
  marker: { strokeWidth: 6, opacity: 1, blendMode: "normal" },
  highlighter: { strokeWidth: 14, opacity: 0.35, blendMode: "multiply" },
};
