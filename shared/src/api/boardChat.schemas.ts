import { z } from "zod";

export const sendBoardMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type SendBoardMessageInput = z.infer<typeof sendBoardMessageSchema>;

export const boardMessageSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
});
export type BoardChatMessage = z.infer<typeof boardMessageSchema>;
