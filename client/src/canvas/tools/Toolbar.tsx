import { useEffect } from "react";
import { toolSchema, type Tool } from "@cursive/shared";
import { useActiveTool, PEN_COLORS } from "./useActiveTool.js";
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
};

export function Toolbar() {
  const { tool, setTool, penColor, setPenColor } = useActiveTool();

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
    <div className={styles.row}>
      <div className={styles.pill}>
        {toolSchema.options.map((option) => (
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
      <div className={styles.colorGroup}>
        <span className={styles.colorLabel}>pen colour</span>
        <div className={styles.swatches}>
          {PEN_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Pen colour ${color}`}
              onClick={() => setPenColor(color)}
              className={`${styles.swatch} ${penColor === color ? styles.swatchActive : ""}`}
              style={{ background: color, color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
