import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";
import { resolveConversationMembership } from "./authorization.js";

async function makeFriends(aId: string, bId: string) {
  const [userAId, userBId] = orderedPair(aId, bId);
  await prisma.friendship.create({ data: { userAId, userBId } });
}

const TEST_USER_FILTER = { email: { contains: "@chat-auth-test.local" } };

// Scoped to this file's own test users only (via cascade on delete) — a
// bare deleteMany() here would wipe every Message/Conversation/Friendship
// in the whole database, test-created or not.
afterEach(async () => {
  await prisma.conversation.deleteMany({ where: { members: { some: { user: TEST_USER_FILTER } } } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("resolveConversationMembership", () => {
  it("reports membership for someone actually in the conversation", async () => {
    const alice = await prisma.user.create({ data: { email: "alice@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: { userId: alice.id } } },
    });

    const result = await resolveConversationMembership({ userId: alice.id, conversationId: conversation.id });
    expect(result.isMember).toBe(true);
  });

  it("reports no membership for someone outside the conversation", async () => {
    const alice = await prisma.user.create({ data: { email: "alice2@chat-auth-test.local", emailVerified: true } });
    const bob = await prisma.user.create({ data: { email: "bob2@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: { userId: alice.id } } },
    });

    const result = await resolveConversationMembership({ userId: bob.id, conversationId: conversation.id });
    expect(result.isMember).toBe(false);
  });
});

describe("resolveConversationMembership canSend", () => {
  it("allows sending in a DM between current friends", async () => {
    const alice = await prisma.user.create({ data: { email: "alice3@chat-auth-test.local", emailVerified: true } });
    const bob = await prisma.user.create({ data: { email: "bob3@chat-auth-test.local", emailVerified: true } });
    await makeFriends(alice.id, bob.id);
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: [{ userId: alice.id }, { userId: bob.id }] } },
    });

    const result = await resolveConversationMembership({ userId: alice.id, conversationId: conversation.id });
    expect(result.canSend).toBe(true);
  });

  it("disallows sending in a DM once the two members are no longer friends", async () => {
    const alice = await prisma.user.create({ data: { email: "alice4@chat-auth-test.local", emailVerified: true } });
    const bob = await prisma.user.create({ data: { email: "bob4@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: [{ userId: alice.id }, { userId: bob.id }] } },
    });

    const result = await resolveConversationMembership({ userId: alice.id, conversationId: conversation.id });
    expect(result.canSend).toBe(false);
  });

  it("always allows sending in a group conversation, friends or not", async () => {
    const alice = await prisma.user.create({ data: { email: "alice5@chat-auth-test.local", emailVerified: true } });
    const bob = await prisma.user.create({ data: { email: "bob5@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: true, name: "Group", members: { create: [{ userId: alice.id }, { userId: bob.id }] } },
    });

    const result = await resolveConversationMembership({ userId: alice.id, conversationId: conversation.id });
    expect(result.canSend).toBe(true);
  });

  it("disallows sending for someone who isn't a member at all", async () => {
    const alice = await prisma.user.create({ data: { email: "alice6@chat-auth-test.local", emailVerified: true } });
    const eve = await prisma.user.create({ data: { email: "eve6@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: [{ userId: alice.id }] } },
    });

    const result = await resolveConversationMembership({ userId: eve.id, conversationId: conversation.id });
    expect(result.canSend).toBe(false);
  });
});

describe("resolveConversationMembership clearedAt", () => {
  it("reports null clearedAt for a member who has never cleared history", async () => {
    const alice = await prisma.user.create({ data: { email: "alice7@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: { userId: alice.id } } },
    });

    const result = await resolveConversationMembership({ userId: alice.id, conversationId: conversation.id });
    expect(result.clearedAt).toBeNull();
  });

  it("reports the member's clearedAt once they've cleared history", async () => {
    const alice = await prisma.user.create({ data: { email: "alice8@chat-auth-test.local", emailVerified: true } });
    const conversation = await prisma.conversation.create({
      data: { isGroup: false, members: { create: { userId: alice.id } } },
    });
    const clearedAt = new Date();
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: conversation.id, userId: alice.id } },
      data: { clearedAt },
    });

    const result = await resolveConversationMembership({ userId: alice.id, conversationId: conversation.id });
    expect(result.clearedAt).toEqual(clearedAt);
  });
});
