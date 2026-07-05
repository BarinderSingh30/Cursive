import { Server } from "@hocuspocus/server";
import { roleAtLeast } from "@cursive/shared";
import { persistenceExtensions } from "./persistence.js";
import { verifyConnectionTicket } from "../authorization/connectionTicket.js";

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
  extensions: persistenceExtensions,
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

    return { userId: payload.userId, role: payload.role };
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
