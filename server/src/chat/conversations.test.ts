import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";
import {
  MembersNotFoundError,
  NotFriendsError,
  clearConversationHistory,
  createGroupConversation,
  deleteMessageForUser,
  findOrCreateDm,
  getConversationSummary,
  listConversationsForUser,
  markConversationRead,
  recordMessage,
} from "./conversations.js";

async function makeUser(email: string) {
  return prisma.user.create({ data: { email, emailVerified: true } });
}

async function makeFriends(aId: string, bId: string) {
  const [userAId, userBId] = orderedPair(aId, bId);
  await prisma.friendship.create({ data: { userAId, userBId } });
}

const TEST_USER_FILTER = { email: { contains: "@chat-conv-test.local" } };

// Scoped to this file's own test users only (via cascade on delete) — a
// bare deleteMany() here would wipe every Message/Conversation/Friendship
// in the whole database, test-created or not.
afterEach(async () => {
  await prisma.conversation.deleteMany({ where: { members: { some: { user: TEST_USER_FILTER } } } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("findOrCreateDm", () => {
  it("returns the same conversation on a second call, either direction", async () => {
    const alice = await makeUser("alice@chat-conv-test.local");
    const bob = await makeUser("bob@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);

    const first = await findOrCreateDm(alice.id, bob.id);
    const second = await findOrCreateDm(bob.id, alice.id);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.conversation.id).toBe(first.conversation.id);
  });

  it("refuses to create a DM between non-friends", async () => {
    const alice = await makeUser("alice2@chat-conv-test.local");
    const bob = await makeUser("bob2@chat-conv-test.local");

    await expect(findOrCreateDm(alice.id, bob.id)).rejects.toBeInstanceOf(NotFriendsError);
  });

  it("resolves to the same conversation even when two requests race to create it", async () => {
    const alice = await makeUser("alice3@chat-conv-test.local");
    const bob = await makeUser("bob3@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);

    const [first, second] = await Promise.all([findOrCreateDm(alice.id, bob.id), findOrCreateDm(bob.id, alice.id)]);

    expect(first.conversation.id).toBe(second.conversation.id);
  });
});

describe("createGroupConversation", () => {
  it("creates a group with the creator plus their friends", async () => {
    const alice = await makeUser("alice4@chat-conv-test.local");
    const bob = await makeUser("bob4@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);

    const group = await createGroupConversation(alice.id, "Study group", [bob.email]);

    expect(group.isGroup).toBe(true);
    const members = await prisma.conversationMember.findMany({ where: { conversationId: group.id } });
    expect(members).toHaveLength(2);
  });

  it("refuses a member who isn't the creator's friend", async () => {
    const alice = await makeUser("alice5@chat-conv-test.local");
    const stranger = await makeUser("stranger@chat-conv-test.local");

    await expect(createGroupConversation(alice.id, "Study group", [stranger.email])).rejects.toBeInstanceOf(
      NotFriendsError,
    );
  });

  it("refuses a memberEmails entry that doesn't resolve to a real user", async () => {
    const alice = await makeUser("alice7@chat-conv-test.local");

    await expect(
      createGroupConversation(alice.id, "Study group", ["nobody@chat-conv-test.local"]),
    ).rejects.toBeInstanceOf(MembersNotFoundError);
  });
});

describe("canSend on ConversationSummary", () => {
  it("is true for a DM between current friends", async () => {
    const alice = await makeUser("alice8@chat-conv-test.local");
    const bob = await makeUser("bob8@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);

    const summary = await getConversationSummary(conversation.id, alice.id);
    expect(summary.canSend).toBe(true);
  });

  it("is false for a DM once the two are no longer friends", async () => {
    const alice = await makeUser("alice9@chat-conv-test.local");
    const bob = await makeUser("bob9@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);
    await prisma.friendship.deleteMany({ where: { OR: [{ userAId: alice.id }, { userBId: alice.id }] } });

    const summary = await getConversationSummary(conversation.id, alice.id);
    expect(summary.canSend).toBe(false);
  });

  it("is true for a group conversation regardless of friendship", async () => {
    const alice = await makeUser("alice10@chat-conv-test.local");
    const bob = await makeUser("bob10@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const group = await createGroupConversation(alice.id, "Study group", [bob.email]);

    const summary = await getConversationSummary(group.id, alice.id);
    expect(summary.canSend).toBe(true);
  });
});

describe("clearConversationHistory", () => {
  it("hides messages sent before clearing from the summary and unread count, but a later message shows up", async () => {
    const alice = await makeUser("alice11@chat-conv-test.local");
    const bob = await makeUser("bob11@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);
    await recordMessage(conversation.id, bob.id, "old message");

    await clearConversationHistory(alice.id, conversation.id);

    const summaryAfterClear = await getConversationSummary(conversation.id, alice.id);
    expect(summaryAfterClear.lastMessage).toBeNull();
    expect(summaryAfterClear.unreadCount).toBe(0);

    await recordMessage(conversation.id, bob.id, "new message");
    const summaryAfterNewMessage = await getConversationSummary(conversation.id, alice.id);
    expect(summaryAfterNewMessage.lastMessage).toBe("new message");
  });

  it("does not affect the other member's view", async () => {
    const alice = await makeUser("alice12@chat-conv-test.local");
    const bob = await makeUser("bob12@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);
    await recordMessage(conversation.id, bob.id, "hello alice");

    await clearConversationHistory(alice.id, conversation.id);

    const bobsSummary = await getConversationSummary(conversation.id, bob.id);
    expect(bobsSummary.lastMessage).toBe("hello alice");
  });
});

describe("deleteMessageForUser", () => {
  it("hides a specific message from the deleting user's summary but not the other member's", async () => {
    const alice = await makeUser("alice13@chat-conv-test.local");
    const bob = await makeUser("bob13@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);
    const message = await recordMessage(conversation.id, bob.id, "delete me");

    await deleteMessageForUser(alice.id, message.id);

    const alicesSummary = await getConversationSummary(conversation.id, alice.id);
    expect(alicesSummary.lastMessage).toBeNull();
    expect(alicesSummary.unreadCount).toBe(0);

    const bobsSummary = await getConversationSummary(conversation.id, bob.id);
    expect(bobsSummary.lastMessage).toBe("delete me");
  });

  it("is idempotent when called twice for the same message", async () => {
    const alice = await makeUser("alice14@chat-conv-test.local");
    const bob = await makeUser("bob14@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);
    const message = await recordMessage(conversation.id, bob.id, "hi");

    await deleteMessageForUser(alice.id, message.id);
    await expect(deleteMessageForUser(alice.id, message.id)).resolves.not.toThrow();
  });
});

describe("unread counting", () => {
  it("counts a message as unread until the recipient marks it read", async () => {
    const alice = await makeUser("alice6@chat-conv-test.local");
    const bob = await makeUser("bob6@chat-conv-test.local");
    await makeFriends(alice.id, bob.id);
    const { conversation } = await findOrCreateDm(alice.id, bob.id);

    await recordMessage(conversation.id, alice.id, "hey bob");

    const [bobsView] = await listConversationsForUser(bob.id);
    expect(bobsView.unreadCount).toBe(1);
    expect(bobsView.lastMessage).toBe("hey bob");

    await markConversationRead(bob.id, conversation.id);

    const [bobsViewAfter] = await listConversationsForUser(bob.id);
    expect(bobsViewAfter.unreadCount).toBe(0);
  });
});
