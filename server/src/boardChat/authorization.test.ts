import { describe, expect, it } from "vitest";
import { canPostBoardChat } from "./authorization.js";

describe("canPostBoardChat", () => {
  it("allows a logged-in owner", () => {
    expect(canPostBoardChat({ purpose: "board-chat", userId: "u1", boardId: "b1", role: "owner", anonymous: false })).toBe(
      true,
    );
  });

  it("allows a logged-in collaborator", () => {
    expect(
      canPostBoardChat({ purpose: "board-chat", userId: "u1", boardId: "b1", role: "collaborator", anonymous: false }),
    ).toBe(true);
  });

  it("allows a logged-in viewer, whether invited or share-link", () => {
    expect(
      canPostBoardChat({ purpose: "board-chat", userId: "u1", boardId: "b1", role: "viewer", anonymous: false }),
    ).toBe(true);
  });

  it("rejects a fully anonymous share-link visitor", () => {
    expect(
      canPostBoardChat({ purpose: "board-chat", userId: "anon:abc", boardId: "b1", role: "viewer", anonymous: true }),
    ).toBe(false);
  });
});
