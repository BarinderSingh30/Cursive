import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { listPublicBoards } from "./listPublicBoards.js";

const TEST_USER_FILTER = { email: { contains: "@list-public-boards-test.local" } };

afterEach(async () => {
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("listPublicBoards", () => {
  it("excludes boards that are not listed", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner@list-public-boards-test.local", emailVerified: true, name: "Owner" },
    });
    await prisma.board.create({
      data: { name: "Public Board", ownerId: owner.id, listed: true, shareToken: randomUUID() },
    });
    await prisma.board.create({ data: { name: "Private Board", ownerId: owner.id, listed: false } });

    const { boards } = await listPublicBoards(undefined, [owner.id]);

    expect(boards.map((b) => b.name)).toEqual(["Public Board"]);
  });

  it("excludes listed boards whose share link isn't enabled", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner2@list-public-boards-test.local", emailVerified: true, name: "Owner" },
    });
    await prisma.board.create({
      data: { name: "No link yet", ownerId: owner.id, listed: true, shareEnabled: false, shareToken: null },
    });

    const { boards } = await listPublicBoards(undefined, [owner.id]);

    expect(boards).toEqual([]);
  });

  it("sorts by totalViews descending, then createdAt descending", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner3@list-public-boards-test.local", emailVerified: true, name: "Owner" },
    });
    await prisma.board.create({
      data: { name: "Older, more views", ownerId: owner.id, totalViews: 10, shareToken: randomUUID() },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.board.create({
      data: { name: "Newer, fewer views", ownerId: owner.id, totalViews: 2, shareToken: randomUUID() },
    });

    const { boards } = await listPublicBoards(undefined, [owner.id]);

    expect(boards.map((b) => b.name)).toEqual(["Older, more views", "Newer, fewer views"]);
  });

  it("respects the limit and reports hasMore correctly", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner4@list-public-boards-test.local", emailVerified: true, name: "Owner" },
    });
    for (let i = 0; i < 3; i += 1) {
      await prisma.board.create({ data: { name: `Board ${i}`, ownerId: owner.id, shareToken: randomUUID() } });
    }

    const page1 = await listPublicBoards(2, [owner.id]);
    expect(page1.boards).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    const page2 = await listPublicBoards(10, [owner.id]);
    expect(page2.boards).toHaveLength(3);
    expect(page2.hasMore).toBe(false);
  });

  it("includes the owner's name and share token", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner5@list-public-boards-test.local", emailVerified: true, name: "Ada" },
    });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareToken: randomUUID() },
    });

    const { boards } = await listPublicBoards(undefined, [owner.id]);

    expect(boards[0].ownerName).toBe("Ada");
    expect(boards[0].shareToken).toBe(board.shareToken);
  });
});
