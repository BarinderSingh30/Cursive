# Architecture

This doc is updated as each phase in [`ROADMAP.md`](ROADMAP.md) lands. Right now it describes Phase 1 only.

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
- **Better Auth** handles login. It owns its own tables (`User`, `Session`, `Account`, `Verification`) inside the same Postgres database, reached through the same Prisma client as our own app tables. Email/password works out of the box; Google/GitHub sign-in is wired into the config but only activates once real OAuth credentials are set in `server/.env` — until then, `socialProviders` is built as an empty object, so nothing breaks by their absence.
- **`server/src/authorization/boardAccess.ts`** is the single place that answers "what role does this user have on this board." Everything else — Express routes (`requireBoardRole` middleware) and the Yjs sync connection — calls into this one function instead of re-deriving the answer.
- **The Yjs sync connection now requires proof of identity, and a WebSocket handshake can't carry a cookie the way a normal API call can (the session cookie is httpOnly, so client JS can't read and forward it, and relying on the browser to attach it automatically across dev ports is fragile).** The fix: the client calls `GET /api/boards/:boardId/sync-ticket` (a normal, cookie-authenticated REST call) right before connecting, which mints a short-lived signed JWT encoding `{userId, boardId, role}`. That ticket is passed to Hocuspocus as its connection token; Hocuspocus's `onAuthenticate` hook verifies the signature and board match, and — this is the actual enforcement point — sets `connection.readOnly = true` for anything below `collaborator`. This was verified with live connections, not just read as correct: a viewer's attempted edit never reached the server's stored document, confirmed both on another client's live connection and on a brand-new connection pulling fresh from the server.
- **Boards and friends are deliberately linked**: you can only add someone to a board if they're already an accepted friend. This gives the friends feature an actual purpose in Phase 2 rather than being a disconnected feature shipped for its own sake.

## What's coming

- **Phase 3** adds chat (DMs + group chats) over a second WebSocket path alongside Hocuspocus's own.
- **Phase 4** adds video calls via a self-hosted LiveKit server, with the same role concept gating who can publish camera/mic.
- **Phase 5** extends `boardAccess.ts` with a second branch: a signed, scoped, time-limited anonymous viewer token that needs no account and no database row.
- **Phase 6** turns this into a real horizontally-scaled deployment: multiple Node instances behind nginx, sharing state through Redis and Postgres instead of each instance's own memory.
