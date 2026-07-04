import { toolSchema } from "@cursive/shared";
import { useActiveTool } from "./useActiveTool.js";

const TOOL_LABELS: Record<string, string> = {
  select: "Select",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Line",
  freehand: "Pen",
  text: "Text",
};

export function Toolbar() {
  const { tool, setTool } = useActiveTool();

  return (
    <div style={{ display: "flex", gap: 4 }}>
      {toolSchema.options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setTool(option)}
          style={{
            padding: "6px 12px",
            border: "1px solid #d0d0d0",
            borderRadius: 6,
            background: tool === option ? "#1971c2" : "#fff",
            color: tool === option ? "#fff" : "#1e1e1e",
            cursor: "pointer",
          }}
        >
          {TOOL_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
