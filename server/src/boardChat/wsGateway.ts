import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { sendBoardMessageSchema, type BoardChatClientEvent, type BoardChatServerEvent } from "@cursive/shared";
import { verifyConnectionTicket } from "../authorization/connectionTicket.js";
import { canPostBoardChat } from "./authorization.js";
import { recordBoardMessage } from "./messages.js";
import { chatPubSub } from "../chat/pubsub.js";

function boardChannel(boardId: string): string {
  return `board-chat:${boardId}`;
}

function send(socket: WebSocket, event: BoardChatServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

export const boardChatWss = new WebSocketServer({ noServer: true });

boardChatWss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  const { searchParams } = new URL(request.url ?? "", "http://localhost");
  const payload = verifyConnectionTicket(searchParams.get("ticket") ?? "");

  if (!payload || payload.purpose !== "board-chat") {
    socket.close(4401, "Not authorized");
    return;
  }

  const unsubscribe = chatPubSub.subscribe(boardChannel(payload.boardId), (event) =>
    send(socket, event as BoardChatServerEvent),
  );

  socket.on("message", async (raw) => {
    let event: BoardChatClientEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Malformed event" });
      return;
    }

    if (event.type !== "send") return;

    if (!canPostBoardChat(payload)) {
      send(socket, { type: "error", message: "Log in to chat" });
      return;
    }

    const parsed = sendBoardMessageSchema.safeParse({ content: event.content });
    if (!parsed.success) {
      send(socket, { type: "error", message: "Invalid message" });
      return;
    }

    try {
      const message = await recordBoardMessage(payload.boardId, payload.userId, parsed.data.content);
      chatPubSub.publish(boardChannel(payload.boardId), { type: "message", message } satisfies BoardChatServerEvent);
    } catch (err) {
      console.error(err);
      send(socket, { type: "error", message: "Something went wrong" });
    }
  });

  socket.on("close", unsubscribe);
});
