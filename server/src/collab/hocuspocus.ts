import { randomUUID } from "node:crypto";
import { Server } from "@hocuspocus/server";
import { Redis as HocuspocusRedis } from "@hocuspocus/extension-redis";
import { roleAtLeast } from "@cursive/shared";
import type { BoardRole } from "@cursive/shared";
import { persistenceExtensions } from "./persistence.js";
import { verifyConnectionTicket } from "../authorization/connectionTicket.js";
import { recordBoardView } from "./viewCounting.js";
import { markViewerActive, markViewerGone, countActiveViewers, startHeartbeat, stopHeartbeat } from "./viewerPresence.js";
import { redis } from "../redis/client.js";

/**
 * Shape of the object `onAuthenticate` returns, available as `context` in
 * every later hook. Documentation only — @hocuspocus/server's hook payload
 * types (this installed version) type `context` as plain `any` rather than
 * threading a generic through `Server.configure`, so this isn't enforced by
 * the compiler, only by us returning exactly this shape below.
 */
interface SyncContext {
  userId: string;
  role: BoardRole;
  connectionId: string;
}

// Heartbeat timers are per-instance, in-memory state (a setInterval handle
// isn't something to share across instances) — only the presence data they
// write to Redis needs to be shared.
const heartbeatTimers = new Map<string, NodeJS.Timeout>();

/**
 * Hosts every board's Yjs document and relays sync updates between clients.
 * It never inspects shape data — Yjs updates are opaque binary diffs, so this
 * file has no canvas-specific code at all.
 *
 * The room name (`documentName`) IS the board's id. The client fetches a
 * short-lived signed ticket from `GET /api/boards/:boardId/sync-ticket`
 * (which already checked the caller's real role via `boardAccess`) and
 * passes it here as `token`. This hook just verifies that ticket instead of
 * re-deriving the role itself — one source of truth either way.
 */
export const hocuspocus = Server.configure({
  name: "whiteboard-sync",
  extensions: [...persistenceExtensions, new HocuspocusRedis({ redis })],
  onAuthenticate: async ({ token, documentName, connection }) => {
    const payload = verifyConnectionTicket(token);
    if (!payload || payload.purpose !== "board-sync" || payload.boardId !== documentName) {
      throw new Error("Not authorized");
    }

    // Below "collaborator" (i.e. a viewer) can still connect and receive
    // updates, but Hocuspocus itself will reject any sync message this
    // connection tries to send — enforced by the library, not just hidden
    // in the client UI.
    if (!roleAtLeast(payload.role, "collaborator")) {
      connection.readOnly = true;
    }

    return { userId: payload.userId, role: payload.role, connectionId: randomUUID() };
  },
  connected: async ({ context, documentName }) => {
    try {
      await recordBoardView(documentName, context.role);
    } catch (error) {
      console.error(`Failed to record board view for ${documentName}:`, error);
    }

    if (context.role !== "owner") {
      await markViewerActive(documentName, context.connectionId).catch((error) => {
        console.error(`Failed to record viewer presence for ${documentName}:`, error);
      });
      heartbeatTimers.set(context.connectionId, startHeartbeat(documentName, context.connectionId));
    }
  },
  onDisconnect: async ({ context, documentName }) => {
    const timer = heartbeatTimers.get(context.connectionId);
    if (timer) {
      stopHeartbeat(timer);
      heartbeatTimers.delete(context.connectionId);
    }

    if (context.role !== "owner") {
      await markViewerGone(documentName, context.connectionId).catch((error) => {
        console.error(`Failed to clear viewer presence for ${documentName}:`, error);
      });
    }
  },
});

/**
 * Lets a REST route (adding/removing a board member) push an instant signal
 * to anyone currently connected to that board, over the same WebSocket
 * connection they already have open — no separate notification channel
 * needed. If nobody's connected to this board right now, this is a no-op
 * (Hocuspocus only keeps a Document in memory while someone's using it).
 */
export function notifyBoardMembershipChanged(boardId: string) {
  hocuspocus.documents.get(boardId)?.broadcastStateless(JSON.stringify({ type: "membership-changed" }));
}

/**
 * Distinct from a plain membership change: deleting the whole board should
 * show everyone currently on it an explicit message and let them choose when
 * to leave, rather than silently yanking them back to the dashboard.
 */
export function notifyBoardDeleted(boardId: string) {
  hocuspocus.documents.get(boardId)?.broadcastStateless(JSON.stringify({ type: "board-deleted" }));
}

/**
 * Live viewer count for the Home page: every board's currently-active
 * (non-owner) connections, tracked in Redis so the count is correct
 * regardless of which server instance answers the request — previously this
 * read Hocuspocus's local in-memory `documents` map, which only ever saw
 * connections held by this one process.
 */
export async function getLiveViewerCount(boardId: string): Promise<number> {
  return countActiveViewers(boardId);
}
