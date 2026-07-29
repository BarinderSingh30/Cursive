import { afterEach, describe, expect, it } from "vitest";
import { redis } from "../redis/client.js";
import { markViewerActive, markViewerGone, countActiveViewers } from "./viewerPresence.js";

const boardId = "viewer-presence-test-board";

afterEach(async () => {
  await redis.del(`board:${boardId}:viewers`);
});

describe("viewer presence", () => {
  it("counts an active viewer", async () => {
    await markViewerActive(boardId, "conn-1");
    expect(await countActiveViewers(boardId)).toBe(1);
  });

  it("removes a viewer on disconnect", async () => {
    await markViewerActive(boardId, "conn-1");
    await markViewerGone(boardId, "conn-1");
    expect(await countActiveViewers(boardId)).toBe(0);
  });

  it("counts multiple distinct viewers once each", async () => {
    await markViewerActive(boardId, "conn-1");
    await markViewerActive(boardId, "conn-2");
    expect(await countActiveViewers(boardId)).toBe(2);
  });

  it("excludes entries older than the freshness window, without needing a disconnect", async () => {
    const staleTimestamp = Date.now() / 1000 - 999;
    await redis.zadd(`board:${boardId}:viewers`, staleTimestamp, "conn-stale");
    await markViewerActive(boardId, "conn-fresh");

    expect(await countActiveViewers(boardId)).toBe(1);
  });
});
