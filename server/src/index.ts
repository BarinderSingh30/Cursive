import http from "node:http";
import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { shapeSchema } from "@cursive/shared";
import { env } from "./env.js";
import { auth } from "./auth/betterAuth.js";
import { apiRouter } from "./routes/index.js";
import { hocuspocus } from "./collab/hocuspocus.js";
import { createUpgradeHandler } from "./ws/router.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

// Better Auth's own handler must be mounted before express.json() — it
// parses the request body itself, and letting Express consume the stream
// first would leave nothing for Better Auth to read.
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());
app.use("/api", apiRouter);

app.get("/health", (_req, res) => {
  const knownShapeTypes = shapeSchema.options.map((option) => option.shape.type.value);
  res.json({ status: "ok", knownShapeTypes });
});

// Must be mounted last — Express only routes errors to middleware registered after the route that threw.
app.use(errorHandler);

const httpServer = http.createServer(app);
httpServer.on("upgrade", createUpgradeHandler(hocuspocus));

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
  console.log(`Yjs sync available at ws://localhost:${env.PORT}/sync`);
});
