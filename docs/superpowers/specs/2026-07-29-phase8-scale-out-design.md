# Phase 8 — Scale-out — Design

## Context

Every phase through Phase 7 assumes a single Node server instance. Three pieces of state currently live only in that one process's memory:

- **Hocuspocus's Yjs documents** (`server/src/collab/hocuspocus.ts`) — the live CRDT state for each board's canvas.
- **Chat delivery** (`server/src/chat/pubsub.ts`) — an in-process pub/sub that `chat/wsGateway.ts` and `boardChat/wsGateway.ts` both use exclusively, deliberately built as a swappable interface in Phase 3 anticipating this phase.
- **Live viewer counts** (`getLiveViewerCount()` in `hocuspocus.ts`, consumed by `server/src/home/listPublicBoards.ts`) — reads Hocuspocus's local `documents` map directly.

None of these survive a second instance: two clients on different instances wouldn't see each other's edits, wouldn't receive each other's chat messages, and the Home page's live-viewer badge would only reflect whichever instance answered that particular request.

Better Auth sessions are the one piece of "shared state" that's *already* correct across instances — they're persisted in Postgres via the Prisma adapter (`server/src/auth/betterAuth.ts`), not held in server memory. This phase confirmed that and deliberately does **not** add a Redis session cache — see Non-goals.

Phase 8 makes all three memory-bound pieces Redis-backed, then proves it by actually running 2+ instances behind an nginx load balancer with Docker Compose, per the roadmap goal: "demonstrate two clients on different instances staying in sync," plus making Phase 6's live viewer counts correct across instances (not just on whichever instance answers a request).

## Scope decisions (from brainstorming Q&A)

- **Containerization**: full — client, both server instances, nginx, Redis, Postgres, and LiveKit all run via `docker-compose up`. Not a partial "infra only" setup.
- **Sessions**: no Redis involvement. Postgres-backed sessions (already true today) are relied on for correctness; adding a Redis secondary-storage cache is out of scope for this phase.
- **Live viewer counts**: Redis-backed presence, realized as a **sorted set** per board (not a plain set) — see Backend section for why.

## Architecture overview

Three independent Redis responsibilities, each swapping into an existing seam:

1. **Yjs cross-instance sync** — `@hocuspocus/extension-redis` (official Hocuspocus package), added to the extensions list in `server/src/collab/hocuspocus.ts` alongside the existing `persistenceExtensions` (Postgres). It uses Redis pub/sub to rebroadcast document updates and awareness between instances so a client on instance A and a client on instance B stay in sync. Confirmed against current Hocuspocus docs: `new Redis({ host, port })` or `new Redis({ redis: existingIoredisInstance })`.
2. **Chat pub/sub** — a Redis-backed implementation of the same `subscribe`/`publish` interface `InProcessPubSub` already exposes in `chat/pubsub.ts`, using `ioredis`'s pub/sub client. Because both chat gateways already go through `chatPubSub` exclusively, this is a one-file swap with no call-site changes.
3. **Live viewer counts** — new design, not a swap. `getLiveViewerCount()` currently reads Hocuspocus's local `documents` map. Replaced with a Redis sorted set per board (`board:{boardId}:viewers`, member = connection id, score = last-heartbeat unix timestamp). A plain Redis set can't expire individual members (only the whole key), so a sorted set — pruned by timestamp on every read via `ZREMRANGEBYSCORE` before `ZCARD` — is what gives self-healing behavior if an instance crashes mid-connection, with no explicit cleanup code needed.

## Backend

