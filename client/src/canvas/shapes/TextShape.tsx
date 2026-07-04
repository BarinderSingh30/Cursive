import { Text } from "react-konva";
import type { TextShape as TextShapeType } from "@cursive/shared";
import { SELECTION_HIGHLIGHT, type ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: TextShapeType;
}

export function TextShape({ shape, draggable, isSelected, onDragEnd, onClick }: Props) {
  return (
    <Text
      x={shape.x}
      y={shape.y}
      text={shape.text}
      fontSize={shape.fontSize}
      rotation={shape.rotation}
      fill={shape.fillColor}
      draggable={draggable}
      onClick={onClick}
      onTap={onClick}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      {...(isSelected ? SELECTION_HIGHLIGHT : {})}
    />
  );
}
