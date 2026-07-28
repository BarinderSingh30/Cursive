import { z } from "zod";
import { boardRoleSchema } from "../roles/index.js";
import { shapeSchema } from "../canvas/shapes.js";

export const createBoardSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const boardSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: boardRoleSchema,
  createdAt: z.string(),
  /** A capped snapshot of the board's shapes, decoded from its persisted Yjs
   * content, for rendering a small static preview on the board card — never
   * the live document, just enough to draw a thumbnail. */
  thumbnailShapes: z.array(shapeSchema),
});
export type BoardSummary = z.infer<typeof boardSummarySchema>;

export const boardMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: boardRoleSchema,
});
export type BoardMemberSummary = z.infer<typeof boardMemberSchema>;
