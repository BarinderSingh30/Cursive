import { z } from "zod";
import { boardRoleSchema } from "../roles/index.js";

export const createBoardSchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const boardSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: boardRoleSchema,
  createdAt: z.string(),
});
export type BoardSummary = z.infer<typeof boardSummarySchema>;
