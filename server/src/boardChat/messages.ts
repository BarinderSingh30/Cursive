import type { BoardChatMessage } from "@cursive/shared";
import { prisma } from "../db/prisma.js";

const PAGE_SIZE = 30;

export async function recordBoardMessage(boardId: string, authorId: string, content: string): Promise<BoardChatMessage> {
  const message = await prisma.boardMessage.create({
    data: { boardId, authorId, content },
    include: { author: true },
  });
  return {
    id: message.id,
    boardId: message.boardId,
    authorId: message.authorId,
    authorName: message.author.name,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function listBoardMessages(boardId: string, before?: string): Promise<BoardChatMessage[]> {
  const messages = await prisma.boardMessage.findMany({
    where: { boardId },
    include: { author: true },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });
  return messages.map((m) => ({
    id: m.id,
    boardId: m.boardId,
    authorId: m.authorId,
    authorName: m.author.name,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
}
