import http from "node:http";
import cors from "cors";
import express from "express";
import { shapeSchema } from "@cursive/shared";
import { env } from "./env.js";
import { hocuspocus } from "./collab/hocuspocus.js";
import { createUpgradeHandler } from "./ws/router.js";

const app = express();
app.use(cors());

app.get("/health", (_req, res) => {
  const knownShapeTypes = shapeSchema.options.map((option) => option.shape.type.value);
  res.json({ status: "ok", knownShapeTypes });
});

const httpServer = http.createServer(app);
httpServer.on("upgrade", createUpgradeHandler(hocuspocus));

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on http://localhost:${env.PORT}`);
  console.log(`Yjs sync available at ws://localhost:${env.PORT}/sync`);
});
