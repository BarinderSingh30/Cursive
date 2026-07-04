import type { BoardRole } from "@cursive/shared";
import { prisma } from "../db/prisma.js";

export interface BoardAccessResult {
  role: BoardRole | null;
  userId: string | null;
  anonymous: boolean;
}

/**
 * The single source of truth for "what can this connection do on this board."
 * Every surface that needs to know — Yjs sync, chat (Phase 3), REST routes,
 * LiveKit token minting (Phase 4) — calls into this instead of re-implementing
 * the check. Phase 5 will add a second branch here for anonymous viewer
 * tokens; today there's only the logged-in-user branch.
 */
export async function resolveBoardRole(params: { userId: string | null; boardId: string }): Promise<BoardAccessResult> {
  const { userId, boardId } = params;

  if (!userId) {
    return { role: null, userId: null, anonymous: true };
  }

  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });

  return { role: (membership?.role as BoardRole | undefined) ?? null, userId, anonymous: false };
}
