import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { sendMessageSchema, type ChatClientEvent, type ChatServerEvent } from "@cursive/shared";
import { verifyConnectionTicket } from "../authorization/connectionTicket.js";
import { resolveConversationMembership } from "./authorization.js";
import { recordMessage } from "./conversations.js";
import { prisma } from "../db/prisma.js";
import { chatPubSub } from "./pubsub.js";

function userChannel(userId: string): string {
  return `chat-user:${userId}`;
}

function send(socket: WebSocket, event: ChatServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

/** Called by the REST routes when a new conversation gets a member who wasn't
 * there before, so an already-open socket hears about it immediately instead
 * of only finding out on next page load. */
export function notifyConversationCreated(memberUserIds: string[], event: ChatServerEvent): void {
  memberUserIds.forEach((userId) => chatPubSub.publish(userChannel(userId), event));
}

export const chatWss = new WebSocketServer({ noServer: true });

chatWss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  const { searchParams } = new URL(request.url ?? "", "http://localhost");
  const payload = verifyConnectionTicket(searchParams.get("ticket") ?? "");

  if (!payload || payload.purpose !== "chat") {
    socket.close(4401, "Not authorized");
    return;
  }

  const userId = payload.userId;
  const unsubscribe = chatPubSub.subscribe(userChannel(userId), (event) => send(socket, event as ChatServerEvent));

  socket.on("message", async (raw) => {
    let event: ChatClientEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Malformed event" });
      return;
    }

    if (event.type === "typing") {
      try {
        const access = await resolveConversationMembership({ userId, conversationId: event.conversationId });
        if (!access.isMember) return;

        const sender = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        const members = await prisma.conversationMember.findMany({ where: { conversationId: event.conversationId } });
        members
          .filter((member) => member.userId !== userId)
          .forEach((member) =>
            chatPubSub.publish(userChannel(member.userId), {
              type: "typing",
              conversationId: event.conversationId,
              userId,
              userName: sender?.name ?? null,
            } satisfies ChatServerEvent),
          );
      } catch (err) {
        console.error(err);
        send(socket, { type: "error", message: "Something went wrong" });
      }
      return;
    }

    if (event.type !== "send") return;

    try {
      const parsed = sendMessageSchema.safeParse({ conversationId: event.conversationId, content: event.content });
      if (!parsed.success) {
        send(socket, { type: "error", message: "Invalid message" });
        return;
      }

      const access = await resolveConversationMembership({ userId, conversationId: parsed.data.conversationId });
      if (!access.isMember) {
        send(socket, { type: "error", message: "Not a member of this conversation" });
        return;
      }
      if (!access.canSend) {
        send(socket, { type: "error", message: "You're no longer friends with this person" });
        return;
      }

      const message = await recordMessage(parsed.data.conversationId, userId, parsed.data.content);
      const members = await prisma.conversationMember.findMany({ where: { conversationId: parsed.data.conversationId } });
      members.forEach((member) =>
        chatPubSub.publish(userChannel(member.userId), { type: "message", message } satisfies ChatServerEvent),
      );
    } catch (err) {
      console.error(err);
      send(socket, { type: "error", message: "Something went wrong" });
    }
  });

  socket.on("close", unsubscribe);
});
