import { useRef, useState } from "react";
import { Layer, Stage as KonvaStage } from "react-konva";
import type Konva from "konva";
import type { Shape, Tool } from "@cursive/shared";
import { ShapeRenderer } from "./shapes/index.js";
import { RemoteCursors } from "./cursors/RemoteCursors.js";
import type { PresenceState } from "./yjs/useAwareness.js";

const DEFAULT_STROKE = "#1e1e1e";
const DEFAULT_STROKE_WIDTH = 2;

interface Props {
  shapes: Shape[];
  peers: Map<number, PresenceState>;
  activeTool: Tool;
  onAddShape: (shape: Shape) => void;
  onUpdateShape: (id: string, changes: Partial<Shape>) => void;
  onCursorMove: (cursor: { x: number; y: number } | null) => void;
}

export function CanvasStage({ shapes, peers, activeTool, onAddShape, onUpdateShape, onCursorMove }: Props) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const isDrawing = useRef(false);

  const getPointer = (stage: Konva.Stage) => stage.getPointerPosition();

  const startDraft = (x: number, y: number): Shape | null => {
    const id = crypto.randomUUID();
    switch (activeTool) {
      case "rectangle":
        return {
          id,
          type: "rectangle",
          x,
          y,
          width: 0,
          height: 0,
          rotation: 0,
          strokeColor: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          fillColor: null,
        };
      case "ellipse":
        return {
          id,
          type: "ellipse",
          x,
          y,
          radiusX: 0,
          radiusY: 0,
          rotation: 0,
          strokeColor: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
          fillColor: null,
        };
      case "line":
        return {
          id,
          type: "line",
          x: 0,
          y: 0,
          points: [x, y, x, y],
          rotation: 0,
          strokeColor: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
      case "freehand":
        return {
          id,
          type: "freehand",
          x: 0,
          y: 0,
          points: [x, y],
          rotation: 0,
          strokeColor: DEFAULT_STROKE,
          strokeWidth: DEFAULT_STROKE_WIDTH,
        };
      default:
        return null;
    }
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (activeTool === "select") return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = getPointer(stage);
    if (!pointer) return;

    if (activeTool === "text") {
      const text = window.prompt("Text:");
      if (text) {
        onAddShape({
          id: crypto.randomUUID(),
          type: "text",
          x: pointer.x,
          y: pointer.y,
          rotation: 0,
          strokeColor: DEFAULT_STROKE,
          strokeWidth: 0,
          text,
          fontSize: 20,
          fillColor: DEFAULT_STROKE,
        });
      }
      return;
    }

    isDrawing.current = true;
    setDraft(startDraft(pointer.x, pointer.y));
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = getPointer(stage);
    if (!pointer) return;

    onCursorMove(pointer);

    if (!isDrawing.current) return;

    setDraft((current) => {
      if (!current) return current;
      if (current.type === "rectangle") {
        return { ...current, width: pointer.x - current.x, height: pointer.y - current.y };
      }
      if (current.type === "ellipse") {
        return { ...current, radiusX: Math.abs(pointer.x - current.x), radiusY: Math.abs(pointer.y - current.y) };
      }
      if (current.type === "line") {
        return { ...current, points: [current.points[0], current.points[1], pointer.x, pointer.y] };
      }
      if (current.type === "freehand") {
        return { ...current, points: [...current.points, pointer.x, pointer.y] };
      }
      return current;
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (draft) onAddShape(draft);
    setDraft(null);
  };

  return (
    <KonvaStage
      width={window.innerWidth}
      height={window.innerHeight - 52}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer>
        {shapes.map((shape) => (
          <ShapeRenderer key={shape.id} shape={shape} onDragEnd={(x, y) => onUpdateShape(shape.id, { x, y })} />
        ))}
        {draft && <ShapeRenderer shape={draft} onDragEnd={() => {}} />}
      </Layer>
      <RemoteCursors peers={peers} />
    </KonvaStage>
  );
}
