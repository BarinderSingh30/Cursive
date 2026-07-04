import { createContext, useContext, useState, type ReactNode } from "react";
import type { Tool } from "@cursive/shared";

interface ActiveToolContextValue {
  tool: Tool;
  setTool: (tool: Tool) => void;
}

const ActiveToolContext = createContext<ActiveToolContextValue | null>(null);

export function ActiveToolProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<Tool>("select");
  return <ActiveToolContext.Provider value={{ tool, setTool }}>{children}</ActiveToolContext.Provider>;
}

export function useActiveTool() {
  const ctx = useContext(ActiveToolContext);
  if (!ctx) {
    throw new Error("useActiveTool must be used within an ActiveToolProvider");
  }
  return ctx;
}
