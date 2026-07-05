import { prisma } from "../db/prisma.js";

export interface ConversationAccessResult {
  isMember: boolean;
  lastReadAt: Date | null;
}

/**
 * The single "can this user read/send in this conversation" check. Chat has
 * no role tiers like boards do — just membership. Both the REST routes and
 * the WS gateway call this instead of re-implementing the lookup, so the two
 * surfaces can't drift apart (the same principle boardAccess.ts establishes
 * for boards).
 */
export async function resolveConversationMembership(params: {
  userId: string;
  conversationId: string;
}): Promise<ConversationAccessResult> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: params.conversationId, userId: params.userId } },
  });
  return { isMember: membership !== null, lastReadAt: membership?.lastReadAt ?? null };
}
