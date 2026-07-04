import type { Extension } from "@hocuspocus/server";

/**
 * Phase 1: no persistence extension, so Hocuspocus keeps each board's Y.Doc
 * in memory only — restarting the server loses all boards.
 *
 * A later phase can add a database-backed extension (e.g. @hocuspocus/extension-database)
 * to this array without touching collab/hocuspocus.ts.
 */
export const persistenceExtensions: Extension[] = [];
