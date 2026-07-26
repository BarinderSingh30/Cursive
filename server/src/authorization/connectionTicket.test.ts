import { describe, expect, it } from "vitest";
import { mintConnectionTicket, verifyConnectionTicket } from "./connectionTicket.js";

describe("connectionTicket", () => {
  it("round-trips a board-sync ticket for a logged-in member", () => {
    const ticket = mintConnectionTicket({
      purpose: "board-sync",
      userId: "u1",
      boardId: "b1",
      role: "collaborator",
      anonymous: false,
    });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-sync",
      userId: "u1",
      boardId: "b1",
      role: "collaborator",
      anonymous: false,
    });
  });

  it("round-trips a board-sync ticket for an anonymous share-link visitor", () => {
    const ticket = mintConnectionTicket({
      purpose: "board-sync",
      userId: "anon:abc123",
      boardId: "b1",
      role: "viewer",
      anonymous: true,
    });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-sync",
      userId: "anon:abc123",
      boardId: "b1",
      role: "viewer",
      anonymous: true,
    });
  });

  it("round-trips a chat ticket", () => {
    const ticket = mintConnectionTicket({ purpose: "chat", userId: "u1" });
    expect(verifyConnectionTicket(ticket)).toEqual({ purpose: "chat", userId: "u1" });
  });

  it("round-trips a board-chat ticket", () => {
    const ticket = mintConnectionTicket({
      purpose: "board-chat",
      userId: "u1",
      boardId: "b1",
      role: "owner",
      anonymous: false,
    });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-chat",
      userId: "u1",
      boardId: "b1",
      role: "owner",
      anonymous: false,
    });
  });

  it("rejects a garbage token", () => {
    expect(verifyConnectionTicket("not-a-real-token")).toBeNull();
  });
});
