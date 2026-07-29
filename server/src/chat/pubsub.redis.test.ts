import { describe, expect, it, vi } from "vitest";
import { RedisPubSub } from "./pubsub.js";

describe("RedisPubSub", () => {
  it("delivers a published payload to a subscribed handler", async () => {
    const pubsub = new RedisPubSub();
    const handler = vi.fn();
    const unsubscribe = pubsub.subscribe("redis-test-channel-1", handler);
    // Redis SUBSCRIBE is async — give it a moment to register before publishing.
    await new Promise((resolve) => setTimeout(resolve, 50));

    pubsub.publish("redis-test-channel-1", { hello: "world" });

    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith({ hello: "world" }));
    unsubscribe();
  });

  it("stops delivering after unsubscribe", async () => {
    const pubsub = new RedisPubSub();
    const handler = vi.fn();
    const unsubscribe = pubsub.subscribe("redis-test-channel-2", handler);
    await new Promise((resolve) => setTimeout(resolve, 50));
    unsubscribe();

    pubsub.publish("redis-test-channel-2", { hello: "world" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not deliver to a different channel", async () => {
    const pubsub = new RedisPubSub();
    const handler = vi.fn();
    pubsub.subscribe("redis-test-channel-3", handler);
    await new Promise((resolve) => setTimeout(resolve, 50));

    pubsub.publish("redis-test-channel-other", { hello: "world" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });
});
