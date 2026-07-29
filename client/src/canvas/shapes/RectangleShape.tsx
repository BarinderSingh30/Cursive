import { Rect } from "react-konva";
import type { RectangleShape as RectangleShapeType } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: RectangleShapeType;
}

export function RectangleShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Rect
      id={shape.id}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      opacity={shape.opacity}
      fill={shape.fillColor ?? undefined}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
