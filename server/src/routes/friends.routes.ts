import { Router } from "express";
import { sendFriendRequestSchema, type FriendRequestSummary, type FriendSummary } from "@cursive/shared";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../authorization/requireAuth.js";

export const friendsRouter = Router();

friendsRouter.use(requireAuth);

/** Always store a friendship with the lexicographically smaller id first, so A-B and B-A can't both exist. */
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

friendsRouter.post("/requests", async (req, res) => {
  const parsed = sendFriendRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const senderId = res.locals.userId as string;
  const receiver = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (!receiver) {
    res.status(404).json({ error: "No user with that email" });
    return;
  }
  if (receiver.id === senderId) {
    res.status(400).json({ error: "You can't friend yourself" });
    return;
  }

  const [userAId, userBId] = orderedPair(senderId, receiver.id);
  const alreadyFriends = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (alreadyFriends) {
    res.status(409).json({ error: "Already friends" });
    return;
  }

  const request = await prisma.friendRequest.upsert({
    where: { senderId_receiverId: { senderId, receiverId: receiver.id } },
    create: { senderId, receiverId: receiver.id },
    update: { status: "pending" },
  });

  res.status(201).json({ id: request.id });
});

friendsRouter.get("/requests", async (req, res) => {
  const userId = res.locals.userId as string;
  const requests = await prisma.friendRequest.findMany({
    where: { receiverId: userId, status: "pending" },
    include: { sender: true },
    orderBy: { createdAt: "desc" },
  });

  const body: FriendRequestSummary[] = requests.map((r) => ({
    id: r.id,
    senderId: r.senderId,
    senderEmail: r.sender.email,
    senderName: r.sender.name,
    createdAt: r.createdAt.toISOString(),
  }));
  res.json(body);
});

friendsRouter.post("/requests/:requestId/accept", async (req, res) => {
  const userId = res.locals.userId as string;
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.requestId } });

  if (!request || request.receiverId !== userId || request.status !== "pending") {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const [userAId, userBId] = orderedPair(request.senderId, request.receiverId);
  await prisma.$transaction([
    prisma.friendRequest.update({ where: { id: request.id }, data: { status: "accepted" } }),
    prisma.friendship.upsert({
      where: { userAId_userBId: { userAId, userBId } },
      create: { userAId, userBId },
      update: {},
    }),
  ]);

  res.status(204).send();
});

friendsRouter.post("/requests/:requestId/decline", async (req, res) => {
  const userId = res.locals.userId as string;
  const request = await prisma.friendRequest.findUnique({ where: { id: req.params.requestId } });

  if (!request || request.receiverId !== userId || request.status !== "pending") {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  await prisma.friendRequest.update({ where: { id: request.id }, data: { status: "declined" } });
  res.status(204).send();
});

friendsRouter.get("/", async (req, res) => {
  const userId = res.locals.userId as string;
  const friendships = await prisma.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: { userA: true, userB: true },
  });

  const body: FriendSummary[] = friendships.map((f) => {
    const friend = f.userAId === userId ? f.userB : f.userA;
    return { id: friend.id, email: friend.email, name: friend.name };
  });
  res.json(body);
});
