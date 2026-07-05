import type { ChatMessage, ConversationSummary } from "../api/chat.schemas.js";

export type ChatClientEvent = { type: "send"; conversationId: string; content: string };

export type ChatServerEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "conversation-created"; conversation: ConversationSummary }
  | { type: "error"; message: string };
