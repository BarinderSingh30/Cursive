import { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { env } from "../../env.js";

export function createHocuspocusProvider(roomId: string, document: Y.Doc) {
  return new HocuspocusProvider({
    url: env.SYNC_URL,
    name: roomId,
    document,
  });
}
