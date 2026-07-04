import type { Shape } from "@cursive/shared";
import { RectangleShape } from "./RectangleShape.js";
import { EllipseShape } from "./EllipseShape.js";
import { PolylineShape } from "./PolylineShape.js";
import { TextShape } from "./TextShape.js";

interface Props {
  shape: Shape;
  onDragEnd: (x: number, y: number) => void;
}

export function ShapeRenderer({ shape, onDragEnd }: Props) {
  switch (shape.type) {
    case "rectangle":
      return <RectangleShape shape={shape} onDragEnd={onDragEnd} />;
    case "ellipse":
      return <EllipseShape shape={shape} onDragEnd={onDragEnd} />;
    case "line":
    case "freehand":
      return <PolylineShape shape={shape} onDragEnd={onDragEnd} />;
    case "text":
      return <TextShape shape={shape} onDragEnd={onDragEnd} />;
    default:
      return null;
  }
}
