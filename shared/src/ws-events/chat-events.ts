import type { ChatMessage, ConversationSummary } from "../api/chat.schemas.js";

export type ChatClientEvent =
  | { type: "send"; conversationId: string; content: string }
  | { type: "typing"; conversationId: string };

export type ChatServerEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "conversation-created"; conversation: ConversationSummary }
  | { type: "typing"; conversationId: string; userId: string; userName: string | null }
  | { type: "message-deleted"; conversationId: string; messageId: string }
  | { type: "history-cleared"; conversationId: string }
  | { type: "error"; message: string };
