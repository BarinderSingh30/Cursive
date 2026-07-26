import type { BoardChatMessage } from "../api/boardChat.schemas.js";

export type BoardChatClientEvent = { type: "send"; content: string };

export type BoardChatServerEvent = { type: "message"; message: BoardChatMessage } | { type: "error"; message: string };
