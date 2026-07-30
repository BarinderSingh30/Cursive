import type { Shape } from "@cursive/shared";

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Approximate axis-aligned bounding box in stage coordinates, ignoring
 * rotation — consistent with this codebase's existing degenerate-shape
 * checks (Stage.tsx's isDegenerate), which also ignore rotation for the
 * same reason: simple, testable geometry beats pixel-perfect precision for
 * a selection/marquee test.
 */
export function boundingBox(shape: Shape): Box {
  switch (shape.type) {
    case "rectangle": {
      const x1 = Math.min(shape.x, shape.x + shape.width);
      const x2 = Math.max(shape.x, shape.x + shape.width);
      const y1 = Math.min(shape.y, shape.y + shape.height);
      const y2 = Math.max(shape.y, shape.y + shape.height);
      return { x1, y1, x2, y2 };
    }
    case "ellipse":
      return {
        x1: shape.x - shape.radiusX,
        y1: shape.y - shape.radiusY,
        x2: shape.x + shape.radiusX,
        y2: shape.y + shape.radiusY,
      };
    case "line":
    case "freehand": {
      const xs = shape.points.filter((_, i) => i % 2 === 0);
      const ys = shape.points.filter((_, i) => i % 2 === 1);
      return {
        x1: shape.x + Math.min(...xs),
        y1: shape.y + Math.min(...ys),
        x2: shape.x + Math.max(...xs),
        y2: shape.y + Math.max(...ys),
      };
    }
    case "text": {
      const width = shape.fontSize * 0.6 * shape.text.length;
      const height = shape.fontSize * 1.2;
      return { x1: shape.x, y1: shape.y, x2: shape.x + width, y2: shape.y + height };
    }
  }
}

export function rectsIntersect(a: Box, b: Box): boolean {
  return a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
}
