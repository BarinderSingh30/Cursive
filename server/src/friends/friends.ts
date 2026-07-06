import { prisma } from "../db/prisma.js";
import { orderedPair } from "../db/orderedPair.js";

export class FriendshipNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendshipNotFoundError";
  }
}

export async function removeFriend(userId: string, friendId: string): Promise<void> {
  const [userAId, userBId] = orderedPair(userId, friendId);
  const friendship = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (!friendship) throw new FriendshipNotFoundError("You're not friends with this user");

  await prisma.$transaction([
    prisma.friendship.delete({ where: { id: friendship.id } }),
    prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    }),
  ]);
}