**`server/src/redis/client.ts`** (new) — a single shared `ioredis` client instance, constructed from the new `REDIS_URL` env var. Exported for reuse by the Hocuspocus Redis extension, the chat pub/sub swap, and the viewer-presence module (ioredis pub/sub connections are a separate concern from regular command connections — the pub/sub swap will need its own subscriber client per ioredis's constraints, but the base connection config is shared).

**`server/src/collab/hocuspocus.ts`**:
- Add `new Redis({ redis: sharedIoredisClient })` (aliased import to avoid the name collision with `ioredis`'s own `Redis` class) to the extensions array.
- `connected` hook: in addition to the existing `recordBoardView` call, `ZADD board:{documentName}:viewers {now} {connectionId}` (skip if `context.role === 'owner'`, matching the existing exclusion). Needs a per-connection id — generate one (`randomUUID()`) at `onAuthenticate` time and thread it through `context`, since Hocuspocus doesn't hand out its own connection id in these hooks.
- A periodic heartbeat (every ~15s, per open connection) re-issues the same `ZADD` to refresh the score — this is what lets a stale/crashed connection's entry age out without an explicit disconnect ever firing.
- `onDisconnect` hook (new — not currently used in this file): `ZREM board:{documentName}:viewers {connectionId}` for a clean removal on graceful disconnect, same result as the heartbeat expiry but immediate.
- `getLiveViewerCount()` becomes async: `ZREMRANGEBYSCORE board:{boardId}:viewers -inf {now - staleThreshold}` then `ZCARD board:{boardId}:viewers`. Callers (`listPublicBoards.ts`) already `await` other I/O, so this is a signature change, not a new pattern.

**`server/src/chat/pubsub.ts`**: add a Redis-backed implementation behind the existing `subscribe`/`publish` shape, selected via `REDIS_URL` presence (or an explicit flag) so tests can keep using the in-process version without a live Redis dependency. Existing `pubsub.test.ts` conventions (see Testing) stay valid against the in-process implementation; a new test file covers the Redis-backed one against a real Redis instance.

**`server/src/env.ts`**: add `REDIS_URL: z.string()` (required, no default — every environment from local dev onward needs Redis now that Hocuspocus sync depends on it) and `INSTANCE_NAME: z.string().default(() => hostname())` (log-line identification only, used to make the cross-instance demo visibly show which instance handled which update).

## Containerization

**`server/Dockerfile`** (new) — multi-stage, build context is the **repo root** (not `server/`), since this is an npm-workspaces monorepo and `shared`'s raw TypeScript plus both lockfiles need to be present for `npm ci` to resolve the workspace link correctly (same linkage the original scaffold plan's verification step checked). Stages: install → `npx prisma generate` → `tsc` build → slim runtime image. Container start command runs `npx prisma migrate deploy` before starting the server, so `docker-compose up` alone produces a correct schema.

**`client/Dockerfile`** (new) — multi-stage: `npm run build` (Vite) in a Node stage, then copy the static output into an `nginx:alpine` stage that only serves files. This container is not the load balancer — it's a separate, simpler static file server.

**`docker/nginx/nginx.conf`** (new) — the load balancer, dedicated to the two server instances. Proxies `/sync`, `/chat`, `/board-chat`, and `/api` to an `upstream` block listing `app1:4000` and `app2:4000`, with `Upgrade`/`Connection` headers passed through for the WebSocket paths. Default round-robin, no sticky sessions — safe now that Hocuspocus state is Redis-shared, which is exactly the "no sticky sessions needed" property the original scaffold plan flagged as a risk if any one of the three Redis pieces were skipped.

**`docker-compose.yml`** grows from `postgres` + `livekit` to add `redis`, `nginx`, `app1`, `app2`, `client`:
- `app1`/`app2`: same image, distinguished only by `INSTANCE_NAME` env var (for the demo's log output). Both share one `DATABASE_URL`, one `REDIS_URL` (`redis://redis:6379`), one `LIVEKIT_URL` — now `ws://livekit:7880`, a Docker service name instead of `localhost`. This is the env-var-not-hardcoded payoff called out as a risk in the original scaffold plan: switching from local dev to Docker networking is a `.env` change, not a code change.
- `redis`: `redis:7-alpine`, no persistence config needed (everything stored in it is ephemeral/reconstructable).
- `client`: exposed on its own host port; talks to the API through nginx's exposed port. This stays cross-origin, consistent with the cross-origin setup that already exists in dev today (Better Auth's `trustedOrigins`/CORS already handle client-on-5173, server-on-4000 as separate origins) — Phase 8 doesn't change that pattern, just changes which host/port the origins are.

## Non-goals (explicitly out of scope for this phase)

- A Redis-backed session cache for Better Auth (`secondaryStorage`). Sessions are already correctly shared via Postgres; adding a cache is a performance optimization with no correctness payoff at this project's scale, and it's not worth the added surface area for a portfolio demo.
- Any change to LiveKit's own scaling story — it already runs as a single self-hosted SFU and stays that way; Phase 8 only changes how it's *addressed* (Docker service name instead of `localhost`), not how it scales.
- Sticky sessions / session affinity at the nginx layer — deliberately avoided, not deferred; Redis-backed Hocuspocus state is what makes this unnecessary.
- Production-grade Redis durability/HA (replication, persistence tuning, Sentinel) — this is a portfolio scale-out demo, not a production deployment.

## Testing

Following this repo's existing Vitest conventions:
- `server/src/chat/pubsub.redis.test.ts` (new) — the Redis-backed pub/sub implementation, against a real local Redis instance, mirroring the assertions already in `pubsub.test.ts` for the in-process version.
- `server/src/collab/hocuspocus.test.ts` — extend for the sorted-set viewer-count logic: heartbeat refresh, `onDisconnect` removal, and stale-entry pruning on read (simulate an old score and confirm `getLiveViewerCount` excludes it).
- Existing `home` tests (`listPublicBoards.test.ts`) updated for `getLiveViewerCount` becoming async.

Complementary, mirroring how every prior phase's concurrency claims were verified rather than assumed:
- **`multiplayer-sim-tester` subagent** — two simulated clients connected directly to `app1`'s and `app2`'s `/sync` ports (bypassing nginx so which instance each one hits is deterministic), editing different fields of the same shape concurrently, confirming both edits converge on both connections. Same pattern for two chat clients split across instances exchanging a DM, and two watch-page viewer connections split across instances producing a correct combined live-viewer count regardless of which instance answers the Home page's request.
- **Manual browser walkthrough** through nginx's exposed port: draw on a board across multiple tabs, confirm (via `INSTANCE_NAME` log lines) that nginx is actually distributing connections across both instances and sync still works end-to-end through the load balancer, not just directly against one instance.

Only tick Phase 8's roadmap checkbox after these pass — not because the files exist, per this project's stated convention (see `/phase-check`).

## Known documentation drift found during this design

`docs/ARCHITECTURE.md`'s "What's coming" section still refers to this phase as "Phase 6" (the original 6-phase numbering, before Phases 6/7 were inserted and the old Phase 6 became Phase 8). Needs updating alongside this phase's implementation, not left stale.
