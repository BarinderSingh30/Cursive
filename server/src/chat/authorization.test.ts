import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { resolveConversationMembership } from "./authorization.js";

afterEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversationMember.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany({ where: { email: { contains: "@chat-auth-test.local" } } });
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
