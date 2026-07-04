import { Line } from "react-konva";
import type { FreehandShape, LineShape } from "@cursive/shared";

interface Props {
  shape: LineShape | FreehandShape;
  onDragEnd: (x: number, y: number) => void;
}

export function PolylineShape({ shape, onDragEnd }: Props) {
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
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
    />
  );
}
