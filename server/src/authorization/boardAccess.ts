import type { BoardRole } from "@cursive/shared";
import { prisma } from "../db/prisma.js";

export interface BoardAccessResult {
  role: BoardRole | null;
  userId: string | null;
  anonymous: boolean;
}

/**
 * The single source of truth for "what can this connection do on this board."
 * Every surface that needs to know — Yjs sync, board chat, REST routes,
 * LiveKit token minting — calls into this instead of re-implementing the
 * check. Explicit membership always wins; the share-token branch is purely a
 * fallback for visitors with no BoardMember row (owner/collaborator/invited
 * viewers opening their own public link still resolve to their real role).
 */
export async function resolveBoardRole(params: {
  userId: string | null;
  boardId: string;
  shareToken?: string;
}): Promise<BoardAccessResult> {
  const { userId, boardId, shareToken } = params;

  if (userId) {
    const membership = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (membership) {
      return { role: membership.role as BoardRole, userId, anonymous: false };
    }
  }

  if (shareToken) {
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (board?.shareEnabled && board.shareToken === shareToken) {
      return { role: "viewer", userId, anonymous: !userId };
    }
  }

  return { role: null, userId, anonymous: !userId };
}
