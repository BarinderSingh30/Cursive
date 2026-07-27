import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { recordBoardView } from "./viewCounting.js";

const TEST_USER_FILTER = { email: { contains: "@view-counting-test.local" } };

afterEach(async () => {
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("recordBoardView", () => {
  it("increments totalViews for a viewer role", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner@view-counting-test.local", emailVerified: true },
    });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    await recordBoardView(board.id, "viewer");

    const updated = await prisma.board.findUniqueOrThrow({ where: { id: board.id } });
    expect(updated.totalViews).toBe(1);
  });

  it("increments totalViews for a collaborator role", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner2@view-counting-test.local", emailVerified: true },
    });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    await recordBoardView(board.id, "collaborator");

    const updated = await prisma.board.findUniqueOrThrow({ where: { id: board.id } });
    expect(updated.totalViews).toBe(1);
  });

  it("does not increment totalViews for the owner role", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner3@view-counting-test.local", emailVerified: true },
    });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    await recordBoardView(board.id, "owner");

    const updated = await prisma.board.findUniqueOrThrow({ where: { id: board.id } });
    expect(updated.totalViews).toBe(0);
  });
});
