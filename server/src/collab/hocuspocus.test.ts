import { describe, expect, it } from "vitest";
import { Redis as HocuspocusRedis } from "@hocuspocus/extension-redis";
import { hocuspocus } from "./hocuspocus.js";

describe("hocuspocus Redis extension", () => {
  it("registers the Redis extension for cross-instance sync", () => {
    const hasRedisExtension = hocuspocus.configuration.extensions.some(
      (extension) => extension instanceof HocuspocusRedis,
    );
    expect(hasRedisExtension).toBe(true);
  });
});
