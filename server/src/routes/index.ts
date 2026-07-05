import { Router } from "express";
import { boardsRouter } from "./boards.routes.js";
import { friendsRouter } from "./friends.routes.js";
import { boardInvitesRouter } from "./boardInvites.routes.js";

export const apiRouter = Router();

apiRouter.use("/boards", boardsRouter);
apiRouter.use("/friends", friendsRouter);
apiRouter.use("/board-invites", boardInvitesRouter);
