import type { NextFunction, Request, Response } from "express";

/** Wraps an async Express handler so a rejected promise is forwarded to `next(err)`
 * instead of hanging the request. Express 4 does not do this automatically. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
