import { z } from "zod";

const baseShapeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  strokeColor: z.string(),
  strokeWidth: z.number(),
});

export const rectangleShapeSchema = baseShapeSchema.extend({
  type: z.literal("rectangle"),
  width: z.number(),
  height: z.number(),
  fillColor: z.string().nullable(),
});

export const ellipseShapeSchema = baseShapeSchema.extend({
  type: z.literal("ellipse"),
  radiusX: z.number(),
  radiusY: z.number(),
  fillColor: z.string().nullable(),
});

export const lineShapeSchema = baseShapeSchema.extend({
  type: z.literal("line"),
  // Flat [x1, y1, x2, y2, ...] pairs, matching Konva's Line `points` prop.
  points: z.array(z.number()),
});

export const freehandShapeSchema = baseShapeSchema.extend({
  type: z.literal("freehand"),
  points: z.array(z.number()),
});

export const textShapeSchema = baseShapeSchema.extend({
  type: z.literal("text"),
  text: z.string(),
  fontSize: z.number(),
  fillColor: z.string(),
});

export const shapeSchema = z.discriminatedUnion("type", [
  rectangleShapeSchema,
  ellipseShapeSchema,
  lineShapeSchema,
  freehandShapeSchema,
  textShapeSchema,
]);

export type RectangleShape = z.infer<typeof rectangleShapeSchema>;
export type EllipseShape = z.infer<typeof ellipseShapeSchema>;
export type LineShape = z.infer<typeof lineShapeSchema>;
export type FreehandShape = z.infer<typeof freehandShapeSchema>;
export type TextShape = z.infer<typeof textShapeSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type ShapeType = Shape["type"];
