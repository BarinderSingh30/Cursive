import type { HomeBoardsPage } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { getLiveViewerCount } from "../collab/hocuspocus.js";
import { decodeThumbnailShapes } from "../collab/boardThumbnail.js";

const PAGE_SIZE = 24;

/**
 * Ranks every public board (listed + share-enabled) by live viewer count,
 * then total views, then recency. Fetches all candidate boards and sorts in
 * application code rather than in SQL, since live viewer count comes from
 * Redis (via `getLiveViewerCount`), not the database — correct across every
 * server instance, but not something Postgres can sort by directly.
 */
export async function listPublicBoards(limit: number = PAGE_SIZE, ownerIds?: string[]): Promise<HomeBoardsPage> {
  const boards = await prisma.board.findMany({
    where: {
      listed: true,
      shareEnabled: true,
      shareToken: { not: null },
      ...(ownerIds ? { ownerId: { in: ownerIds } } : {}),
    },
    include: { owner: true },
  });

  const boardsWithViewerCounts = await Promise.all(
    boards.map(async (board) => ({
      id: board.id,
      name: board.name,
      ownerName: board.owner.name ?? "Anonymous",
      // Safe: the where clause above guarantees shareToken is non-null.
      // Prisma's generated type doesn't narrow through `where`, so a
      // non-null assertion (rather than `as string`) documents that the
      // guarantee comes from the query, not a blind cast.
      shareToken: board.shareToken!,
      liveViewerCount: await getLiveViewerCount(board.id).catch((error) => {
        console.error(`Failed to get live viewer count for board ${board.id}:`, error);
        return 0;
      }),
      totalViews: board.totalViews,
      createdAt: board.createdAt,
      content: board.content,
    })),
  );

  const ranked = boardsWithViewerCounts.sort((a, b) => {
    if (a.liveViewerCount !== b.liveViewerCount) return b.liveViewerCount - a.liveViewerCount;
    if (a.totalViews !== b.totalViews) return b.totalViews - a.totalViews;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return {
    // Only decode thumbnails for the boards actually being returned — the
    // ranking pass above runs over every candidate board, decoding here too
    // would waste work on boards this page cuts off.
    boards: ranked.slice(0, limit).map(({ content, ...board }) => ({
      ...board,
      createdAt: board.createdAt.toISOString(),
      thumbnailShapes: decodeThumbnailShapes(content),
    })),
    hasMore: limit < ranked.length,
  };
}
