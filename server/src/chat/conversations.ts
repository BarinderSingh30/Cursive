import type { Conversation } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library.js";
import type { ChatMessage, ConversationSummary } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";

export class NotFriendsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFriendsError";
  }
}

export class MembersNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MembersNotFoundError";
  }
}

async function areFriends(userAId: string, userBId: string): Promise<boolean> {
  const [a, b] = orderedPair(userAId, userBId);
  const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  return friendship !== null;
}

/** Finds the existing DM with this friend, or creates it. Never two DMs between the same pair. */
export async function findOrCreateDm(
  selfId: string,
  friendId: string,
): Promise<{ conversation: Conversation; created: boolean }> {
  if (!(await areFriends(selfId, friendId))) throw new NotFriendsError("You can only message friends");

  const [a, b] = orderedPair(selfId, friendId);
  const dmKey = `${a}:${b}`;

  const existing = await prisma.conversation.findUnique({ where: { dmKey } });
  if (existing) return { conversation: existing, created: false };

  try {
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, dmKey, members: { create: [{ userId: selfId }, { userId: friendId }] } },
    });
    return { conversation, created: true };
  } catch (error) {
    const isDmKeyRaceLoss =
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | string | undefined)?.includes("dmKey");
    if (!isDmKeyRaceLoss) throw error;

    // Two near-simultaneous first messages can both pass the friend check
    // above and race to create the same dmKey — the DB's unique constraint
    // rejects the loser. Treat that as success: fetch what won the race.
    const winner = await prisma.conversation.findUnique({ where: { dmKey } });
    if (winner) return { conversation: winner, created: false };
    throw new Error("Failed to create or find DM conversation");
  }
}

export async function createGroupConversation(
  creatorId: string,
  name: string,
  memberEmails: string[],
): Promise<Conversation> {
  const members = await prisma.user.findMany({ where: { email: { in: memberEmails } } });
  if (members.length !== memberEmails.length) throw new MembersNotFoundError("One or more members not found");

  for (const member of members) {
    if (!(await areFriends(creatorId, member.id))) throw new NotFriendsError("You can only add friends to a group");
  }

  return prisma.conversation.create({
    data: {
      isGroup: true,
      name,
      members: { create: [{ userId: creatorId }, ...members.map((m) => ({ userId: m.id }))] },
    },
  });
}

async function summarizeConversation(conversationId: string, userId: string): Promise<ConversationSummary> {
  const membership = await prisma.conversationMember.findUniqueOrThrow({
    where: { conversationId_userId: { conversationId, userId } },
  });
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { members: { include: { user: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const lastMessage = conversation.messages[0] ?? null;
  const otherMember = conversation.members.find((m) => m.userId !== userId);
  const displayName = conversation.isGroup
    ? conversation.name ?? "Group chat"
    : otherMember?.user.name ?? otherMember?.user.email ?? "Unknown";

  const unreadCount = await prisma.message.count({
    where: { conversationId, createdAt: { gt: membership.lastReadAt }, senderId: { not: userId } },
  });

  return {
    id: conversation.id,
    isGroup: conversation.isGroup,
    displayName,
    lastMessage: lastMessage?.content ?? null,
    lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
    unreadCount,
  };
}

export async function getConversationSummary(conversationId: string, userId: string): Promise<ConversationSummary> {
  return summarizeConversation(conversationId, userId);
}

export async function listConversationsForUser(userId: string): Promise<ConversationSummary[]> {
  const memberships = await prisma.conversationMember.findMany({ where: { userId } });
  const withSortKey = await Promise.all(
    memberships.map(async (m) => {
      const summary = await summarizeConversation(m.conversationId, userId);
      return { summary, sortKey: summary.lastMessageAt ? new Date(summary.lastMessageAt).getTime() : 0 };
    }),
  );
  return withSortKey.sort((a, b) => b.sortKey - a.sortKey).map((s) => s.summary);
}

export async function markConversationRead(userId: string, conversationId: string): Promise<void> {
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  });
}

export async function recordMessage(conversationId: string, senderId: string, content: string): Promise<ChatMessage> {
  const message = await prisma.message.create({
    data: { conversationId, senderId, content },
    include: { sender: true },
  });
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.sender.name,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
