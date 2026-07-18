import type { Extension } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

/**
 * Backs every board's Y.Doc with its `content` column (see schema.prisma) so
 * a board survives server restarts and all-tabs-disconnected gaps — before
 * this, Hocuspocus kept documents in memory only, and losing every
 * connection to a board (e.g. a page reload) meant the next connection
 * started from a blank document.
 *
 * The room name (`documentName`) is the board's id. `fetch`/`store` move the
 * Yjs update as opaque binary — this file never inspects shape data.
 */
export const persistenceExtensions: Extension[] = [
  new Database({
    fetch: async ({ documentName }) => {
      const board = await prisma.board.findUnique({
        where: { id: documentName },
        select: { content: true },
      });
      return board?.content ?? null;
    },
    store: async ({ documentName, state }) => {
      try {
        await prisma.board.update({
          where: { id: documentName },
          data: { content: state },
        });
      } catch (err) {
        // The board was deleted while this (debounced) store was in flight —
        // nothing left to persist to, safe to drop.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return;
        throw err;
      }
    },
  }),
];
