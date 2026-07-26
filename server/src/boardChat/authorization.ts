import type { ConnectionTicketPayload } from "../authorization/connectionTicket.js";

type BoardChatTicket = Extract<ConnectionTicketPayload, { purpose: "board-chat" }>;

/**
 * The one board-chat write rule: any logged-in visitor can post — owner,
 * collaborator, an invited viewer, or a logged-in stranger just watching via
 * the public link — only a fully anonymous (not-logged-in) visitor can't.
 * Twitch-chat behavior, not a role check: role is always at least "viewer"
 * here already, since a ticket couldn't have been minted otherwise.
 */
export function canPostBoardChat(payload: BoardChatTicket): boolean {
  return !payload.anonymous;
}
