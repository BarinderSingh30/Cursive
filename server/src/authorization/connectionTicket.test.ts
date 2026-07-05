import { describe, expect, it } from "vitest";
import { mintConnectionTicket, verifyConnectionTicket } from "./connectionTicket.js";

describe("connectionTicket", () => {
  it("round-trips a board-sync ticket", () => {
    const ticket = mintConnectionTicket({ purpose: "board-sync", userId: "u1", boardId: "b1", role: "collaborator" });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-sync",
      userId: "u1",
      boardId: "b1",
      role: "collaborator",
    });
  });

  it("round-trips a chat ticket", () => {
    const ticket = mintConnectionTicket({ purpose: "chat", userId: "u1" });
    expect(verifyConnectionTicket(ticket)).toEqual({ purpose: "chat", userId: "u1" });
  });

  it("rejects a garbage token", () => {
    expect(verifyConnectionTicket("not-a-real-token")).toBeNull();
  });
});
