import { Router } from "express";
import { listPublicBoards } from "../home/listPublicBoards.js";

export const homeRouter = Router();

// Public: no auth, no board-role check. This is the discovery surface —
// anyone, including a logged-out visitor, can see what's recommended.
homeRouter.get("/", async (req, res) => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
  const page = await listPublicBoards(limit);
  res.json(page);
});
