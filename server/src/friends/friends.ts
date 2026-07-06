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

  const [{ count }] = await prisma.$transaction([
    prisma.friendship.deleteMany({ where: { userAId, userBId } }),
    prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    }),
  ]);

  if (count === 0) throw new FriendshipNotFoundError("You're not friends with this user");
}
