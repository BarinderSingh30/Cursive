import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { Hocuspocus } from "@hocuspocus/server";
import { chatWss } from "../chat/wsGateway.js";

/**
 * Dispatches raw HTTP upgrade requests by URL path, so Hocuspocus's own
 * WebSocket handling and (from Phase 3 on) the custom chat/signaling
 * gateway can share a single HTTP server port without colliding.
 *
 * Hocuspocus doesn't take over the upgrade itself — it only exposes
 * `handleConnection(ws, request)` once you've already accepted the raw
 * WebSocket via a `noServer: true` WebSocketServer, so that's the wiring here.
 */
export function createUpgradeHandler(hocuspocus: Hocuspocus) {
  const syncWss = new WebSocketServer({ noServer: true });

  return (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(request.url ?? "", "http://localhost");

    if (pathname === "/sync") {
      syncWss.handleUpgrade(request, socket, head, (ws) => {
        hocuspocus.handleConnection(ws, request);
      });
      return;
    }

    if (pathname === "/chat") {
      chatWss.handleUpgrade(request, socket, head, (ws) => {
        chatWss.emit("connection", ws, request);
      });
      return;
    }

    // Phase 3 adds a call-signaling gateway branch here in a later task.
    socket.destroy();
  };
}
