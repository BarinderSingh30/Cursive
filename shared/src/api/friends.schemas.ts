import { z } from "zod";

export const sendFriendRequestSchema = z.object({
  email: z.string().email(),
});
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>;

export const friendRequestSchema = z.object({
  id: z.string(),
  senderId: z.string(),
  senderEmail: z.string(),
  senderName: z.string().nullable(),
  createdAt: z.string(),
});
export type FriendRequestSummary = z.infer<typeof friendRequestSchema>;

export const friendSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});
export type FriendSummary = z.infer<typeof friendSchema>;
