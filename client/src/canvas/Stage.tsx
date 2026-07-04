import { useEffect, useRef, useState } from "react";
import { Layer, Stage as KonvaStage } from "react-konva";
import type Konva from "konva";
import type { Shape, Tool } from "@cursive/shared";
import { ShapeRenderer } from "./shapes/index.js";
import { RemoteCursors } from "./cursors/RemoteCursors.js";
import type { PresenceState } from "./yjs/useAwareness.js";

const DEFAULT_STROKE = "#1e1e1e";
const DEFAULT_STROKE_WIDTH = 2;
const MIN_DRAG_DISTANCE = 3;
const TOOLBAR_HEIGHT = 52;

interface Props {
  shapes: Shape[];
  peers: Map<number, PresenceState>;
  activeTool: Tool;
  onAddShape: (shape: Shape) => void;
  onUpdateShape: (id: string, changes: Partial<Shape>) => void;
  onRemoveShape: (id: string) => void;
  onCursorMove: (cursor: { x: number; y: number } | null) => void;
}

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight - TOOLBAR_HEIGHT });

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight - TOOLBAR_HEIGHT });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

function isDegenerate(shape: Shape): boolean {
  if (shape.type === "rectangle") {
    return Math.abs(shape.width) < MIN_DRAG_DISTANCE && Math.abs(shape.height) < MIN_DRAG_DISTANCE;
  }
  if (shape.type === "ellipse") {
    return shape.radiusX < MIN_DRAG_DISTANCE && shape.radiusY < MIN_DRAG_DISTANCE;
  }
  if (shape.type === "line") {
    const [x1, y1, x2, y2] = shape.points;
    return Math.abs(x2 - x1) < MIN_DRAG_DISTANCE && Math.abs(y2 - y1) < MIN_DRAG_DISTANCE;
  }
  if (shape.type === "freehand") {
    return shape.points.length <= 2;
  }
  return false;
}

export function CanvasStage({ shapes, peers, activeTool, onAddShape, onUpdateShape, onRemoveShape, onCursorMove }: Props) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDrawing = useRef(false);
  const size = useWindowSize();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        onRemoveShape(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, onRemoveShape]);

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
    const stage = e.target.getStage();
    if (!stage) return;

    if (e.target === stage) {
      setSelectedId(null);
    }

    if (activeTool === "select") return;
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
    if (draft && !isDegenerate(draft)) onAddShape(draft);
    setDraft(null);
  };

  return (
    <KonvaStage
      width={size.width}
      height={size.height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <Layer>
        {shapes.map((shape) => (
          <ShapeRenderer
            key={shape.id}
            shape={shape}
            draggable={activeTool === "select"}
            isSelected={shape.id === selectedId}
            onDragEnd={(x, y) => onUpdateShape(shape.id, { x, y })}
            onClick={() => {
              if (activeTool === "select") setSelectedId(shape.id);
            }}
          />
        ))}
        {draft && <ShapeRenderer shape={draft} draggable={false} isSelected={false} onDragEnd={() => {}} onClick={() => {}} />}
      </Layer>
      <RemoteCursors peers={peers} />
    </KonvaStage>
  );
}
