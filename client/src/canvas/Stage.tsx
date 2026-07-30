import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage as KonvaStage } from "react-konva";
import type Konva from "konva";
import type { Shape, Tool } from "@cursive/shared";
import { ShapeRenderer } from "./shapes/index.js";
import { RemoteCursors } from "./cursors/RemoteCursors.js";
import type { PresenceState } from "./yjs/useAwareness.js";
import { isFarEnoughToSample } from "./tools/pointSampling.js";
import { eraseFromPoints } from "./tools/eraser.js";

const MIN_DRAG_DISTANCE = 3;
const MIN_POINT_DISTANCE = 4;

interface Props {
  shapes: Shape[];
  peers: Map<number, PresenceState>;
  activeTool: Tool;
  /** Style used for newly-drawn shapes — the drawing-options bar's current defaults. */
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  blendMode: "normal" | "multiply";
  selectedId: string | null;
  onSelectShape: (id: string | null) => void;
  readOnly?: boolean;
  onAddShape: (shape: Shape) => void;
  onUpdateShape: (id: string, changes: Partial<Shape>) => void;
  onSplitShape: (id: string, replacements: Shape[]) => void;
  onRemoveShape: (id: string) => void;
  onCursorMove: (cursor: { x: number; y: number } | null) => void;
}

// Sizes the stage to the space its own container actually has, not the full
// window — the container shrinks when the chat sidebar is open, and the
// canvas must shrink with it. Using window.innerWidth here previously made
// the (invisible) canvas 300px wider than its box; because Konva's stage div
// is `position: relative`, CSS paints positioned elements above plain
// in-flow siblings regardless of DOM order, so that overflow silently sat on
// top of the chat panel and swallowed every click meant for it.
function useContainerSize(ref: { current: HTMLDivElement | null }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

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

export function CanvasStage({
  shapes,
  peers,
  activeTool,
  strokeColor,
  strokeWidth,
  opacity,
  blendMode,
  selectedId,
  onSelectShape,
  readOnly = false,
  onAddShape,
  onUpdateShape,
  onSplitShape,
  onRemoveShape,
  onCursorMove,
}: Props) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const [eraserPreview, setEraserPreview] = useState<{ x: number; y: number } | null>(null);
  const isDrawing = useRef(false);
  const isErasing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);
  const eraserRadius = Math.max(strokeWidth, 8);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        onRemoveShape(selectedId);
        onSelectShape(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, onRemoveShape, onSelectShape, readOnly]);

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
          strokeColor,
          strokeWidth,
          opacity,
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
          strokeColor,
          strokeWidth,
          opacity,
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
          strokeColor,
          strokeWidth,
          opacity,
        };
      case "freehand":
        return {
          id,
          type: "freehand",
          x: 0,
          y: 0,
          points: [x, y],
          rotation: 0,
          strokeColor,
          strokeWidth,
          opacity,
          blendMode,
        };
      default:
        return null;
    }
  };

  // Only freehand strokes can be meaningfully split at the erased point
  // range; every other shape type is deleted outright on first touch.
  const eraseAtPointer = (e: Konva.KonvaEventObject<MouseEvent>, pointer: { x: number; y: number }) => {
    const stage = e.target.getStage();
    if (!stage || e.target === stage) return;
    const hitId = e.target.id();
    if (!hitId) return;
    const shape = shapes.find((s) => s.id === hitId);
    if (!shape) return;

    if (shape.type === "freehand") {
      const runs = eraseFromPoints(shape.points, pointer.x - shape.x, pointer.y - shape.y, eraserRadius);
      if (runs.length === 0) {
        onRemoveShape(shape.id);
      } else if (runs.length === 1) {
        const totalPoints = runs.reduce((sum, run) => sum + run.length, 0);
        if (totalPoints === shape.points.length) return;
        onUpdateShape(shape.id, { points: runs[0]! });
      } else {
        onSplitShape(
          shape.id,
          runs.map((points) => ({ ...shape, id: crypto.randomUUID(), points })),
        );
      }
      return;
    }

    onRemoveShape(shape.id);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;

    if (e.target === stage) {
      onSelectShape(null);
    }

    if (activeTool === "eraser") {
      isErasing.current = true;
      const pointer = getPointer(stage);
      if (pointer) eraseAtPointer(e, pointer);
      return;
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
          strokeColor,
          strokeWidth: 0,
          opacity,
          text,
          fontSize: 20,
          fillColor: strokeColor,
        });
      }
      return;
    }

    isDrawing.current = true;
    setDraft(startDraft(pointer.x, pointer.y));
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = getPointer(stage);
    if (!pointer) return;

    onCursorMove(pointer);

    if (activeTool === "eraser") setEraserPreview(pointer);

    if (e.evt.buttons === 0) {
      isErasing.current = false;
      isDrawing.current = false;
      return;
    }

    if (activeTool === "eraser") {
      if (isErasing.current) eraseAtPointer(e, pointer);
      return;
    }

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
        const lastX = current.points[current.points.length - 2]!;
        const lastY = current.points[current.points.length - 1]!;
        if (!isFarEnoughToSample(lastX, lastY, pointer.x, pointer.y, MIN_POINT_DISTANCE)) return current;
        return { ...current, points: [...current.points, pointer.x, pointer.y] };
      }
      return current;
    });
  };

  const handleMouseUp = () => {
    if (activeTool === "eraser") {
      isErasing.current = false;
      return;
    }
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (draft && !isDegenerate(draft)) onAddShape(draft);
    setDraft(null);
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setEraserPreview(null);
  };

  useEffect(() => {
    if (activeTool !== "eraser") setEraserPreview(null);
  }, [activeTool]);

  return (
    <div
      ref={containerRef}
      className="canvas-dot-grid"
      style={{ width: "100%", height: "100%", cursor: activeTool === "eraser" ? "none" : undefined }}
    >
      <KonvaStage
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <Layer>
          {shapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              draggable={!readOnly && activeTool === "select"}
              isSelected={shape.id === selectedId}
              onDragEnd={(x, y) => onUpdateShape(shape.id, { x, y })}
              onClick={() => {
                if (!readOnly && activeTool === "select") onSelectShape(shape.id);
              }}
            />
          ))}
          {draft && <ShapeRenderer shape={draft} draggable={false} isSelected={false} onDragEnd={() => {}} onClick={() => {}} />}
          {activeTool === "eraser" && eraserPreview && (
            <Rect
              x={eraserPreview.x}
              y={eraserPreview.y}
              offsetX={eraserRadius * 1.1}
              offsetY={eraserRadius * 0.75}
              width={eraserRadius * 2.2}
              height={eraserRadius * 1.5}
              cornerRadius={eraserRadius * 0.3}
              rotation={-8}
              fill="#ffdce4"
              stroke="#96677a"
              strokeWidth={1.5}
              shadowColor="black"
              shadowBlur={6}
              shadowOffsetX={2}
              shadowOffsetY={3}
              shadowOpacity={0.35}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </Layer>
        <RemoteCursors peers={peers} />
      </KonvaStage>
    </div>
  );
}
