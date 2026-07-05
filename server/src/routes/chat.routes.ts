import { Router } from "express";
import { createDmSchema, createGroupSchema } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../authorization/requireAuth.js";
import { mintConnectionTicket } from "../authorization/connectionTicket.js";
import { resolveConversationMembership } from "../chat/authorization.js";
import {
  NotFriendsError,
  createGroupConversation,
  findOrCreateDm,
  getConversationSummary,
  listConversationsForUser,
  markConversationRead,
} from "../chat/conversations.js";
import { notifyConversationCreated } from "../chat/wsGateway.js";

export const chatRouter = Router();
chatRouter.use(requireAuth);

chatRouter.get("/ticket", (req, res) => {
  const ticket = mintConnectionTicket({ purpose: "chat", userId: res.locals.userId as string });
  res.json({ ticket });
});

chatRouter.get("/conversations", async (req, res) => {
  const conversations = await listConversationsForUser(res.locals.userId as string);
  res.json(conversations);
});

chatRouter.post("/conversations/dm", async (req, res) => {
  const parsed = createDmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const selfId = res.locals.userId as string;
  const friend = await prisma.user.findUnique({ where: { email: parsed.data.friendEmail } });
  if (!friend) {
    res.status(404).json({ error: "No user with that email" });
    return;
  }

  try {
    const { conversation, created } = await findOrCreateDm(selfId, friend.id);
    if (created) {
      const summaryForFriend = await getConversationSummary(conversation.id, friend.id);
      notifyConversationCreated([friend.id], { type: "conversation-created", conversation: summaryForFriend });
    }
    res.status(201).json({ id: conversation.id });
  } catch (err) {
    if (err instanceof NotFriendsError) {
      res.status(403).json({ error: "You can only message friends" });
      return;
    }
    throw err;
  }
});

chatRouter.post("/conversations/group", async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const selfId = res.locals.userId as string;
  try {
    const conversation = await createGroupConversation(selfId, parsed.data.name, parsed.data.memberEmails);
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: conversation.id, userId: { not: selfId } },
    });
    await Promise.all(
      members.map(async (m) => {
        const summary = await getConversationSummary(conversation.id, m.userId);
        notifyConversationCreated([m.userId], { type: "conversation-created", conversation: summary });
      }),
    );
    res.status(201).json({ id: conversation.id });
  } catch (err) {
    if (err instanceof NotFriendsError) {
      res.status(403).json({ error: "You can only add friends to a group" });
      return;
    }
    throw err;
  }
});

chatRouter.get("/conversations/:id/messages", async (req, res) => {
  const access = await resolveConversationMembership({ userId: res.locals.userId as string, conversationId: req.params.id });
  if (!access.isMember) {
    res.status(403).json({ error: "Not a member of this conversation" });
    return;
  }

  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const messages = await prisma.message.findMany({
    where: { conversationId: req.params.id },
    include: { sender: true },
    orderBy: { createdAt: "desc" },
    take: 30,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  res.json(
    messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      senderName: m.sender.name,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

chatRouter.post("/conversations/:id/read", async (req, res) => {
  const access = await resolveConversationMembership({ userId: res.locals.userId as string, conversationId: req.params.id });
  if (!access.isMember) {
    res.status(403).json({ error: "Not a member of this conversation" });
    return;
  }

  await markConversationRead(res.locals.userId as string, req.params.id);
  res.status(204).send();
});
