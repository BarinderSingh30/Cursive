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
- Viewers can only ever read — they can't edit the canvas, send chat messages, or publish their own camera/mic. That boundary is enforced server-side, not just hidden in the UI.

**Built to actually scale, not just claim to**
- Runs as multiple identical Node instances behind an nginx load balancer, sharing state through Redis and Postgres instead of each instance's own memory — a deliberate portfolio goal, not a requirement of the app's actual current scale

## Status

This is being built in 6 phases, each a working product on its own. **Currently on Phase 1** (canvas + sync — no accounts yet). See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full checklist and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the system fits together as each phase lands.

## Tech stack

- **Frontend**: React + TypeScript + Vite, `react-konva` (Konva.js) for canvas rendering
- **Canvas sync**: Yjs (CRDT) via [Hocuspocus](https://tiptap.dev/hocuspocus) + `y-protocols/awareness` for live cursors/presence
- **Auth**: Better Auth (email/password + Google/GitHub OAuth)
- **Database**: PostgreSQL via Prisma
- **API**: Express + Zod
- **Chat + call signaling**: a custom WebSocket endpoint alongside Hocuspocus
- **Video/broadcast**: self-hosted LiveKit (SFU) — collaborators publish, viewers (including anonymous ones) subscribe read-only
- **Scaling**: Redis (shared sessions + cross-instance sync/chat fan-out), nginx load balancing, Docker Compose

## Project layout

This is an npm workspaces monorepo:

- `client/` — the React app
- `server/` — the Node.js backend (API, canvas sync, chat, auth)
- `shared/` — TypeScript types and Zod schemas used by both

## Getting started

```bash
npm install
npm run dev --workspace=server   # starts the backend
npm run dev --workspace=client   # starts the frontend, in another terminal
```

Requires Node.js 20+.
