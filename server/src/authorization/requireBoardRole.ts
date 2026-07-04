import type { NextFunction, Request, Response } from "express";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { getSessionFromRequest } from "../auth/session.js";
import { resolveBoardRole } from "./boardAccess.js";

/** Express middleware factory: rejects unless the logged-in user has at least `minimum` role on `req.params.boardId`. */
export function requireBoardRole(minimum: BoardRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const boardId = req.params.boardId;
    const result = await getSessionFromRequest(req);
    const userId = result?.user?.id ?? null;

    if (!userId) {
      res.status(401).json({ error: "Not logged in" });
      return;
    }

    const access = await resolveBoardRole({ userId, boardId });
    if (!roleAtLeast(access.role, minimum)) {
      res.status(403).json({ error: "Not allowed" });
      return;
    }

    res.locals.userId = userId;
    res.locals.boardRole = access.role;
    next();
  };
}
