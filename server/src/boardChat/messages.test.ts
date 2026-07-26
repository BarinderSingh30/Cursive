import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { recordBoardMessage, listBoardMessages } from "./messages.js";

const TEST_USER_FILTER = { email: { contains: "@board-chat-msg-test.local" } };

afterEach(async () => {
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("recordBoardMessage", () => {
  it("persists a message and returns it with the author's name", async () => {
    const author = await prisma.user.create({
      data: { email: "author@board-chat-msg-test.local", emailVerified: true, name: "Author" },
    });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: author.id } });

    const message = await recordBoardMessage(board.id, author.id, "hello board");

    expect(message).toMatchObject({ boardId: board.id, authorId: author.id, authorName: "Author", content: "hello board" });
  });
});

describe("listBoardMessages", () => {
  it("returns messages oldest-appropriate for pagination, newest first", async () => {
    const author = await prisma.user.create({ data: { email: "author2@board-chat-msg-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: author.id } });
    await recordBoardMessage(board.id, author.id, "first");
    await recordBoardMessage(board.id, author.id, "second");

    const page = await listBoardMessages(board.id);

    expect(page.map((m) => m.content)).toEqual(["second", "first"]);
  });

  it("pages before a given message id", async () => {
    const author = await prisma.user.create({ data: { email: "author3@board-chat-msg-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: author.id } });
    const first = await recordBoardMessage(board.id, author.id, "first");
    await recordBoardMessage(board.id, author.id, "second");

    const page = await listBoardMessages(board.id, first.id);

    expect(page).toEqual([]);
  });

  it("only returns messages for the requested board", async () => {
    const author = await prisma.user.create({ data: { email: "author4@board-chat-msg-test.local", emailVerified: true } });
    const boardA = await prisma.board.create({ data: { name: "A", ownerId: author.id } });
    const boardB = await prisma.board.create({ data: { name: "B", ownerId: author.id } });
    await recordBoardMessage(boardA.id, author.id, "in A");
    await recordBoardMessage(boardB.id, author.id, "in B");

    const page = await listBoardMessages(boardA.id);

    expect(page.map((m) => m.content)).toEqual(["in A"]);
  });
});
