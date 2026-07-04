import { z } from "zod";

export const toolSchema = z.enum([
  "select",
  "rectangle",
  "ellipse",
  "line",
  "freehand",
  "text",
]);

export type Tool = z.infer<typeof toolSchema>;
