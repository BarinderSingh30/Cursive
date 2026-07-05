import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "../db/prisma.js";
import { mintConnectionTicket } from "../authorization/connectionTicket.js";
import { chatWss } from "./wsGateway.js";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeEach(async () => {
  server = createServer();
  server.on("upgrade", (request, socket, head) => {
    chatWss.handleUpgrade(request, socket, head, (ws) => chatWss.emit("connection", ws, request));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `ws://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "@chat-ws-test.local" } } });
});

function connect(ticket: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}?ticket=${ticket}`);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => socket.once("message", (raw) => resolve(JSON.parse(raw.toString()))));
}

describe("chat WebSocket gateway", () => {
  it("delivers a sent message to every other member of the conversation", async () => {
    const alice = await prisma.user.create({ data: { email: "alice@chat-ws-test.local", emailVerified: true } });
    const bob = await prisma.user.create({ data: { email: "bob@chat-ws-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        dmKey: `${alice.id}:${bob.id}`,
        members: { create: [{ userId: alice.id }, { userId: bob.id }] },
      },
    });

    const aliceSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: alice.id }));
    const bobSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: bob.id }));

    aliceSocket.send(JSON.stringify({ type: "send", conversationId: conversation.id, content: "hey bob" }));
    const received = await nextMessage(bobSocket);

    expect(received).toMatchObject({ type: "message", message: { content: "hey bob", senderId: alice.id } });

    aliceSocket.close();
    bobSocket.close();
  });

  it("rejects a send from someone who isn't a member of the conversation, and never persists it", async () => {
    const alice = await prisma.user.create({ data: { email: "alice2@chat-ws-test.local", emailVerified: true } });
    const eve = await prisma.user.create({ data: { email: "eve@chat-ws-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, dmKey: `${alice.id}:solo`, members: { create: [{ userId: alice.id }] } },
    });

    const eveSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: eve.id }));
    eveSocket.send(JSON.stringify({ type: "send", conversationId: conversation.id, content: "sneaky" }));
    const received = await nextMessage(eveSocket);

    expect(received.type).toBe("error");
    const stored = await prisma.message.findMany({ where: { conversationId: conversation.id } });
    expect(stored).toHaveLength(0);

    eveSocket.close();
  });

  it("rejects a connection with an invalid ticket", async () => {
    const socket = new WebSocket(`${baseUrl}?ticket=garbage`);
    const closeCode = await new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
    expect(closeCode).toBe(4401);
  });
});
