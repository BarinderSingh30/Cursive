import { Router } from "express";
import { z } from "zod";
import { createBoardSchema, boardRoleSchema, type BoardSummary } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../authorization/requireAuth.js";
import { requireBoardRole } from "../authorization/requireBoardRole.js";
import { mintSyncTicket } from "../authorization/syncTicket.js";

export const boardsRouter = Router();

boardsRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createBoardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const ownerId = res.locals.userId as string;
  const board = await prisma.board.create({
    data: {
      name: parsed.data.name,
      ownerId,
      members: { create: { userId: ownerId, role: "owner" } },
    },
  });

  const body: BoardSummary = { id: board.id, name: board.name, role: "owner", createdAt: board.createdAt.toISOString() };
  res.status(201).json(body);
});

boardsRouter.get("/", requireAuth, async (req, res) => {
  const userId = res.locals.userId as string;
  const memberships = await prisma.boardMember.findMany({
    where: { userId },
    include: { board: true },
    orderBy: { board: { createdAt: "desc" } },
  });

  const body: BoardSummary[] = memberships.map((m) => ({
    id: m.board.id,
    name: m.board.name,
    role: m.role,
    createdAt: m.board.createdAt.toISOString(),
  }));
  res.json(body);
});

boardsRouter.get("/:boardId/sync-ticket", requireBoardRole("viewer"), async (req, res) => {
  const ticket = mintSyncTicket({
    userId: res.locals.userId as string,
    boardId: req.params.boardId,
    role: res.locals.boardRole,
  });
  res.json({ ticket });
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: boardRoleSchema.exclude(["owner"]),
});

/** Only an existing accepted friend can be added to a board — ties the friends feature to boards meaningfully. */
boardsRouter.post("/:boardId/members", requireBoardRole("owner"), async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const ownerId = res.locals.userId as string;
  const target = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!target) {
    res.status(404).json({ error: "No user with that email" });
    return;
  }

  const [userAId, userBId] = ownerId < target.id ? [ownerId, target.id] : [target.id, ownerId];
  const areFriends = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (!areFriends) {
    res.status(403).json({ error: "You can only add friends to a board" });
    return;
  }

  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: req.params.boardId, userId: target.id } },
    create: { boardId: req.params.boardId, userId: target.id, role: parsed.data.role },
    update: { role: parsed.data.role },
  });

  res.status(204).send();
});
