import { redis } from "../redis/client.js";

/**
 * Every handler subscribed to a channel gets every event published to it.
 * Two implementations share this interface: `InProcessPubSub` (used under
 * `vitest`, where NODE_ENV is "test" — fast, no real Redis round trip needed
 * for tests that don't specifically target the Redis-backed class) and
 * `RedisPubSub` (used everywhere else, including local dev and every
 * containerized instance) — this is the seam Phase 8 uses to make chat
 * delivery work once there's more than one Node instance, without either
 * `chat/wsGateway.ts` or `boardChat/wsGateway.ts` having to change.
 */
export type Unsubscribe = () => void;

export interface PubSub {
  subscribe(channel: string, handler: (payload: unknown) => void): Unsubscribe;
  publish(channel: string, payload: unknown): void;
}

export class InProcessPubSub implements PubSub {
  private channels = new Map<string, Set<(payload: unknown) => void>>();

  subscribe(channel: string, handler: (payload: unknown) => void): Unsubscribe {
    const handlers = this.channels.get(channel) ?? new Set();
    handlers.add(handler);
    this.channels.set(channel, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.channels.delete(channel);
    };
  }

  publish(channel: string, payload: unknown): void {
    this.channels.get(channel)?.forEach((handler) => handler(payload));
  }
}

/**
 * Redis pub/sub needs a connection dedicated to subscribing — once a
 * connection issues SUBSCRIBE, ioredis (like Redis itself) won't let it run
 * regular commands, so it can't share the `redis` client used for PUBLISH.
 * `redis.duplicate()` clones the same connection options onto a fresh
 * connection for that purpose.
 */
export class RedisPubSub implements PubSub {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private subscriber = redis.duplicate();

  constructor() {
    this.subscriber.on("message", (channel: string, raw: string) => {
      const payload = JSON.parse(raw) as unknown;
      this.handlers.get(channel)?.forEach((handler) => handler(payload));
    });
  }

  subscribe(channel: string, handler: (payload: unknown) => void): Unsubscribe {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.add(handler);
    } else {
      this.handlers.set(channel, new Set([handler]));
      this.subscriber.subscribe(channel).catch((error) => {
        console.error(`Failed to subscribe to Redis channel ${channel}:`, error);
      });
    }
    return () => {
      const handlers = this.handlers.get(channel);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(channel);
        this.subscriber.unsubscribe(channel).catch((error) => {
          console.error(`Failed to unsubscribe from Redis channel ${channel}:`, error);
        });
      }
    };
  }

  publish(channel: string, payload: unknown): void {
    redis.publish(channel, JSON.stringify(payload)).catch((error) => {
      console.error(`Failed to publish to Redis channel ${channel}:`, error);
    });
  }

  /** Closes the dedicated subscriber connection. Used by tests to avoid leaking connections. */
  close(): Promise<void> {
    return this.subscriber.quit().then(() => undefined);
  }
}

export const chatPubSub: PubSub = process.env.NODE_ENV === "test" ? new InProcessPubSub() : new RedisPubSub();
