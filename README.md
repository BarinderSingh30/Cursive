# Cursive

A real-time collaborative whiteboard — a stripped-down Figma/Excalidraw crossed with Discord and Twitch. Multiple people draw shapes and move things on the same canvas at once, see each other's live cursors and online status, with instant CRDT-based sync — no "last write wins" data loss. It grows from there into accounts, friends, chat, video calls, and a read-only broadcast mode for spectators.

## Vision

**Canvas & sync**
- Draw shapes, move things, see everyone's edits merge instantly with no data loss (CRDT-based, not last-write-wins)
- Live cursors and "who's online" presence for everyone in a board

**Accounts & social**
- Log in with email/password or Google/GitHub
- A dashboard of boards you own or collaborate on
- Add other users as friends

**Chat**
- Direct messages and group chats with friends

**Video calls**
- Turn on camera/mic while sketching together with your collaborators, live, on the same board

**Broadcast mode (the "Twitch" part)**
- Share a read-only link to a board — viewers (logged in or fully anonymous) can watch the canvas update live, watch the chat, and watch/listen to the collaborators' call
- Viewers can never edit the canvas or publish their own camera/mic, full stop — that boundary is enforced server-side, not just hidden in the UI. Chat is the one exception, and it mirrors Twitch exactly: a **logged-in** viewer can type in chat even though they can't touch the canvas, while a fully **anonymous** link viewer (no account) can only watch, on both the canvas and the chat.

**Built to actually scale, not just claim to**
- Runs as multiple identical Node instances behind an nginx load balancer, sharing state through Redis and Postgres instead of each instance's own memory — a deliberate portfolio goal, not a requirement of the app's actual current scale. This is fully built and running (`docker-compose up`), not just designed for.

## Status

This is being built in 9 phases, each a working product on its own. **Phase 8 (scale-out) is complete** — the only phase left is Phase 9 (advanced sketching tools). See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full checklist and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the system fits together as each phase lands.

## Tech stack

- **Frontend**: React + TypeScript + Vite, `react-konva` (Konva.js) for canvas rendering
- **Canvas sync**: Yjs (CRDT) via [Hocuspocus](https://tiptap.dev/hocuspocus) + `y-protocols/awareness` for live cursors/presence, with `@hocuspocus/extension-redis` relaying updates across server instances
- **Auth**: Better Auth (email/password) — already Postgres-backed via the Prisma adapter, so sessions work correctly across every server instance with no extra caching needed
- **Database**: PostgreSQL via Prisma
- **API**: Express + Zod
- **Chat + call signaling**: a custom WebSocket endpoint alongside Hocuspocus, with a Redis pub/sub backend for cross-instance delivery
- **Video/broadcast**: self-hosted LiveKit (SFU) — collaborators publish, viewers (including anonymous ones) subscribe read-only
- **Scaling**: two Node server instances behind nginx round-robin (no sticky sessions needed), Redis for cross-instance sync/chat/presence fan-out, Docker Compose for the whole stack (client, server ×2, nginx, Redis, Postgres, LiveKit)

## Project layout

This is an npm workspaces monorepo:

- `client/` — the React app
- `server/` — the Node.js backend (API, canvas sync, chat, auth)
- `shared/` — TypeScript types and Zod schemas used by both
- `docker/` — nginx config for the load-balanced Docker stack
- `docker-compose.yml` — the full stack (client, 2 server instances, nginx, Redis, Postgres, LiveKit)

## Getting started

### Local dev (single instance, fastest iteration)

```bash
npm install
npm run dev --workspace=server   # starts the backend
npm run dev --workspace=client   # starts the frontend, in another terminal
```

Requires Node.js 20+.

### Full stack via Docker (multi-instance, load-balanced)

```bash
docker-compose up --build
```

Brings up the client, two server instances, nginx, Redis, Postgres, and LiveKit together, with nginx load-balancing across both server instances. Open **http://localhost:8081** (the client) — API/WebSocket traffic is proxied through nginx at `localhost:8080`.

Note: local dev and the Docker stack sign session cookies with different secrets but share the same cookie name on `localhost` — switching between the two without clearing cookies can cause silent auth failures.
