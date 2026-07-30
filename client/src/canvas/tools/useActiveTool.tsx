import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Tool } from "@cursive/shared";
import { BRUSH_PRESETS, type BrushPreset } from "./brushPresets.js";

export const STROKE_COLORS = ["#4A3B2A", "#E24B3A", "#3D7A5A", "#1971C2", "#B5451F"];

const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_OPACITY = 1;

interface ActiveToolContextValue {
  tool: Tool;
  setTool: (tool: Tool) => void;
  strokeColor: string;
  setStrokeColor: (color: string) => void;
  strokeWidth: number;
  setStrokeWidth: (width: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  blendMode: "normal" | "multiply";
  applyBrushPreset: (preset: BrushPreset) => void;
}

const ActiveToolContext = createContext<ActiveToolContextValue | null>(null);

export function ActiveToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState<string>(STROKE_COLORS[0]!);
  const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_STROKE_WIDTH);
  const [opacity, setOpacity] = useState<number>(DEFAULT_OPACITY);
  const [blendMode, setBlendMode] = useState<"normal" | "multiply">("normal");

  const applyBrushPreset = useCallback((preset: BrushPreset) => {
    const values = BRUSH_PRESETS[preset];
    setTool("freehand");
    setStrokeWidth(values.strokeWidth);
    setOpacity(values.opacity);
    setBlendMode(values.blendMode);
  }, []);

  return (
    <ActiveToolContext.Provider
      value={{
        tool,
        setTool,
        strokeColor,
        setStrokeColor,
        strokeWidth,
        setStrokeWidth,
        opacity,
        setOpacity,
        blendMode,
        applyBrushPreset,
      }}
    >
      {children}
    </ActiveToolContext.Provider>
  );
}

export function useActiveTool() {
  const ctx = useContext(ActiveToolContext);
  if (!ctx) {
    throw new Error("useActiveTool must be used within an ActiveToolProvider");
  }
  return ctx;
}
