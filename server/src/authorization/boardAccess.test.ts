import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { resolveBoardRole } from "./boardAccess.js";

const TEST_USER_FILTER = { email: { contains: "@board-access-test.local" } };

afterEach(async () => {
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("resolveBoardRole", () => {
  it("returns the real membership role for a logged-in member, ignoring any share token", async () => {
    const owner = await prisma.user.create({ data: { email: "owner@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, members: { create: { userId: owner.id, role: "owner" } } },
    });

    const result = await resolveBoardRole({ userId: owner.id, boardId: board.id, shareToken: "wrong-token" });
    expect(result).toEqual({ role: "owner", userId: owner.id, anonymous: false });
  });

  it("returns null role for a logged-in non-member with no share token", async () => {
    const owner = await prisma.user.create({ data: { email: "owner2@board-access-test.local", emailVerified: true } });
    const stranger = await prisma.user.create({ data: { email: "stranger@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    const result = await resolveBoardRole({ userId: stranger.id, boardId: board.id });
    expect(result).toEqual({ role: null, userId: stranger.id, anonymous: false });
  });

  it("resolves an anonymous visitor with a valid, enabled share token as a viewer", async () => {
    const owner = await prisma.user.create({ data: { email: "owner3@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: true, shareToken: "tok-1" },
    });

    const result = await resolveBoardRole({ userId: null, boardId: board.id, shareToken: "tok-1" });
    expect(result).toEqual({ role: "viewer", userId: null, anonymous: true });
  });

  it("resolves a logged-in non-member with a valid share token as a non-anonymous viewer", async () => {
    const owner = await prisma.user.create({ data: { email: "owner4@board-access-test.local", emailVerified: true } });
    const visitor = await prisma.user.create({ data: { email: "visitor4@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: true, shareToken: "tok-2" },
    });

    const result = await resolveBoardRole({ userId: visitor.id, boardId: board.id, shareToken: "tok-2" });
    expect(result).toEqual({ role: "viewer", userId: visitor.id, anonymous: false });
  });

  it("rejects a share token that doesn't match this board's token", async () => {
    const owner = await prisma.user.create({ data: { email: "owner5@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: true, shareToken: "tok-3" },
    });

    const result = await resolveBoardRole({ userId: null, boardId: board.id, shareToken: "wrong-token" });
    expect(result).toEqual({ role: null, userId: null, anonymous: true });
  });

  it("rejects a valid token for a board whose sharing is disabled", async () => {
    const owner = await prisma.user.create({ data: { email: "owner6@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: false, shareToken: "tok-4" },
    });

    const result = await resolveBoardRole({ userId: null, boardId: board.id, shareToken: "tok-4" });
    expect(result).toEqual({ role: null, userId: null, anonymous: true });
  });
});
