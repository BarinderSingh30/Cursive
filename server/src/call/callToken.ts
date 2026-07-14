import { AccessToken } from "livekit-server-sdk";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { env } from "../env.js";

/**
 * Mints a LiveKit access token scoped to one board's call room. This is a
 * separate token scheme from authorization/connectionTicket.ts — LiveKit
 * verifies its own JWTs against LIVEKIT_API_KEY/SECRET, not
 * SYNC_TICKET_SECRET — but it's gated the same way every other board
 * connection is: only reachable behind requireBoardRole("viewer"), with
 * publish rights computed from the same roleAtLeast check hocuspocus.ts
 * already uses for the canvas's read-only flag.
 */
export async function mintCallToken(params: {
  userId: string;
  userName: string;
  boardId: string;
  role: BoardRole;
}): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: params.userId,
    name: params.userName,
  });
  at.addGrant({
    roomJoin: true,
    room: params.boardId,
    canPublish: roleAtLeast(params.role, "collaborator"),
    canSubscribe: true,
  });
  return at.toJwt();
}
