import { Router } from "express";
import {
  createBoardSchema,
  createBoardInviteSchema,
  type BoardSummary,
  type BoardMemberSummary,
  type PendingBoardInvite,
} from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";
import { requireAuth } from "../authorization/requireAuth.js";
import { requireBoardRole } from "../authorization/requireBoardRole.js";
import { mintSyncTicket } from "../authorization/syncTicket.js";
import { notifyBoardMembershipChanged, notifyBoardDeleted } from "../collab/hocuspocus.js";

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

boardsRouter.get("/:boardId", requireBoardRole("viewer"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  const body: BoardSummary = {
    id: board.id,
    name: board.name,
    role: res.locals.boardRole,
    createdAt: board.createdAt.toISOString(),
  };
  res.json(body);
});

boardsRouter.delete("/:boardId", requireBoardRole("owner"), async (req, res) => {
  // Broadcast before deleting, while everyone currently connected can still
  // be reached through this room's live Hocuspocus document.
  notifyBoardDeleted(req.params.boardId);
  // Cascades to BoardMember rows automatically (schema.prisma: onDelete: Cascade).
  await prisma.board.delete({ where: { id: req.params.boardId } });
  res.status(204).send();
});

boardsRouter.get("/:boardId/sync-ticket", requireBoardRole("viewer"), async (req, res) => {
  const ticket = mintSyncTicket({
    userId: res.locals.userId as string,
    boardId: req.params.boardId,
    role: res.locals.boardRole,
  });
  res.json({ ticket });
});

/**
 * Only an existing accepted friend can be invited to a board — ties the
 * friends feature to boards meaningfully. This creates a pending invite,
 * not a membership — the invitee has to accept it first (see
 * boardInvites.routes.ts) before they actually get access.
 */
boardsRouter.post("/:boardId/invites", requireBoardRole("owner"), async (req, res) => {
  const parsed = createBoardInviteSchema.safeParse(req.body);
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

  const [userAId, userBId] = orderedPair(ownerId, target.id);
  const areFriends = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (!areFriends) {
    res.status(403).json({ error: "You can only invite friends to a board" });
    return;
  }

  await prisma.boardInvite.upsert({
    where: { boardId_inviteeId: { boardId: req.params.boardId, inviteeId: target.id } },
    create: { boardId: req.params.boardId, inviterId: ownerId, inviteeId: target.id, role: parsed.data.role },
    update: { role: parsed.data.role, status: "pending" },
  });

  res.status(204).send();
});

boardsRouter.get("/:boardId/invites", requireBoardRole("owner"), async (req, res) => {
  const invites = await prisma.boardInvite.findMany({
    where: { boardId: req.params.boardId, status: "pending" },
    include: { invitee: true },
    orderBy: { createdAt: "asc" },
  });

  const body: PendingBoardInvite[] = invites.map((i) => ({
    id: i.id,
    inviteeName: i.invitee.name,
    inviteeEmail: i.invitee.email,
    role: i.role,
  }));
  res.json(body);
});

boardsRouter.get("/:boardId/members", requireBoardRole("owner"), async (req, res) => {
  const members = await prisma.boardMember.findMany({
    where: { boardId: req.params.boardId },
    include: { user: true },
    orderBy: { user: { email: "asc" } },
  });

  const body: BoardMemberSummary[] = members.map((m) => ({
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
  }));
  res.json(body);
});

boardsRouter.delete("/:boardId/members/:userId", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  if (req.params.userId === board.ownerId) {
    res.status(400).json({ error: "Can't remove the board owner" });
    return;
  }

  await prisma.boardMember.deleteMany({ where: { boardId: req.params.boardId, userId: req.params.userId } });
  notifyBoardMembershipChanged(req.params.boardId);
  res.status(204).send();
});
