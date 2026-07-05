import { Router } from "express";
import type { ReceivedBoardInvite, DeclinedBoardInvite } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../authorization/requireAuth.js";
import { notifyBoardMembershipChanged } from "../collab/hocuspocus.js";

export const boardInvitesRouter = Router();

boardInvitesRouter.use(requireAuth);

boardInvitesRouter.get("/received", async (req, res) => {
  const userId = res.locals.userId as string;
  const invites = await prisma.boardInvite.findMany({
    where: { inviteeId: userId, status: "pending" },
    include: { board: true, inviter: true },
    orderBy: { createdAt: "desc" },
  });

  const body: ReceivedBoardInvite[] = invites.map((i) => ({
    id: i.id,
    boardId: i.boardId,
    boardName: i.board.name,
    inviterName: i.inviter.name,
    inviterEmail: i.inviter.email,
    role: i.role,
    createdAt: i.createdAt.toISOString(),
  }));
  res.json(body);
});

boardInvitesRouter.get("/sent-declined", async (req, res) => {
  const userId = res.locals.userId as string;
  const invites = await prisma.boardInvite.findMany({
    where: { inviterId: userId, status: "declined" },
    include: { board: true, invitee: true },
    orderBy: { updatedAt: "desc" },
  });

  const body: DeclinedBoardInvite[] = invites.map((i) => ({
    id: i.id,
    boardId: i.boardId,
    boardName: i.board.name,
    inviteeName: i.invitee.name,
    inviteeEmail: i.invitee.email,
  }));
  res.json(body);
});

boardInvitesRouter.post("/:inviteId/accept", async (req, res) => {
  const userId = res.locals.userId as string;
  const invite = await prisma.boardInvite.findUnique({ where: { id: req.params.inviteId } });

  if (!invite || invite.inviteeId !== userId || invite.status !== "pending") {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  await prisma.$transaction([
    prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: invite.boardId, userId } },
      create: { boardId: invite.boardId, userId, role: invite.role },
      update: { role: invite.role },
    }),
    prisma.boardInvite.delete({ where: { id: invite.id } }),
  ]);

  notifyBoardMembershipChanged(invite.boardId);
  res.status(204).send();
});

boardInvitesRouter.post("/:inviteId/decline", async (req, res) => {
  const userId = res.locals.userId as string;
  const invite = await prisma.boardInvite.findUnique({ where: { id: req.params.inviteId } });

  if (!invite || invite.inviteeId !== userId || invite.status !== "pending") {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  await prisma.boardInvite.update({ where: { id: invite.id }, data: { status: "declined" } });
  // Same signal as an accept — the owner's invite dialog needs to stop
  // showing this as "waiting on a response" too, if it's open right now.
  notifyBoardMembershipChanged(invite.boardId);
  res.status(204).send();
});

/** The inviter acknowledging a decline notice — clears it. */
boardInvitesRouter.post("/:inviteId/dismiss", async (req, res) => {
  const userId = res.locals.userId as string;
  const invite = await prisma.boardInvite.findUnique({ where: { id: req.params.inviteId } });

  if (!invite || invite.inviterId !== userId || invite.status !== "declined") {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  await prisma.boardInvite.delete({ where: { id: invite.id } });
  res.status(204).send();
});
