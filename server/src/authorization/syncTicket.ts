import jwt from "jsonwebtoken";
import type { BoardRole } from "@cursive/shared";
import { env } from "../env.js";

/**
 * A WebSocket handshake can't carry the same auth as a normal fetch (the
 * session cookie is httpOnly, so client JS can't read it to forward
 * explicitly, and relying on the browser to attach it automatically across
 * ports in dev is fragile). Instead: the client fetches one of these
 * short-lived signed tickets via an authenticated REST call right before
 * connecting, and passes it to Hocuspocus as its connection token.
 */
export interface SyncTicketPayload {
  userId: string;
  boardId: string;
  role: BoardRole;
}

const TICKET_TTL_SECONDS = 300;

export function mintSyncTicket(payload: SyncTicketPayload): string {
  return jwt.sign(payload, env.SYNC_TICKET_SECRET, { expiresIn: TICKET_TTL_SECONDS });
}

export function verifySyncTicket(token: string): SyncTicketPayload | null {
  try {
    return jwt.verify(token, env.SYNC_TICKET_SECRET) as SyncTicketPayload;
  } catch {
    return null;
  }
}
