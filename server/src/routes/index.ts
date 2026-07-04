import { Router } from "express";
import { boardsRouter } from "./boards.routes.js";
import { friendsRouter } from "./friends.routes.js";

export const apiRouter = Router();

apiRouter.use("/boards", boardsRouter);
apiRouter.use("/friends", friendsRouter);
