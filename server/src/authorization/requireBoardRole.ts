import type { NextFunction, Request, Response } from "express";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { getSessionFromRequest } from "../auth/session.js";
import { resolveBoardRole } from "./boardAccess.js";

/**
 * Express middleware factory: rejects unless the caller has at least
 * `minimum` role on `req.params.boardId`. The caller can be a logged-in
 * member (session cookie) or a share-link visitor (`X-Share-Token` header,
 * logged in or not) — resolveBoardRole is what actually decides which. A
 * share-token resolution never produces higher than "viewer", so this never
 * changes behavior for "collaborator"/"owner"-minimum routes.
 */
export function requireBoardRole(minimum: BoardRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const boardId = req.params.boardId;
    const result = await getSessionFromRequest(req);
    const userId = result?.user?.id ?? null;
    const shareToken = req.header("x-share-token") || undefined;

    const access = await resolveBoardRole({ userId, boardId, shareToken });
    if (!roleAtLeast(access.role, minimum)) {
      res.status(access.userId ? 403 : 401).json({ error: "Not allowed" });
      return;
    }

    res.locals.userId = access.userId;
    res.locals.boardRole = access.role;
    res.locals.anonymous = access.anonymous;
    next();
  };
}
