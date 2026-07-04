import { Rect } from "react-konva";
import type { RectangleShape as RectangleShapeType } from "@cursive/shared";

interface Props {
  shape: RectangleShapeType;
  onDragEnd: (x: number, y: number) => void;
}

export function RectangleShape({ shape, onDragEnd }: Props) {
  return (
    <Rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      stroke={shape.strokeColor}
      strokeWidth={shape.strokeWidth}
      fill={shape.fillColor ?? undefined}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
    />
  );
}
