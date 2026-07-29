import { redis } from "../redis/client.js";

/**
 * Tracks who's actively watching a board, shared across every server
 * instance via a Redis sorted set (member = connection id, score = last
 * heartbeat, as a unix timestamp in seconds). A plain Redis set can't expire
 * individual members — only the whole key — so a crashed instance's
 * connections would never disappear. A sorted set pruned by timestamp on
 * every read is what makes a crash self-healing: no explicit cleanup code
 * has to run, a stale entry just ages out next time anyone counts.
 */
const STALE_AFTER_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 15_000;

function presenceKey(boardId: string): string {
  return `board:${boardId}:viewers`;
}

export async function markViewerActive(boardId: string, connectionId: string): Promise<void> {
  await redis.zadd(presenceKey(boardId), Date.now() / 1000, connectionId);
}

export async function markViewerGone(boardId: string, connectionId: string): Promise<void> {
  await redis.zrem(presenceKey(boardId), connectionId);
}

export async function countActiveViewers(boardId: string): Promise<number> {
  const staleBefore = Date.now() / 1000 - STALE_AFTER_SECONDS;
  await redis.zremrangebyscore(presenceKey(boardId), "-inf", staleBefore);
  return redis.zcard(presenceKey(boardId));
}

/** Refreshes this connection's score every HEARTBEAT_INTERVAL_MS so it stays
 * ahead of STALE_AFTER_SECONDS as long as the connection is actually open. */
export function startHeartbeat(boardId: string, connectionId: string): NodeJS.Timeout {
  return setInterval(() => {
    markViewerActive(boardId, connectionId).catch((error) => {
      console.error(`Failed to refresh viewer presence for board ${boardId}:`, error);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
