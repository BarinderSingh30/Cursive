import type { Shape } from "@cursive/shared";

export type ShapeThumbnailProps = {
  shapes: Shape[];
  className?: string;
};

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function shapeBBox(shape: Shape): BBox {
  switch (shape.type) {
    case "rectangle": {
      const x0 = Math.min(shape.x, shape.x + shape.width);
      const x1 = Math.max(shape.x, shape.x + shape.width);
      const y0 = Math.min(shape.y, shape.y + shape.height);
      const y1 = Math.max(shape.y, shape.y + shape.height);
      return { minX: x0, minY: y0, maxX: x1, maxY: y1 };
    }
    case "ellipse":
      return {
        minX: shape.x - shape.radiusX,
        minY: shape.y - shape.radiusY,
        maxX: shape.x + shape.radiusX,
        maxY: shape.y + shape.radiusY,
      };
    case "line":
    case "freehand": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < shape.points.length; i += 2) {
        const px = shape.x + shape.points[i]!;
        const py = shape.y + shape.points[i + 1]!;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      return { minX, minY, maxX, maxY };
    }
    case "text": {
      // Konva measures text width from the actual font; a fixed-width
      // approximation is fine for a small thumbnail bounding box.
      const width = Math.max(shape.text.length * shape.fontSize * 0.55, shape.fontSize);
      const height = shape.fontSize * 1.2;
      return { minX: shape.x, minY: shape.y, maxX: shape.x + width, maxY: shape.y + height };
    }
  }
}

function renderShape(shape: Shape) {
  const rotation = shape.rotation ? `rotate(${shape.rotation} ${shape.x} ${shape.y})` : undefined;
  switch (shape.type) {
    case "rectangle": {
      const x = Math.min(shape.x, shape.x + shape.width);
      const y = Math.min(shape.y, shape.y + shape.height);
      return (
        <rect
          key={shape.id}
          x={x}
          y={y}
          width={Math.abs(shape.width)}
          height={Math.abs(shape.height)}
          stroke={shape.strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={shape.fillColor ?? "none"}
          transform={rotation}
        />
      );
    }
    case "ellipse":
      return (
        <ellipse
          key={shape.id}
          cx={shape.x}
          cy={shape.y}
          rx={shape.radiusX}
          ry={shape.radiusY}
          stroke={shape.strokeColor}
          strokeWidth={shape.strokeWidth}
          fill={shape.fillColor ?? "none"}
          transform={rotation}
        />
      );
    case "line":
    case "freehand": {
      const points: string[] = [];
      for (let i = 0; i < shape.points.length; i += 2) {
        points.push(`${shape.x + shape.points[i]!},${shape.y + shape.points[i + 1]!}`);
      }
      return (
        <polyline
          key={shape.id}
          points={points.join(" ")}
          stroke={shape.strokeColor}
          strokeWidth={shape.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={rotation}
        />
      );
    }
    case "text":
      return (
        <text
          key={shape.id}
          x={shape.x}
          y={shape.y + shape.fontSize}
          fontSize={shape.fontSize}
          fill={shape.fillColor}
          fontFamily="Inter, sans-serif"
          transform={rotation}
        >
          {shape.text}
        </text>
      );
  }
}

/** A tiny non-interactive SVG rendering of a board's shapes, scaled to fit — the board card's "art preview." Renders nothing for an empty board, leaving the card's plain paper thumbnail. */
export function ShapeThumbnail({ shapes, className }: ShapeThumbnailProps) {
  if (shapes.length === 0) return null;

  const boxes = shapes.map(shapeBBox);
  const minX = Math.min(...boxes.map((b) => b.minX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const maxY = Math.max(...boxes.map((b) => b.maxY));

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const pad = Math.max(maxX - minX, maxY - minY, 40) * 0.08;
  const width = Math.max(maxX - minX, 1) + pad * 2;
  const height = Math.max(maxY - minY, 1) + pad * 2;

  return (
    <svg
      className={className}
      viewBox={`${minX - pad} ${minY - pad} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%" }}
      aria-hidden="true"
    >
      {shapes.map(renderShape)}
    </svg>
  );
}
