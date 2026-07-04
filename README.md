# Cursive

A real-time collaborative whiteboard — a stripped-down Figma/Excalidraw: multiple people draw shapes and move things on the same canvas at once, see each other's live cursors and online status, with instant CRDT-based sync — no "last write wins" data loss.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it's built and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased build plan this repo follows.

## Tech stack

- **Frontend**: React + TypeScript + Vite, `react-konva` (Konva.js) for canvas rendering
- **Canvas sync**: Yjs (CRDT) via [Hocuspocus](https://tiptap.dev/hocuspocus) + `y-protocols/awareness` for live cursors/presence
- **Auth**: Better Auth (email/password + Google/GitHub OAuth)
- **Database**: PostgreSQL via Prisma
- **API**: Express + Zod
- **Chat + call signaling**: a custom WebSocket endpoint alongside Hocuspocus
- **Video/broadcast**: self-hosted LiveKit (SFU)
- **Scaling**: Redis, nginx load balancing, Docker Compose

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
