import type { Shape } from "@cursive/shared";
import { RectangleShape } from "./RectangleShape.js";
import { EllipseShape } from "./EllipseShape.js";
import { PolylineShape } from "./PolylineShape.js";
import { TextShape } from "./TextShape.js";
import type { ShapeInteractionProps } from "./ShapeInteraction.js";

interface Props extends ShapeInteractionProps {
  shape: Shape;
}

export function ShapeRenderer({ shape, ...interaction }: Props) {
  switch (shape.type) {
    case "rectangle":
      return <RectangleShape shape={shape} {...interaction} />;
    case "ellipse":
      return <EllipseShape shape={shape} {...interaction} />;
    case "line":
    case "freehand":
      return <PolylineShape shape={shape} {...interaction} />;
    case "text":
      return <TextShape shape={shape} {...interaction} />;
    default:
      return null;
  }
}
