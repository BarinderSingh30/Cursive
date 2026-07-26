import { z } from "zod";

export const shareLinkStateSchema = z.object({
  enabled: z.boolean(),
  token: z.string().nullable(),
});
export type ShareLinkState = z.infer<typeof shareLinkStateSchema>;

export const shareLinkInfoSchema = z.object({
  boardId: z.string(),
  boardName: z.string(),
  /** True if the visitor already has a real BoardMember row — the client
   * redirects to the normal /board/:boardId page instead of watch mode. */
  hasMembership: z.boolean(),
});
export type ShareLinkInfo = z.infer<typeof shareLinkInfoSchema>;
