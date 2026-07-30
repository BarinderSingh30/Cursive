import { Ellipse } from "react-konva";
import type { EllipseShape as EllipseShapeType } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: EllipseShapeType;
}

export function EllipseShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Ellipse
      id={shape.id}
      x={shape.x}
      y={shape.y}
      radiusX={shape.radiusX}
      radiusY={shape.radiusY}
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
