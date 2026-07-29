# Architecture

This doc is updated as each phase in [`ROADMAP.md`](ROADMAP.md) lands. Phases 1, 2, and 8 are written up in full below; Phases 3-7 shipped but aren't backfilled here yet — see `ROADMAP.md` for what each of those actually built in the meantime.

## Phase 1: Canvas + sync

Two apps talk to each other over one thing: a Yjs CRDT document.

- **`client/`** renders the canvas with Konva and holds a local `Y.Doc`. When you draw or move a shape, the change is written to the local doc immediately (you see it instantly, no round trip), and Yjs computes a small diff that's sent to the server over WebSocket.
- **`server/`** runs [Hocuspocus](https://tiptap.dev/hocuspocus), a Node.js framework built specifically for hosting Yjs documents. It doesn't know what a "rectangle" is — it just relays the diff to every other client connected to the same board. This is why the server has no shape-specific code: Yjs updates are opaque binary diffs.
- **Live cursors and "who's online"** use Yjs's separate `awareness` protocol, not the main document — cursor position changes constantly and should never be persisted, whereas the canvas content should be.
- Because Yjs is a CRDT, edits from multiple people merge automatically and safely regardless of the order they arrive in. There is no "last write wins" — that's the core guarantee this whole design exists to provide.
- **A shape is stored as a nested `Y.Map` (one CRDT entry per field: `x`, `y`, `strokeColor`, etc.), not as one plain object.** This matters: if a shape were a single value, two people editing *different fields* of the same shape at the same instant would have one edit silently overwrite the other — the exact data loss this app exists to prevent, just at the field level instead of the document level. Storing each field as its own CRDT entry lets both edits survive and merge independently. This was caught by simulating concurrent clients (see the `multiplayer-sim-tester` subagent) rather than assumed — it looked correct in casual testing but only broke under genuinely concurrent field-level writes.

No accounts, no persistence to a database, and only one server instance exist yet — those arrive in later phases.

## Phase 2: Auth + friends + boards

- **PostgreSQL** (via Docker Compose) is now the source of truth for everything that isn't live canvas state: users, boards, board membership/roles, friendships. Prisma is the ORM/schema layer on top of it.
- **Better Auth** handles login. It owns its own tables (`User`, `Session`, `Account`, `Verification`) inside the same Postgres database, reached through the same Prisma client as our own app tables. Email/password only — Google/GitHub OAuth was tried and then deliberately removed, since a portfolio project doesn't need every real-product sign-in option.
- **`server/src/authorization/boardAccess.ts`** is the single place that answers "what role does this user have on this board." Everything else — Express routes (`requireBoardRole` middleware) and the Yjs sync connection — calls into this one function instead of re-deriving the answer.
- **The Yjs sync connection now requires proof of identity, and a WebSocket handshake can't carry a cookie the way a normal API call can (the session cookie is httpOnly, so client JS can't read and forward it, and relying on the browser to attach it automatically across dev ports is fragile).** The fix: the client calls `GET /api/boards/:boardId/sync-ticket` (a normal, cookie-authenticated REST call) right before connecting, which mints a short-lived signed JWT encoding `{userId, boardId, role}`. That ticket is passed to Hocuspocus as its connection token; Hocuspocus's `onAuthenticate` hook verifies the signature and board match, and — this is the actual enforcement point — sets `connection.readOnly = true` for anything below `collaborator`. This was verified with live connections, not just read as correct: a viewer's attempted edit never reached the server's stored document, confirmed both on another client's live connection and on a brand-new connection pulling fresh from the server.
- **Boards and friends are deliberately linked**: you can only add someone to a board if they're already an accepted friend. This gives the friends feature an actual purpose in Phase 2 rather than being a disconnected feature shipped for its own sake.

## Phases 3-7

Chat + video calls + anonymous viewer links + public board discovery (Home page) + the "Pale Cork" UI overhaul all shipped between Phase 2 and Phase 8 — see `ROADMAP.md` for what each one built. Not backfilled into this doc yet; Phase 8 (below) is written up because it's the one that changes the *architecture* diagram (single instance → many), not just app-level functionality.

## Phase 8: Scale-out

- Three pieces of state that previously lived only in one server process's memory now live in **Redis**, shared across every instance:
  - **Yjs sync** — `@hocuspocus/extension-redis`, added alongside the existing Postgres persistence extension in `server/src/collab/hocuspocus.ts`. It uses Redis pub/sub to relay document updates and awareness between instances, so a client connected to one instance and a client connected to another stay in sync.
  - **Chat delivery** — `server/src/chat/pubsub.ts`'s in-process pub/sub (deliberately built swappable in Phase 3) is replaced by a Redis-backed implementation behind the same interface, used by both the DM/group chat gateway and the board-chat gateway.
  - **Live viewer counts** — previously read Hocuspocus's local in-memory connection list, which only ever reflected whichever single instance answered a given Home-page request. Now backed by a Redis sorted set per board (`server/src/collab/viewerPresence.ts`), with a heartbeat that refreshes each active connection's entry and a stale-entry prune on every read — so a crashed instance's connections age out on their own, with no explicit cleanup code.
- Better Auth's sessions did **not** need a Redis-backed cache: they're already persisted in Postgres via the Prisma adapter, so a session created against one instance was already readable by another.
- The whole stack — client, two server instances (`app1`/`app2`), nginx, Redis, Postgres, and LiveKit — now runs via `docker-compose up`, with nginx (`docker/nginx/nginx.conf`) load-balancing the two server instances with plain round-robin and no sticky sessions, safe specifically because the Redis-backed state above no longer makes it matter which instance a connection lands on.

## What's coming

- **Phase 9** (the only phase left) brings the canvas itself much closer to a real creative tool: brushes/strokes, layers, and richer object styling.
