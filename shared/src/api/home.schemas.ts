import { z } from "zod";

export const homeBoardSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerName: z.string(),
  shareToken: z.string(),
  liveViewerCount: z.number().int().nonnegative(),
  totalViews: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type HomeBoard = z.infer<typeof homeBoardSchema>;

export const homeBoardsPageSchema = z.object({
  boards: z.array(homeBoardSchema),
  hasMore: z.boolean(),
});
export type HomeBoardsPage = z.infer<typeof homeBoardsPageSchema>;
