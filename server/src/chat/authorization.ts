import { prisma } from "../db/prisma.js";
import { canSendInConversation } from "./conversations.js";

export interface ConversationAccessResult {
  isMember: boolean;
  lastReadAt: Date | null;
  /** False for a DM whose two members are no longer friends. Always true for groups. */
  canSend: boolean;
  /** Messages at or before this are hidden from this user's view (they cleared history). */
  clearedAt: Date | null;
}

/**
 * The single "can this user read/send in this conversation" check. Chat has
 * no role tiers like boards do — just membership, plus (for DMs only) a live
 * friendship check for sending. Both the REST routes and the WS gateway call
 * this instead of re-implementing the lookup, so the two surfaces can't
 * drift apart (the same principle boardAccess.ts establishes for boards).
 */
export async function resolveConversationMembership(params: {
  userId: string;
  conversationId: string;
}): Promise<ConversationAccessResult> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: params.conversationId, userId: params.userId } },
  });
  if (!membership) return { isMember: false, lastReadAt: null, canSend: false, clearedAt: null };

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: params.conversationId },
    include: { members: true },
  });
  const otherMember = conversation.members.find((m) => m.userId !== params.userId);
  const canSend = await canSendInConversation(conversation, otherMember?.userId, params.userId);

  return { isMember: true, lastReadAt: membership.lastReadAt, canSend, clearedAt: membership.clearedAt };
}
