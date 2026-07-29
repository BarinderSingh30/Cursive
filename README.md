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

Brings up the client, two server instances, nginx, Redis, Postgres, and LiveKit together, with nginx load-balancing across both server instances. Open **http://localhost:8080** — nginx serves the client there too (not just the API/WebSocket routes), which is what lets the whole app work behind a single public URL below. (`localhost:8081` still reaches the client container directly, bypassing nginx, if you need that for debugging.)

Note: local dev and the Docker stack sign session cookies with different secrets but share the same cookie name on `localhost` — switching between the two without clearing cookies can cause silent auth failures.

### Sharing it over the internet (temporary, no domain needed)

To let people outside your machine log in, collaborate on a board, and video call, without buying a domain or renting a server — run the Docker stack on your own laptop and open a [Cloudflare Tunnel](https://github.com/cloudflare/cloudflared) to it. The tunnel gives you a free, random `https://*.trycloudflare.com` URL for as long as it stays running; it changes every time you restart it.

1. Copy `.env.example` to `.env` (gitignored — never committed) and fill in real random values for `BETTER_AUTH_SECRET` and `SYNC_TICKET_SECRET` (e.g. `openssl rand -base64 32`). The checked-in defaults in `docker-compose.yml` are dev placeholders, fine for `localhost`-only use, not for a session real people log into.
2. For video calls to work for a remote friend, sign up free at [cloud.livekit.io](https://cloud.livekit.io), create a project, and fill in `LIVEKIT_CLOUD_URL` / `LIVEKIT_CLOUD_API_KEY` / `LIVEKIT_CLOUD_API_SECRET` in `.env` from its Settings page — the self-hosted `livekit` container in this stack only advertises `127.0.0.1` as its media address, so it can't reach anyone off your laptop. LiveKit Cloud's hosted SFU has real TURN infrastructure and works over the open internet with no port-forwarding.
3. Build once and bring the stack up: `docker-compose build && docker-compose up -d`.
4. In a separate terminal, start the tunnel pointed at nginx's port: `cloudflared tunnel --url http://localhost:8080`. It prints a `https://*.trycloudflare.com` URL — that's the link to share.
5. Set `PUBLIC_URL` in `.env` to that URL, then apply it with `docker-compose up -d app1 app2` (only those two containers read it, as a runtime env var — no rebuild needed).

The client's build already bakes in *relative* URLs (`/sync`, `/api`, …) rather than an absolute `localhost` address, so it works unmodified regardless of what public URL reaches it — you never need to rebuild the client image just because the tunnel URL changed between sessions.

Known limits of this setup: the laptop has to stay on and awake with both `docker-compose` and `cloudflared` running; all data lives only in the laptop's local Postgres volume, with nothing backed up; and the public URL isn't stable across restarts unless you later set up a paid/named Cloudflare Tunnel with your own domain.

#### Stopping the session

- In the terminal running `cloudflared`, press **Ctrl+C**. That immediately kills the public URL — nobody can reach the app anymore, even if Docker is still running.
- Stop the Docker stack with `docker-compose stop`. This keeps the containers (and all data in the Postgres volume) around, just paused — faster to resume than tearing them down.

#### Starting it again later

The tunnel gives out a **new random URL every time**, so this is the same dance as the first setup, minus the build/signup steps:

1. `docker-compose start` (resumes the existing containers — no rebuild, no `--build` needed unless code changed since last time).
2. In a separate terminal: `cloudflared tunnel --url http://localhost:8080`, and copy the new `https://*.trycloudflare.com` URL it prints.
3. Update `PUBLIC_URL` in `.env` to that new URL, then `docker-compose up -d app1 app2` to apply it (just those two containers, no rebuild).
4. Open the new URL yourself to confirm it's working, then share it.

If you'd rather fully tear the stack down instead of just pausing it (e.g. to free up RAM for a while), `docker-compose down` also keeps the Postgres data volume by default — only `docker-compose down -v` deletes it, which would wipe every board/account/message created during the session. Avoid `-v` unless you actually mean to reset everything.
