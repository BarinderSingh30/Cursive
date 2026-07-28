import { createContext, useContext, useState, type ReactNode } from "react";
import type { Tool } from "@cursive/shared";

export const PEN_COLORS = ["#4A3B2A", "#E24B3A", "#3D7A5A", "#1971C2", "#B5451F"];

interface ActiveToolContextValue {
  tool: Tool;
  setTool: (tool: Tool) => void;
  penColor: string;
  setPenColor: (color: string) => void;
}

const ActiveToolContext = createContext<ActiveToolContextValue | null>(null);

export function ActiveToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]!);
  return (
    <ActiveToolContext.Provider value={{ tool, setTool, penColor, setPenColor }}>
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
