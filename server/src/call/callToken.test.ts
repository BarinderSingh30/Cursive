import { describe, expect, it } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { env } from "../env.js";
import { mintCallToken } from "./callToken.js";

async function verify(token: string) {
  const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  return verifier.verify(token);
}

describe("mintCallToken", () => {
  it("grants a collaborator publish and subscribe rights on the board's room", async () => {
    const token = await mintCallToken({ userId: "u1", userName: "Alice", boardId: "board-1", role: "collaborator" });
    const grants = await verify(token);

    expect(grants.video?.roomJoin).toBe(true);
    expect(grants.video?.room).toBe("board-1");
    expect(grants.video?.canPublish).toBe(true);
    expect(grants.video?.canSubscribe).toBe(true);
  });

  it("grants an owner publish rights too", async () => {
    const token = await mintCallToken({ userId: "u1", userName: "Alice", boardId: "board-1", role: "owner" });
    const grants = await verify(token);

    expect(grants.video?.canPublish).toBe(true);
  });

  it("restricts a viewer to subscribe-only", async () => {
    const token = await mintCallToken({ userId: "u2", userName: "Bob", boardId: "board-1", role: "viewer" });
    const grants = await verify(token);

    expect(grants.video?.canPublish).toBe(false);
    expect(grants.video?.canSubscribe).toBe(true);
  });

  it("sets the participant identity from userId", async () => {
    const token = await mintCallToken({ userId: "u3", userName: "Carol", boardId: "board-1", role: "owner" });
    const grants = await verify(token);

    expect(grants.sub).toBe("u3");
  });
});
