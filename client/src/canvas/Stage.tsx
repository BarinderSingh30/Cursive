import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage as KonvaStage } from "react-konva";
import type Konva from "konva";
import type { Shape, Tool } from "@cursive/shared";
import { ShapeRenderer } from "./shapes/index.js";
import { RemoteCursors } from "./cursors/RemoteCursors.js";
import type { PresenceState } from "./yjs/useAwareness.js";
import { isFarEnoughToSample } from "./tools/pointSampling.js";
import { eraseFromPoints } from "./tools/eraser.js";
import { sortByZIndexAscending } from "./tools/zOrder.js";
import { resolveClickSelection, shapesInMarquee } from "./selection/selection.js";
import type { Box } from "./selection/boundingBox.js";

const MIN_DRAG_DISTANCE = 3;
const MIN_POINT_DISTANCE = 4;

interface Props {
  shapes: Shape[];
  peers: Map<number, PresenceState>;
  activeTool: Tool;
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  blendMode: "normal" | "multiply";
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  readOnly?: boolean;
  onAddShape: (shape: Shape) => void;
  onUpdateShape: (id: string, changes: Partial<Shape>) => void;
  onMoveShapes: (moves: { id: string; x: number; y: number }[]) => void;
  onSplitShape: (id: string, replacements: Shape[]) => void;
  onRemoveShapes: (ids: string[]) => void;
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
  selectedIds,
  onSelectionChange,
  readOnly = false,
  onAddShape,
  onUpdateShape,
  onMoveShapes,
  onSplitShape,
  onRemoveShapes,
  onCursorMove,
}: Props) {
  const [draft, setDraft] = useState<Shape | null>(null);
  const [eraserPreview, setEraserPreview] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<(Box & { shiftKey: boolean }) | null>(null);
  const isDrawing = useRef(false);
  const isErasing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(containerRef);
  const eraserRadius = Math.max(strokeWidth, 8);
  const orderedShapes = sortByZIndexAscending(shapes);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (readOnly) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        const removableIds = selectedIds.filter((id) => !shapes.find((s) => s.id === id)?.locked);
        if (removableIds.length > 0) onRemoveShapes(removableIds);
        onSelectionChange([]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, shapes, onRemoveShapes, onSelectionChange, readOnly]);

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
          zIndex: 0,
          locked: false,
          groupId: null,
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
          zIndex: 0,
          locked: false,
          groupId: null,
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
          zIndex: 0,
          locked: false,
          groupId: null,
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
          zIndex: 0,
          locked: false,
          groupId: null,
        };
      default:
        return null;
    }
  };

  // Erasing is a delete-by-a-different-name — a locked shape is protected
  // from it exactly like Delete/drag/restyle.
  const eraseAtPointer = (e: Konva.KonvaEventObject<MouseEvent>, pointer: { x: number; y: number }) => {
    const stage = e.target.getStage();
    if (!stage || e.target === stage) return;
    const hitId = e.target.id();
    if (!hitId) return;
    const shape = shapes.find((s) => s.id === hitId);
    if (!shape || shape.locked) return;

    if (shape.type === "freehand") {
      const runs = eraseFromPoints(shape.points, pointer.x - shape.x, pointer.y - shape.y, eraserRadius);
      if (runs.length === 0) {
        onRemoveShapes([shape.id]);
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

    onRemoveShapes([shape.id]);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (readOnly) return;
    const stage = e.target.getStage();
    if (!stage) return;

    if (e.target === stage) {
      if (activeTool === "select") {
        const pointer = getPointer(stage);
        if (pointer) setMarquee({ x1: pointer.x, y1: pointer.y, x2: pointer.x, y2: pointer.y, shiftKey: e.evt.shiftKey });
        if (!e.evt.shiftKey) onSelectionChange([]);
      } else {
        onSelectionChange([]);
      }
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
          zIndex: 0,
          locked: false,
          groupId: null,
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

    if (marquee) {
      setMarquee({ ...marquee, x2: pointer.x, y2: pointer.y });
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
    if (marquee) {
      const width = Math.abs(marquee.x2 - marquee.x1);
      const height = Math.abs(marquee.y2 - marquee.y1);
      // A plain click (no real drag) on empty canvas — not a marquee. Without
      // this, a zero-size box would still "intersect" any shape whose
      // bounding box happens to cover that point, spuriously re-selecting a
      // shape Konva itself correctly saw the click miss (e.g. clicking
      // inside an unfilled rectangle's interior). Selection was already
      // cleared (or left alone under shift) in handleMouseDown.
      if (width < MIN_DRAG_DISTANCE && height < MIN_DRAG_DISTANCE) {
        setMarquee(null);
        return;
      }
      const box: Box = {
        x1: Math.min(marquee.x1, marquee.x2),
        y1: Math.min(marquee.y1, marquee.y2),
        x2: Math.max(marquee.x1, marquee.x2),
        y2: Math.max(marquee.y1, marquee.y2),
      };
      const hitIds = shapesInMarquee(shapes, box);
      onSelectionChange(
        marquee.shiftKey ? [...new Set([...selectedIds, ...hitIds])] : hitIds,
      );
      setMarquee(null);
      return;
    }
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
          {orderedShapes.map((shape) => (
            <ShapeRenderer
              key={shape.id}
              shape={shape}
              draggable={!readOnly && activeTool === "select" && !shape.locked}
              isSelected={selectedIds.includes(shape.id)}
              onDragEnd={(x, y) => {
                const dx = x - shape.x;
                const dy = y - shape.y;
                const moves = selectedIds.includes(shape.id)
                  ? selectedIds.map((id) => {
                      if (id === shape.id) return { id, x, y };
                      const other = shapes.find((s) => s.id === id);
                      return { id, x: (other?.x ?? 0) + dx, y: (other?.y ?? 0) + dy };
                    })
                  : [{ id: shape.id, x, y }];
                onMoveShapes(moves);
              }}
              onClick={(e) => {
                if (readOnly || activeTool !== "select") return;
                onSelectionChange(resolveClickSelection(shapes, shape.id, selectedIds, e.evt.shiftKey));
              }}
            />
          ))}
          {draft && (
            <ShapeRenderer shape={draft} draggable={false} isSelected={false} onDragEnd={() => {}} onClick={() => {}} />
          )}
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
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(25, 113, 194, 0.12)"
              stroke="#1971c2"
              strokeWidth={1}
              listening={false}
            />
          )}
        </Layer>
        <RemoteCursors peers={peers} />
      </KonvaStage>
    </div>
  );
}
