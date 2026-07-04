# Architecture

This doc is updated as each phase in [`ROADMAP.md`](ROADMAP.md) lands. Right now it describes Phase 1 only.

## Phase 1: Canvas + sync

Two apps talk to each other over one thing: a Yjs CRDT document.

- **`client/`** renders the canvas with Konva and holds a local `Y.Doc`. When you draw or move a shape, the change is written to the local doc immediately (you see it instantly, no round trip), and Yjs computes a small diff that's sent to the server over WebSocket.
- **`server/`** runs [Hocuspocus](https://tiptap.dev/hocuspocus), a Node.js framework built specifically for hosting Yjs documents. It doesn't know what a "rectangle" is — it just relays the diff to every other client connected to the same board. This is why the server has no shape-specific code: Yjs updates are opaque binary diffs.
- **Live cursors and "who's online"** use Yjs's separate `awareness` protocol, not the main document — cursor position changes constantly and should never be persisted, whereas the canvas content should be.
- Because Yjs is a CRDT, edits from multiple people merge automatically and safely regardless of the order they arrive in. There is no "last write wins" — that's the core guarantee this whole design exists to provide.

No accounts, no persistence to a database, and only one server instance exist yet — those arrive in later phases.

## What's coming

- **Phase 2** adds PostgreSQL (via Prisma) for users/boards/friends, and a role concept (`owner` / `collaborator` / `viewer`) that later phases build on.
- **Phase 6** turns this into a real horizontally-scaled deployment: multiple Node instances behind nginx, sharing state through Redis and Postgres instead of each instance's own memory.
