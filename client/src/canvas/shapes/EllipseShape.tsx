import { Ellipse } from "react-konva";
import type { EllipseShape as EllipseShapeType } from "@cursive/shared";

interface Props {
  shape: EllipseShapeType;
  onDragEnd: (x: number, y: number) => void;
}

export function EllipseShape({ shape, onDragEnd }: Props) {
  return (
    <Ellipse
      x={shape.x}
      y={shape.y}
      radiusX={shape.radiusX}
      radiusY={shape.radiusY}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      fill={shape.fillColor ?? undefined}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
    />
  );
}
