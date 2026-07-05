import { z } from "zod";
import { boardRoleSchema } from "../roles/index.js";

export const createBoardInviteSchema = z.object({
  email: z.string().email(),
  role: boardRoleSchema.exclude(["owner"]),
});
export type CreateBoardInviteInput = z.infer<typeof createBoardInviteSchema>;

/** A pending invite someone else sent you. */
export const receivedBoardInviteSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  inviterName: z.string().nullable(),
  inviterEmail: z.string(),
  role: boardRoleSchema,
  createdAt: z.string(),
});
export type ReceivedBoardInvite = z.infer<typeof receivedBoardInviteSchema>;

/** An invite you sent that got declined, not yet dismissed. */
export const declinedBoardInviteSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  boardName: z.string(),
  inviteeName: z.string().nullable(),
  inviteeEmail: z.string(),
});
export type DeclinedBoardInvite = z.infer<typeof declinedBoardInviteSchema>;

/** A still-pending invite you sent for one specific board (shown in that board's invite dialog). */
export const pendingBoardInviteSchema = z.object({
  id: z.string(),
  inviteeName: z.string().nullable(),
  inviteeEmail: z.string(),
  role: boardRoleSchema,
});
export type PendingBoardInvite = z.infer<typeof pendingBoardInviteSchema>;
