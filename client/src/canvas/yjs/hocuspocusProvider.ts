import { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { env } from "../../env.js";
import { api } from "../../api/client.js";

export function createHocuspocusProvider(boardId: string, document: Y.Doc) {
  return new HocuspocusProvider({
    url: env.SYNC_URL,
    name: boardId,
    document,
    // Fetched fresh on every (re)connect attempt rather than passed once —
    // tickets are short-lived on purpose, see server/src/authorization/connectionTicket.ts.
    token: async () => {
      const { ticket } = await api.get<{ ticket: string }>(`/api/boards/${boardId}/sync-ticket`);
      return ticket;
    },
  });
}
