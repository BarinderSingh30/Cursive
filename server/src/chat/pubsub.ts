/**
 * In-process publish/subscribe: every handler subscribed to a channel gets
 * every event published to it. This is the seam Phase 6 swaps for a
 * Redis-backed implementation so delivery keeps working once there's more
 * than one Node instance — nothing that calls publish/subscribe has to
 * change when that happens.
 */
export type Unsubscribe = () => void;

class InProcessPubSub {
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

export const chatPubSub = new InProcessPubSub();
