import { redis } from "../redis/client.js";

/** The two lifecycle events a board can broadcast to its connected clients. */
export type BoardSignal = { type: "board-deleted" } | { type: "membership-changed" };

const CHANNEL_PREFIX = "board-signal:";

/**
 * Relays board-lifecycle signals (deletion, membership change) across every
 * server instance via Redis pub/sub.
 *
 * Without this, `hocuspocus.documents.get(boardId)?.broadcastStateless(...)`
 * only ever reaches clients connected to *this* process — silently dropping
 * the signal on every other instance, which is exactly the bug this class
 * fixes. `@hocuspocus/extension-redis` does relay stateless broadcasts
 * cross-instance, but only from a process that already has a local Document
 * to call `broadcastStateless` on; a REST route (which is where these
 * signals originate) has no such Document, so that relay never triggers on
 * its own.
 *
 * Structured after `RedisPubSub` in `server/src/chat/pubsub.ts`: a dedicated
 * `redis.duplicate()` subscriber connection, created once (per instance),
 * not per publish or per board — ioredis (like Redis itself) won't let a
 * connection that's issued SUBSCRIBE/PSUBSCRIBE run regular commands
 * afterward, so it can't share the `redis` client used for PUBLISH.
 *
 * Uses one pattern subscription (`board-signal:*`) instead of subscribing
 * per-board: a board's Document is only in memory while someone's connected
 * to it, and documents come and go constantly, so subscribing once at
 * startup to every board's channel is simpler and cheaper than subscribing/
 * unsubscribing in lockstep with Documents loading and unloading. The
 * `localBroadcast` callback is how each instance decides, per message,
 * whether it actually has anyone to tell — a no-op on instances with no
 * local Document for that board, which is correct: only instances that
 * actually have someone connected to that board need to relay it locally.
 */
export class BoardSignalRelay {
  private subscriber = redis.duplicate();

  constructor(private readonly localBroadcast: (boardId: string, payload: string) => void) {
    this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`).catch((error) => {
      console.error("Failed to subscribe to board-signal channels:", error);
    });

    this.subscriber.on("pmessage", (_pattern: string, channel: string, raw: string) => {
      try {
        const boardId = channel.slice(CHANNEL_PREFIX.length);
        this.localBroadcast(boardId, raw);
      } catch (error) {
        console.error(`Failed to relay board signal on channel ${channel}:`, error);
      }
    });
  }

  publish(boardId: string, signal: BoardSignal): void {
    redis.publish(`${CHANNEL_PREFIX}${boardId}`, JSON.stringify(signal)).catch((error) => {
      console.error(`Failed to publish board signal for board ${boardId}:`, error);
    });
  }

  /** Closes the dedicated subscriber connection. Used by tests to avoid leaking connections. */
  close(): Promise<void> {
    return this.subscriber.quit().then(() => undefined);
  }
}
