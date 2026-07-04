import { Text } from "react-konva";
import type { TextShape as TextShapeType } from "@cursive/shared";

interface Props {
  shape: TextShapeType;
  onDragEnd: (x: number, y: number) => void;
}

export function TextShape({ shape, onDragEnd }: Props) {
  return (
    <Text
      x={shape.x}
      y={shape.y}
      text={shape.text}
      fontSize={shape.fontSize}
      rotation={shape.rotation}
      fill={shape.fillColor}
      draggable
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
    />
  );
}
