import { describe, expect, it } from "vitest";
import { redis } from "./client.js";

describe("redis client", () => {
  it("connects to the configured Redis instance", async () => {
    const pong = await redis.ping();
    expect(pong).toBe("PONG");
  });
});
