import { Line } from "react-konva";
import type { FreehandShape, LineShape } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: LineShape | FreehandShape;
}

export function PolylineShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Line
      x={shape.x}
      y={shape.y}
      points={shape.points}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      lineCap="round"
      lineJoin="round"
      tension={shape.type === "freehand" ? 0.4 : 0}
      hitStrokeWidth={Math.max(shape.strokeWidth, 16)}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
