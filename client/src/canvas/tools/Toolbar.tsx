import { useEffect } from "react";
import { toolSchema, type Tool } from "@cursive/shared";
import { useActiveTool } from "./useActiveTool.js";
import styles from "./Toolbar.module.css";

const TOOL_LABELS: Record<string, string> = {
  select: "Select",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  freehand: "Pen",
  text: "Text",
};

const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: "select",
  r: "rectangle",
  o: "ellipse",
  l: "line",
  p: "freehand",
  t: "text",
  e: "eraser",
};

const PILL_TOOLS = toolSchema.options.filter((option) => option !== "eraser");

export function Toolbar() {
  const { tool, setTool } = useActiveTool();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key === "Escape") {
        setTool("select");
        return;
      }
      const next = TOOL_SHORTCUTS[e.key.toLowerCase()];
      if (next) setTool(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setTool]);

  return (
    <div className={styles.pill}>
      {PILL_TOOLS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setTool(option)}
          className={`${styles.tool} ${tool === option ? styles.toolActive : ""}`}
        >
          {TOOL_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
