import type { NextFunction, Request, Response } from "express";
import { getSessionFromRequest } from "../auth/session.js";

/** Plain "must be logged in" gate for routes that aren't scoped to one board (e.g. listing your own boards/friends). */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const result = await getSessionFromRequest(req);
  const userId = result?.user?.id;

  if (!userId) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }

  res.locals.userId = userId;
  next();
}
