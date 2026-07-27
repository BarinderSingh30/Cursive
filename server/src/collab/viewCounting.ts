import type { BoardRole } from "@cursive/shared";
import { prisma } from "../db/prisma.js";

/**
 * Counts once per non-owner Hocuspocus connection to a board — the owner's
 * own edits/visits never inflate their own board's view count, matching how
 * a streamer's own view doesn't count on Twitch.
 */
export async function recordBoardView(boardId: string, role: BoardRole): Promise<void> {
  if (role === "owner") return;
  await prisma.board.update({
    where: { id: boardId },
    data: { totalViews: { increment: 1 } },
  });
}
