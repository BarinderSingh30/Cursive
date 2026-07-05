import { describe, expect, it, vi } from "vitest";
import { chatPubSub } from "./pubsub.js";

describe("chatPubSub", () => {
  it("delivers a published payload to a subscribed handler", () => {
    const handler = vi.fn();
    const unsubscribe = chatPubSub.subscribe("test-channel-1", handler);

    chatPubSub.publish("test-channel-1", { hello: "world" });

    expect(handler).toHaveBeenCalledWith({ hello: "world" });
    unsubscribe();
  });

  it("stops delivering after unsubscribe", () => {
    const handler = vi.fn();
    const unsubscribe = chatPubSub.subscribe("test-channel-2", handler);
    unsubscribe();

    chatPubSub.publish("test-channel-2", { hello: "world" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not deliver to a different channel", () => {
    const handler = vi.fn();
    chatPubSub.subscribe("test-channel-3", handler);

    chatPubSub.publish("test-channel-other", { hello: "world" });

    expect(handler).not.toHaveBeenCalled();
  });
});
