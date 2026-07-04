import { Server } from "@hocuspocus/server";
import { persistenceExtensions } from "./persistence.js";

/**
 * Hosts every board's Yjs document and relays sync updates between clients.
 * It never inspects shape data — Yjs updates are opaque binary diffs, so this
 * file has no canvas-specific code at all.
 *
 * Phase 2 will add an `onAuthenticate` hook here that checks the connecting
 * user's board role via `authorization/boardAccess`, rejecting or marking the
 * connection read-only accordingly.
 */
export const hocuspocus = Server.configure({
  name: "whiteboard-sync",
  extensions: persistenceExtensions,
});
