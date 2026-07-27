import type { HomeBoardsPage } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { getLiveViewerCount } from "../collab/hocuspocus.js";

const PAGE_SIZE = 24;

/**
 * Ranks every public board (listed + share-enabled) by live viewer count,
 * then total views, then recency. Fetches all candidate boards and sorts in
 * application code rather than in SQL, since live viewer count only exists
 * in Hocuspocus's in-memory state, not the database — fine at this project's
 * scale, and cross-instance correctness is explicitly Phase 8's job.
 */
export async function listPublicBoards(limit: number = PAGE_SIZE, ownerIds?: string[]): Promise<HomeBoardsPage> {
  const boards = await prisma.board.findMany({
    where: {
      listed: true,
      shareEnabled: true,
      ...(ownerIds ? { ownerId: { in: ownerIds } } : {}),
    },
    include: { owner: true },
  });

  const ranked = boards
    .map((board) => ({
      id: board.id,
      name: board.name,
      ownerName: board.owner.name ?? board.owner.email,
      // Safe: the where clause above guarantees shareEnabled === true, and
      // every board with shareEnabled true also has a shareToken (set
      // together at creation and by every /share/* route).
      shareToken: board.shareToken as string,
      liveViewerCount: getLiveViewerCount(board.id),
      totalViews: board.totalViews,
      createdAt: board.createdAt,
    }))
    .sort((a, b) => {
      if (a.liveViewerCount !== b.liveViewerCount) return b.liveViewerCount - a.liveViewerCount;
      if (a.totalViews !== b.totalViews) return b.totalViews - a.totalViews;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return {
    boards: ranked.slice(0, limit).map((board) => ({ ...board, createdAt: board.createdAt.toISOString() })),
    hasMore: limit < ranked.length,
  };
}
