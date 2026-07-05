import type { NextFunction, Request, Response } from "express";
import { MembersNotFoundError, NotFriendsError } from "../chat/conversations.js";

/** Global Express error-handling middleware. Must be mounted last, after all routes. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof NotFriendsError) {
    res.status(403).json({ error: err.message || "Not allowed" });
    return;
  }

  if (err instanceof MembersNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
