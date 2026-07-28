import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  createBoardSchema,
  createBoardInviteSchema,
  type BoardSummary,
  type BoardMemberSummary,
  type PendingBoardInvite,
  type ShareLinkState,
  type ShareLinkInfo,
  type BoardListingState,
  type BoardRole,
} from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";
import { requireAuth } from "../authorization/requireAuth.js";
import { requireBoardRole } from "../authorization/requireBoardRole.js";
import { mintConnectionTicket } from "../authorization/connectionTicket.js";
import { mintCallToken } from "../call/callToken.js";
import { env } from "../env.js";
import { notifyBoardMembershipChanged, notifyBoardDeleted } from "../collab/hocuspocus.js";
import { decodeThumbnailShapes } from "../collab/boardThumbnail.js";
import { getSessionFromRequest } from "../auth/session.js";
import { listBoardMessages } from "../boardChat/messages.js";

/**
 * The identity string embedded in a connection ticket/call token: the real
 * session user id when logged in, or a stable anon:<id> string for a
 * share-link visitor. The client generates and persists that id itself
 * (see client/src/viewer/useAnonIdentity.ts) so it stays stable across
 * reconnects on the same browser — the random() fallback only fires if a
 * caller somehow omits the header.
 */
function visitorIdentity(req: import("express").Request, res: import("express").Response): string {
  const userId = res.locals.userId as string | null;
  if (userId) return userId;
  return `anon:${req.header("x-anon-id") || randomUUID()}`;
}

/**
 * A share-link visitor picks their own call display name via the
 * `x-anon-name` header — always prefixed with "Guest: " so it can never be
 * confused with a real registered user's name in the call UI, and stripped
 * of control characters and length-capped since it's otherwise unvalidated
 * user input rendered directly to other participants.
 */
function anonDisplayName(req: import("express").Request): string {
  const raw = (req.header("x-anon-name") ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim();
  return `Guest: ${raw.slice(0, 40) || "Guest"}`;
}

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
      shareEnabled: true,
      shareToken: randomUUID(),
      members: { create: { userId: ownerId, role: "owner" } },
    },
  });

  const body: BoardSummary = {
    id: board.id,
    name: board.name,
    role: "owner",
    createdAt: board.createdAt.toISOString(),
    thumbnailShapes: [],
  };
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
    thumbnailShapes: decodeThumbnailShapes(m.board.content),
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
    thumbnailShapes: decodeThumbnailShapes(board.content),
  };
  res.json(body);
});

boardsRouter.get("/:boardId/share", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  const body: ShareLinkState = { enabled: board.shareEnabled, token: board.shareEnabled ? board.shareToken : null };
  res.json(body);
});

boardsRouter.post("/:boardId/share/enable", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  const token = board.shareToken ?? randomUUID();
  const updated = await prisma.board.update({
    where: { id: board.id },
    data: { shareEnabled: true, shareToken: token },
  });
  const body: ShareLinkState = { enabled: true, token: updated.shareToken };
  res.json(body);
});

// Replaces the token outright, instantly invalidating any previously shared URL.
boardsRouter.post("/:boardId/share/regenerate", requireBoardRole("owner"), async (req, res) => {
  const updated = await prisma.board.update({
    where: { id: req.params.boardId },
    data: { shareEnabled: true, shareToken: randomUUID() },
  });
  const body: ShareLinkState = { enabled: true, token: updated.shareToken };
  res.json(body);
});

boardsRouter.post("/:boardId/share/disable", requireBoardRole("owner"), async (req, res) => {
  await prisma.board.update({ where: { id: req.params.boardId }, data: { shareEnabled: false } });
  const body: ShareLinkState = { enabled: false, token: null };
  res.json(body);
});

boardsRouter.get("/:boardId/listed", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  const body: BoardListingState = { listed: board.listed };
  res.json(body);
});

boardsRouter.post("/:boardId/listed/enable", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.update({ where: { id: req.params.boardId }, data: { listed: true } });
  const body: BoardListingState = { listed: board.listed };
  res.json(body);
});

boardsRouter.post("/:boardId/listed/disable", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.update({ where: { id: req.params.boardId }, data: { listed: false } });
  const body: BoardListingState = { listed: board.listed };
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
  const ticket = mintConnectionTicket({
    purpose: "board-sync",
    userId: visitorIdentity(req, res),
    anonymous: res.locals.anonymous as boolean,
    boardId: req.params.boardId,
    role: res.locals.boardRole as BoardRole,
  });
  res.json({ ticket });
});

boardsRouter.get("/:boardId/call-token", requireBoardRole("viewer"), async (req, res) => {
  const userId = res.locals.userId as string | null;
  const identity = visitorIdentity(req, res);
  const userName = userId
    ? await prisma.user.findUniqueOrThrow({ where: { id: userId } }).then((u) => u.name ?? u.email)
    : anonDisplayName(req);

  const token = await mintCallToken({
    userId: identity,
    userName,
    boardId: req.params.boardId,
    role: res.locals.boardRole as BoardRole,
  });
  res.json({ token, url: env.LIVEKIT_URL });
});

boardsRouter.get("/:boardId/chat/ticket", requireBoardRole("viewer"), async (req, res) => {
  const ticket = mintConnectionTicket({
    purpose: "board-chat",
    userId: visitorIdentity(req, res),
    anonymous: res.locals.anonymous as boolean,
    boardId: req.params.boardId,
    role: res.locals.boardRole as BoardRole,
  });
  res.json({ ticket });
});

boardsRouter.get("/:boardId/chat/messages", requireBoardRole("viewer"), async (req, res) => {
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const messages = await listBoardMessages(req.params.boardId, before);
  res.json(messages);
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

/**
 * Public: resolves a share token to the board it belongs to, with no role
 * requirement — this is how an anonymous visitor's browser first learns
 * which board a /watch/:shareToken URL points at. If the visitor happens to
 * be logged in and already has real board membership, hasMembership tells
 * the client to redirect to the normal /board/:boardId page instead.
 */
boardsRouter.get("/by-share/:shareToken", async (req, res) => {
  const board = await prisma.board.findFirst({
    where: { shareToken: req.params.shareToken, shareEnabled: true },
    include: { owner: true },
  });
  if (!board) {
    res.status(404).json({ error: "This link isn't active" });
    return;
  }

  const session = await getSessionFromRequest(req);
  const userId = session?.user?.id ?? null;
  const membership = userId
    ? await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId: board.id, userId } } })
    : null;

  const body: ShareLinkInfo = {
    boardId: board.id,
    boardName: board.name,
    ownerName: board.owner.name ?? "Anonymous",
    hasMembership: membership !== null,
  };
  res.json(body);
});
