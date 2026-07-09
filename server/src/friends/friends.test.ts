import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";
import { FriendshipNotFoundError, removeFriend } from "./friends.js";

async function makeUser(email: string) {
  return prisma.user.create({ data: { email, emailVerified: true } });
}

async function makeFriends(aId: string, bId: string) {
  const [userAId, userBId] = orderedPair(aId, bId);
  await prisma.friendship.create({ data: { userAId, userBId } });
}

// Scoped to this file's own test users only — deleting them cascades away
// their FriendRequest/Friendship rows. A bare deleteMany() on those tables
// would wipe every friendship in the whole database, test-created or not.
afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: "@remove-friend-test.local" } } });
});

describe("removeFriend", () => {
  it("deletes the friendship between the two users", async () => {
    const alice = await makeUser("alice@remove-friend-test.local");
    const bob = await makeUser("bob@remove-friend-test.local");
    await makeFriends(alice.id, bob.id);

    await removeFriend(alice.id, bob.id);

    const [userAId, userBId] = orderedPair(alice.id, bob.id);
    const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
    expect(friendship).toBeNull();
  });

  it("deletes old friend-request rows between the two users, either direction", async () => {
    const alice = await makeUser("alice2@remove-friend-test.local");
    const bob = await makeUser("bob2@remove-friend-test.local");
    await makeFriends(alice.id, bob.id);
    await prisma.friendRequest.create({
      data: { senderId: bob.id, receiverId: alice.id, status: "accepted" },
    });

    await removeFriend(alice.id, bob.id);

    const requests = await prisma.friendRequest.findMany({
      where: { OR: [{ senderId: alice.id, receiverId: bob.id }, { senderId: bob.id, receiverId: alice.id }] },
    });
    expect(requests).toEqual([]);
  });

  it("works when called with the pair in the opposite order", async () => {
    const alice = await makeUser("alice3@remove-friend-test.local");
    const bob = await makeUser("bob3@remove-friend-test.local");
    await makeFriends(alice.id, bob.id);

    await removeFriend(bob.id, alice.id);

    const [userAId, userBId] = orderedPair(alice.id, bob.id);
    const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
    expect(friendship).toBeNull();
  });

  it("throws FriendshipNotFoundError when the two users aren't friends", async () => {
    const alice = await makeUser("alice4@remove-friend-test.local");
    const bob = await makeUser("bob4@remove-friend-test.local");

    await expect(removeFriend(alice.id, bob.id)).rejects.toBeInstanceOf(FriendshipNotFoundError);
  });
});
