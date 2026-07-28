import { z } from "zod";
import { shapeSchema } from "../canvas/shapes.js";

export const homeBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerName: z.string(),
  shareToken: z.string(),
  liveViewerCount: z.number().int().nonnegative(),
  totalViews: z.number().int().nonnegative(),
  createdAt: z.string(),
  /** A capped snapshot of the board's shapes, decoded from its persisted Yjs
   * content, for rendering a small static preview on the board card — never
   * the live document, just enough to draw a thumbnail. */
  thumbnailShapes: z.array(shapeSchema),
});
export type HomeBoard = z.infer<typeof homeBoardSchema>;

export const homeBoardsPageSchema = z.object({
  boards: z.array(homeBoardSchema),
  hasMore: z.boolean(),
});
export type HomeBoardsPage = z.infer<typeof homeBoardsPageSchema>;
