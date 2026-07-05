import jwt from "jsonwebtoken";
import type { BoardRole } from "@cursive/shared";
import { env } from "../env.js";

/**
 * A WebSocket handshake can't carry the same auth as a normal fetch (the
 * session cookie is httpOnly, so client JS can't forward it, and relying on
 * the browser to attach it automatically across dev ports is fragile).
 * Instead: right before connecting, the client fetches one of these
 * short-lived signed tickets via an authenticated REST call, and passes it
 * as the connection token. `purpose` stops a board-sync ticket from being
 * replayed as a chat ticket, or vice versa.
 */
export type ConnectionTicketPayload =
  | { purpose: "board-sync"; userId: string; boardId: string; role: BoardRole }
  | { purpose: "chat"; userId: string };

const TICKET_TTL_SECONDS = 300;

export function mintConnectionTicket(payload: ConnectionTicketPayload): string {
  return jwt.sign(payload, env.SYNC_TICKET_SECRET, { expiresIn: TICKET_TTL_SECONDS });
}

export function verifyConnectionTicket(token: string): ConnectionTicketPayload | null {
  try {
    const decoded = jwt.verify(token, env.SYNC_TICKET_SECRET);
    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }
    // jwt.verify hands back the standard `iat`/`exp` claims alongside our
    // payload fields — strip them so callers only see the ticket's own shape.
    const { iat: _iat, exp: _exp, ...payload } = decoded as Record<string, unknown>;
    return payload as ConnectionTicketPayload;
  } catch {
    return null;
  }
}
