import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardSignalRelay } from "./boardSignal.js";

/**
 * Exercises the actual cross-instance path: two independent
 * `BoardSignalRelay` instances (each with its own dedicated
 * `redis.duplicate()` subscriber connection, per the constructor) stand in
 * for two separate server processes talking to the same real Redis, the
 * same way `pubsub.redis.test.ts` tests `RedisPubSub`. This is what proves
 * the fix for the bug in the final review: a signal published on one
 * instance must reach the *other* instance's local broadcaster, not just
 * loop back to whichever instance published it.
 */
describe("BoardSignalRelay", () => {
  let instanceA: BoardSignalRelay | undefined;
  let instanceB: BoardSignalRelay | undefined;

  afterEach(async () => {
    await instanceA?.close();
    await instanceB?.close();
    instanceA = undefined;
    instanceB = undefined;
  });

  it("relays a signal published on one instance to another instance's local broadcaster", async () => {
    const localBroadcastA = vi.fn();
    const localBroadcastB = vi.fn();
    instanceA = new BoardSignalRelay(localBroadcastA);
    instanceB = new BoardSignalRelay(localBroadcastB);
    // Redis PSUBSCRIBE is async — give both instances a moment to register
    // before publishing, matching pubsub.redis.test.ts's approach. Two
    // brand-new duplicate() connections (one per simulated instance) can
    // take longer to finish their handshake than pubsub.redis.test.ts's
    // single subscriber, so this waits a bit longer.
    await new Promise((resolve) => setTimeout(resolve, 300));

    instanceA.publish("board-1", { type: "board-deleted" });

    await vi.waitFor(
      () => {
        expect(localBroadcastB).toHaveBeenCalledWith("board-1", JSON.stringify({ type: "board-deleted" }));
      },
      { timeout: 2000 },
    );
    // The publishing instance is itself a subscriber too — this is exactly
    // what makes "the instance that received the DELETE request also has a
    // locally-connected client" work, so it must hear its own publish.
    expect(localBroadcastA).toHaveBeenCalledWith("board-1", JSON.stringify({ type: "board-deleted" }));
  });

  it("tags each relayed signal with the correct boardId when multiple boards are active", async () => {
    const localBroadcast = vi.fn();
    instanceA = new BoardSignalRelay(vi.fn());
    instanceB = new BoardSignalRelay(localBroadcast);
    await new Promise((resolve) => setTimeout(resolve, 300));

    instanceA.publish("board-alpha", { type: "board-deleted" });
    instanceA.publish("board-beta", { type: "membership-changed" });

    await vi.waitFor(() => expect(localBroadcast).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(localBroadcast).toHaveBeenCalledWith("board-alpha", JSON.stringify({ type: "board-deleted" }));
    expect(localBroadcast).toHaveBeenCalledWith("board-beta", JSON.stringify({ type: "membership-changed" }));
  });

  it("does not crash when the local broadcaster throws (e.g. broadcastStateless failing)", async () => {
    const throwingBroadcast = vi.fn(() => {
      throw new Error("simulated broadcastStateless failure");
    });
    instanceA = new BoardSignalRelay(vi.fn());
    instanceB = new BoardSignalRelay(throwingBroadcast);
    await new Promise((resolve) => setTimeout(resolve, 300));

    instanceA.publish("board-crash", { type: "board-deleted" });

    await vi.waitFor(() => expect(throwingBroadcast).toHaveBeenCalled(), { timeout: 2000 });
    // Reaching this line at all (rather than the test process dying from an
    // uncaught exception inside the `pmessage` handler) is the assertion.
  });
});
