import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "../db/prisma.js";
import { mintConnectionTicket } from "../authorization/connectionTicket.js";
import { boardChatWss } from "./wsGateway.js";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeEach(async () => {
  server = createServer();
  server.on("upgrade", (request, socket, head) => {
    boardChatWss.handleUpgrade(request, socket, head, (ws) => boardChatWss.emit("connection", ws, request));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `ws://localhost:${(server.address() as AddressInfo).port}`;
});

const TEST_USER_FILTER = { email: { contains: "@board-chat-ws-test.local" } };

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
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

describe("board chat WebSocket gateway", () => {
  it("delivers a sent message to every other connection on the same board", async () => {
    const owner = await prisma.user.create({ data: { email: "owner@board-chat-ws-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    const ownerSocket = await connect(
      mintConnectionTicket({ purpose: "board-chat", userId: owner.id, boardId: board.id, role: "owner", anonymous: false }),
    );
    const viewerSocket = await connect(
      mintConnectionTicket({
        purpose: "board-chat",
        userId: "anon:visitor-1",
        boardId: board.id,
        role: "viewer",
        anonymous: true,
      }),
    );

    ownerSocket.send(JSON.stringify({ type: "send", content: "hello everyone" }));
    const received = await nextMessage(viewerSocket);

    expect(received).toMatchObject({ type: "message", message: { content: "hello everyone", authorId: owner.id } });

    ownerSocket.close();
    viewerSocket.close();
  });

  it("rejects a send from an anonymous visitor and never persists it", async () => {
    const owner = await prisma.user.create({ data: { email: "owner2@board-chat-ws-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    const anonSocket = await connect(
      mintConnectionTicket({
        purpose: "board-chat",
        userId: "anon:visitor-2",
        boardId: board.id,
        role: "viewer",
        anonymous: true,
      }),
    );

    anonSocket.send(JSON.stringify({ type: "send", content: "sneaky" }));
    const received = await nextMessage(anonSocket);

    expect(received.type).toBe("error");
    const stored = await prisma.boardMessage.findMany({ where: { boardId: board.id } });
    expect(stored).toHaveLength(0);

    anonSocket.close();
  });

  it("does not deliver a board-chat message to a connection on a different board", async () => {
    const owner = await prisma.user.create({ data: { email: "owner3@board-chat-ws-test.local", emailVerified: true } });
    const boardA = await prisma.board.create({ data: { name: "A", ownerId: owner.id } });
    const boardB = await prisma.board.create({ data: { name: "B", ownerId: owner.id } });

    const socketA = await connect(
      mintConnectionTicket({ purpose: "board-chat", userId: owner.id, boardId: boardA.id, role: "owner", anonymous: false }),
    );
    const socketB = await connect(
      mintConnectionTicket({ purpose: "board-chat", userId: owner.id, boardId: boardB.id, role: "owner", anonymous: false }),
    );
    let socketBReceived = false;
    socketB.on("message", () => {
      socketBReceived = true;
    });

    socketA.send(JSON.stringify({ type: "send", content: "only for A" }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(socketBReceived).toBe(false);
    socketA.close();
    socketB.close();
  });

  it("rejects a connection with an invalid ticket", async () => {
    const socket = new WebSocket(`${baseUrl}?ticket=garbage`);
    const closeCode = await new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
    expect(closeCode).toBe(4401);
  });
});
