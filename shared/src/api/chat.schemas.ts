import { z } from "zod";

export const createDmSchema = z.object({
  friendEmail: z.string().email(),
});
export type CreateDmInput = z.infer<typeof createDmSchema>;

export const createGroupSchema = z.object({
  name: z.string().min(1).max(80),
  memberEmails: z.array(z.string().email()).min(1),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1).max(4000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  senderName: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof messageSchema>;

export const conversationSummarySchema = z.object({
  id: z.string(),
  isGroup: z.boolean(),
  displayName: z.string(),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  unreadCount: z.number(),
  canSend: z.boolean(),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
