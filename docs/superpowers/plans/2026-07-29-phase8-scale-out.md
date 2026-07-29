# Phase 8 — Scale-out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hocuspocus sync, chat delivery, and live-viewer counts correct across multiple Node server instances via Redis, then prove it by running 2+ containerized instances behind an nginx load balancer via Docker Compose.

**Architecture:** Three Redis-backed swaps into existing seams (`@hocuspocus/extension-redis` for Yjs sync, a Redis pub/sub implementation behind `chat/pubsub.ts`'s existing interface, a new Redis sorted-set presence module replacing the in-memory live-viewer-count read) plus full containerization (`server/Dockerfile`, `client/Dockerfile`, `docker/nginx/nginx.conf`, an expanded `docker-compose.yml`).

**Tech Stack:** `ioredis`, `@hocuspocus/extension-redis`, `redis:7-alpine`, `nginx:alpine`, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-07-29-phase8-scale-out-design.md`

## Global Constraints

- Sessions stay Postgres-only — no Redis session cache is built in this phase (spec Non-goals).
- `REDIS_URL` is a required env var (no default) from this phase forward, matching how `DATABASE_URL` is already required.
- No sticky sessions in nginx — round-robin is correct once Hocuspocus state is Redis-shared; do not add session affinity.
- Tests in this repo run against real local infra, not mocks (existing Postgres-backed tests are the precedent) — Redis-touching tests require a real local Redis running, same precondition Postgres tests already have.
- Per this project's git convention, git commands are normally the user's to run — but for this phase specifically, the user has asked to run `git add`/`git commit` directly after each task's review passes, to keep the subagent-driven-development loop moving (the same scoped carve-out granted during Phase 6). Branch creation, merges, pushes, and any other git/infra operations still stay the user's.
- Docker Compose dev-only secrets are committed directly in `docker-compose.yml` (already the existing pattern for `POSTGRES_PASSWORD`, `LIVEKIT_API_KEY`/`SECRET`) — do not introduce a new `.env`-substitution pattern for this file.

---

### Task 1: Redis foundation — shared client, env vars, docker-compose service

**Files:**
- Modify: `server/package.json` — add `ioredis`, `@hocuspocus/extension-redis` dependencies
- Modify: `server/src/env.ts` — add `REDIS_URL`, `INSTANCE_NAME`
- Modify: `server/.env.example` — document the new vars
- Modify: `server/.env` — add `REDIS_URL=redis://localhost:6379` (local, gitignored, not committed)
- Create: `server/src/redis/client.ts`
- Test: `server/src/redis/client.test.ts`
- Modify: `docker-compose.yml` — add `redis` service

**Interfaces:**
- Produces: `redis` (default `ioredis` instance, from `server/src/redis/client.ts`) — consumed by Tasks 2, 3, 4.
- Produces: `env.REDIS_URL: string`, `env.INSTANCE_NAME: string` — consumed by Tasks 3, 5, 7.

- [ ] **Step 1: Add Redis dependencies**

Edit `server/package.json`, adding to `"dependencies"` (alphabetical, matching existing order):

```json
    "@hocuspocus/extension-redis": "^2.15.3",
```
(insert right after `"@hocuspocus/extension-database": "^2.15.3",`)

```json
    "ioredis": "^5.4.1",
```
(insert after `"express": "^4.21.0",`, before `"jsonwebtoken"`)

- [ ] **Step 2: Install**

Run: `npm install` (from repo root)
Expected: lockfile updates, no errors.

- [ ] **Step 3: Add the `redis` service to docker-compose.yml**

Add this service to `docker-compose.yml`, after `postgres` and before `livekit`:

```yaml
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
```

- [ ] **Step 4: Start it locally**

Run: `docker-compose up -d redis`
Expected: container starts and reports healthy (`docker-compose ps` shows `redis` as `healthy`).

- [ ] **Step 5: Add env vars**

Edit `server/src/env.ts`:

```ts
import "dotenv/config";
import { hostname } from "node:os";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string(),
  CLIENT_URL: z.string().default("http://localhost:5173"),
  BETTER_AUTH_URL: z.string().default("http://localhost:4000"),
  BETTER_AUTH_SECRET: z.string(),
  SYNC_TICKET_SECRET: z.string(),
  LIVEKIT_URL: z.string(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
  REDIS_URL: z.string(),
  INSTANCE_NAME: z.string().default(hostname()),
});

export const env = envSchema.parse(process.env);
```

- [ ] **Step 6: Document the new vars in `.env.example`**

Append to `server/.env.example`:

```
# Redis (matches docker-compose.yml's redis service) — backs cross-instance
# Yjs sync, chat delivery, and live viewer presence (Phase 8)
REDIS_URL=redis://localhost:6379

# Optional: labels this process in log lines, useful when running multiple
# server instances side by side (e.g. app1/app2 in docker-compose)
INSTANCE_NAME=local
```

- [ ] **Step 7: Add `REDIS_URL` to the local `server/.env`**

Append `REDIS_URL=redis://localhost:6379` as a new line to `server/.env` (this file is gitignored — it's the developer's real local config, not committed).

- [ ] **Step 8: Create the shared Redis client**

Create `server/src/redis/client.ts`:

```ts
import Redis from "ioredis";
import { env } from "../env.js";

/**
 * One shared connection for regular Redis commands (viewer presence, and
 * the publish side of chat pub/sub). A dedicated subscriber connection is
 * created separately wherever Redis's blocking SUBSCRIBE mode is needed —
 * ioredis requires a connection used for subscribing to stop accepting
 * regular commands, so it can't share this one.
 */
export const redis = new Redis(env.REDIS_URL);
```

- [ ] **Step 9: Write the connectivity test**

Create `server/src/redis/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redis } from "./client.js";

describe("redis client", () => {
  it("connects to the configured Redis instance", async () => {
    const pong = await redis.ping();
    expect(pong).toBe("PONG");
  });
});
```

- [ ] **Step 10: Run it**

Run: `npm run test --workspace=server -- client.test.ts`
Expected: PASS (requires `redis` container running from Step 4).

- [ ] **Step 11: Commit**

Run:

```bash
git add server/package.json package-lock.json server/src/env.ts server/.env.example server/src/redis/client.ts server/src/redis/client.test.ts docker-compose.yml
git commit -m "Add shared Redis client, env vars, and docker-compose redis service"
```

---

### Task 2: Chat pub/sub — Redis-backed implementation

**Files:**
- Modify: `server/src/chat/pubsub.ts` — add `RedisPubSub`, export both classes, select the live singleton by environment
- Test: `server/src/chat/pubsub.redis.test.ts`

**Interfaces:**
- Consumes: `redis` from `server/src/redis/client.ts` (Task 1).
- Produces: `chatPubSub` keeps its existing shape (`subscribe(channel, handler): Unsubscribe`, `publish(channel, payload): void`) — no change for `chat/wsGateway.ts` or `boardChat/wsGateway.ts`, which already only touch `chatPubSub`.

- [ ] **Step 1: Write the failing test for the Redis-backed class**

Create `server/src/chat/pubsub.redis.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { RedisPubSub } from "./pubsub.js";

describe("RedisPubSub", () => {
  it("delivers a published payload to a subscribed handler", async () => {
    const pubsub = new RedisPubSub();
    const handler = vi.fn();
    const unsubscribe = pubsub.subscribe("redis-test-channel-1", handler);
    // Redis SUBSCRIBE is async — give it a moment to register before publishing.
    await new Promise((resolve) => setTimeout(resolve, 50));

    pubsub.publish("redis-test-channel-1", { hello: "world" });

    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith({ hello: "world" }));
    unsubscribe();
  });

  it("stops delivering after unsubscribe", async () => {
    const pubsub = new RedisPubSub();
    const handler = vi.fn();
    const unsubscribe = pubsub.subscribe("redis-test-channel-2", handler);
    await new Promise((resolve) => setTimeout(resolve, 50));
    unsubscribe();

    pubsub.publish("redis-test-channel-2", { hello: "world" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not deliver to a different channel", async () => {
    const pubsub = new RedisPubSub();
    const handler = vi.fn();
    pubsub.subscribe("redis-test-channel-3", handler);
    await new Promise((resolve) => setTimeout(resolve, 50));

    pubsub.publish("redis-test-channel-other", { hello: "world" });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=server -- pubsub.redis.test.ts`
Expected: FAIL — `RedisPubSub` is not exported from `./pubsub.js`.

- [ ] **Step 3: Implement `RedisPubSub` and the selection logic**

Replace the full contents of `server/src/chat/pubsub.ts`:

```ts
import { redis } from "../redis/client.js";

/**
 * Every handler subscribed to a channel gets every event published to it.
 * Two implementations share this interface: `InProcessPubSub` (used under
 * `vitest`, where NODE_ENV is "test" — fast, no real Redis round trip needed
 * for tests that don't specifically target the Redis-backed class) and
 * `RedisPubSub` (used everywhere else, including local dev and every
 * containerized instance) — this is the seam Phase 8 uses to make chat
 * delivery work once there's more than one Node instance, without either
 * `chat/wsGateway.ts` or `boardChat/wsGateway.ts` having to change.
 */
export type Unsubscribe = () => void;

export interface PubSub {
  subscribe(channel: string, handler: (payload: unknown) => void): Unsubscribe;
  publish(channel: string, payload: unknown): void;
}

export class InProcessPubSub implements PubSub {
  private channels = new Map<string, Set<(payload: unknown) => void>>();

  subscribe(channel: string, handler: (payload: unknown) => void): Unsubscribe {
    const handlers = this.channels.get(channel) ?? new Set();
    handlers.add(handler);
    this.channels.set(channel, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) this.channels.delete(channel);
    };
  }

  publish(channel: string, payload: unknown): void {
    this.channels.get(channel)?.forEach((handler) => handler(payload));
  }
}

/**
 * Redis pub/sub needs a connection dedicated to subscribing — once a
 * connection issues SUBSCRIBE, ioredis (like Redis itself) won't let it run
 * regular commands, so it can't share the `redis` client used for PUBLISH.
 * `redis.duplicate()` clones the same connection options onto a fresh
 * connection for that purpose.
 */
export class RedisPubSub implements PubSub {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private subscriber = redis.duplicate();

  constructor() {
    this.subscriber.on("message", (channel: string, raw: string) => {
      const payload = JSON.parse(raw) as unknown;
      this.handlers.get(channel)?.forEach((handler) => handler(payload));
    });
  }

  subscribe(channel: string, handler: (payload: unknown) => void): Unsubscribe {
    const existing = this.handlers.get(channel);
    if (existing) {
      existing.add(handler);
    } else {
      this.handlers.set(channel, new Set([handler]));
      void this.subscriber.subscribe(channel);
    }
    return () => {
      const handlers = this.handlers.get(channel);
      if (!handlers) return;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(channel);
        void this.subscriber.unsubscribe(channel);
      }
    };
  }

  publish(channel: string, payload: unknown): void {
    void redis.publish(channel, JSON.stringify(payload));
  }
}

export const chatPubSub: PubSub = process.env.NODE_ENV === "test" ? new InProcessPubSub() : new RedisPubSub();
```

- [ ] **Step 4: Run the new test**

Run: `npm run test --workspace=server -- pubsub.redis.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing pubsub test to confirm it's unaffected**

Run: `npm run test --workspace=server -- pubsub.test.ts`
Expected: PASS — this file exercises `chatPubSub`, which resolves to `InProcessPubSub` under `vitest`'s `NODE_ENV=test`, so its synchronous assertions are unchanged.

- [ ] **Step 6: Run the full server test suite**

Run: `npm run test --workspace=server`
Expected: PASS — confirms `chat/wsGateway.test.ts` and `boardChat/wsGateway.test.ts` (which exercise `chatPubSub` indirectly) still pass unchanged.

- [ ] **Step 7: Commit**

Run:

```bash
git add server/src/chat/pubsub.ts server/src/chat/pubsub.redis.test.ts
git commit -m "Add Redis-backed chat pub/sub implementation"
```

---

### Task 3: Hocuspocus Redis extension — cross-instance Yjs sync

**Files:**
- Modify: `server/src/collab/hocuspocus.ts` — add the Redis extension
- Test: `server/src/collab/hocuspocus.test.ts`

**Interfaces:**
- Consumes: `redis` from `server/src/redis/client.ts` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `server/src/collab/hocuspocus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Redis as HocuspocusRedis } from "@hocuspocus/extension-redis";
import { hocuspocus } from "./hocuspocus.js";

describe("hocuspocus Redis extension", () => {
  it("registers the Redis extension for cross-instance sync", () => {
    const hasRedisExtension = hocuspocus.configuration.extensions.some(
      (extension) => extension instanceof HocuspocusRedis,
    );
    expect(hasRedisExtension).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=server -- hocuspocus.test.ts`
Expected: FAIL — the extension isn't registered yet.

- [ ] **Step 3: Add the extension**

In `server/src/collab/hocuspocus.ts`, add the import alongside the existing ones:

```ts
import { Redis as HocuspocusRedis } from "@hocuspocus/extension-redis";
import { redis } from "../redis/client.js";
```

Change the `extensions` line inside `Server.configure({ ... })`:

```ts
  extensions: [...persistenceExtensions, new HocuspocusRedis({ redis })],
```

(This replaces the current `extensions: persistenceExtensions,` line.)

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm run test --workspace=server -- hocuspocus.test.ts`
Expected: PASS.

Note: this test only confirms the extension is *registered* — actual cross-instance relay behavior needs two real Hocuspocus server processes talking through Redis, which is proven in Task 9 via the `multiplayer-sim-tester` subagent, not a unit test here.

- [ ] **Step 5: Commit**

Run:

```bash
git add server/src/collab/hocuspocus.ts server/src/collab/hocuspocus.test.ts
git commit -m "Wire Hocuspocus's Redis extension for cross-instance Yjs sync"
```

---

### Task 4: Live viewer presence — Redis sorted set

**Files:**
- Create: `server/src/collab/viewerPresence.ts`
- Test: `server/src/collab/viewerPresence.test.ts`
- Modify: `server/src/collab/hocuspocus.ts` — thread a per-connection id through context, call presence functions on connect/disconnect, replace `getLiveViewerCount`'s implementation
- Modify: `server/src/home/listPublicBoards.ts` — `getLiveViewerCount` is now async

**Interfaces:**
- Consumes: `redis` from `server/src/redis/client.ts` (Task 1).
- Produces: `markViewerActive(boardId: string, connectionId: string): Promise<void>`, `markViewerGone(boardId: string, connectionId: string): Promise<void>`, `countActiveViewers(boardId: string): Promise<number>`, `startHeartbeat(boardId: string, connectionId: string): NodeJS.Timeout`, `stopHeartbeat(timer: NodeJS.Timeout): void` — all consumed by `hocuspocus.ts` in this task.
- Produces (changed): `getLiveViewerCount(boardId: string): Promise<number>` (was synchronous) — consumed by `server/src/home/listPublicBoards.ts`.

- [ ] **Step 1: Write the failing tests for the presence module**

Create `server/src/collab/viewerPresence.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { redis } from "../redis/client.js";
import { markViewerActive, markViewerGone, countActiveViewers } from "./viewerPresence.js";

const boardId = "viewer-presence-test-board";

afterEach(async () => {
  await redis.del(`board:${boardId}:viewers`);
});

describe("viewer presence", () => {
  it("counts an active viewer", async () => {
    await markViewerActive(boardId, "conn-1");
    expect(await countActiveViewers(boardId)).toBe(1);
  });

  it("removes a viewer on disconnect", async () => {
    await markViewerActive(boardId, "conn-1");
    await markViewerGone(boardId, "conn-1");
    expect(await countActiveViewers(boardId)).toBe(0);
  });

  it("counts multiple distinct viewers once each", async () => {
    await markViewerActive(boardId, "conn-1");
    await markViewerActive(boardId, "conn-2");
    expect(await countActiveViewers(boardId)).toBe(2);
  });

  it("excludes entries older than the freshness window, without needing a disconnect", async () => {
    const staleTimestamp = Date.now() / 1000 - 999;
    await redis.zadd(`board:${boardId}:viewers`, staleTimestamp, "conn-stale");
    await markViewerActive(boardId, "conn-fresh");

    expect(await countActiveViewers(boardId)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run test --workspace=server -- viewerPresence.test.ts`
Expected: FAIL — `./viewerPresence.js` doesn't exist yet.

- [ ] **Step 3: Implement the presence module**

Create `server/src/collab/viewerPresence.ts`:

```ts
import { redis } from "../redis/client.js";

/**
 * Tracks who's actively watching a board, shared across every server
 * instance via a Redis sorted set (member = connection id, score = last
 * heartbeat, as a unix timestamp in seconds). A plain Redis set can't expire
 * individual members — only the whole key — so a crashed instance's
 * connections would never disappear. A sorted set pruned by timestamp on
 * every read is what makes a crash self-healing: no explicit cleanup code
 * has to run, a stale entry just ages out next time anyone counts.
 */
const STALE_AFTER_SECONDS = 30;
const HEARTBEAT_INTERVAL_MS = 15_000;

function presenceKey(boardId: string): string {
  return `board:${boardId}:viewers`;
}

export async function markViewerActive(boardId: string, connectionId: string): Promise<void> {
  await redis.zadd(presenceKey(boardId), Date.now() / 1000, connectionId);
}

export async function markViewerGone(boardId: string, connectionId: string): Promise<void> {
  await redis.zrem(presenceKey(boardId), connectionId);
}

export async function countActiveViewers(boardId: string): Promise<number> {
  const staleBefore = Date.now() / 1000 - STALE_AFTER_SECONDS;
  await redis.zremrangebyscore(presenceKey(boardId), "-inf", staleBefore);
  return redis.zcard(presenceKey(boardId));
}

/** Refreshes this connection's score every HEARTBEAT_INTERVAL_MS so it stays
 * ahead of STALE_AFTER_SECONDS as long as the connection is actually open. */
export function startHeartbeat(boardId: string, connectionId: string): NodeJS.Timeout {
  return setInterval(() => {
    markViewerActive(boardId, connectionId).catch((error) => {
      console.error(`Failed to refresh viewer presence for board ${boardId}:`, error);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm run test --workspace=server -- viewerPresence.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire presence into the Hocuspocus lifecycle**

In `server/src/collab/hocuspocus.ts`, add these imports:

```ts
import { randomUUID } from "node:crypto";
import type { BoardRole } from "@cursive/shared";
import { markViewerActive, markViewerGone, countActiveViewers, startHeartbeat, stopHeartbeat } from "./viewerPresence.js";
```

Add a context type and a local heartbeat-timer registry above the `Server.configure` call:

```ts
interface SyncContext {
  userId: string;
  role: BoardRole;
  connectionId: string;
}

// Heartbeat timers are per-instance, in-memory state (a setInterval handle
// isn't something to share across instances) — only the presence data they
// write to Redis needs to be shared.
const heartbeatTimers = new Map<string, NodeJS.Timeout>();
```

Change `Server.configure({` to `Server.configure<SyncContext>({`.

In `onAuthenticate`, change the final `return` statement to include a connection id:

```ts
    return { userId: payload.userId, role: payload.role, connectionId: randomUUID() };
```

Replace the `connected` hook body to also mark presence and start the heartbeat:

```ts
  connected: async ({ context, documentName }) => {
    try {
      await recordBoardView(documentName, context.role);
    } catch (error) {
      console.error(`Failed to record board view for ${documentName}:`, error);
    }

    if (context.role !== "owner") {
      await markViewerActive(documentName, context.connectionId).catch((error) => {
        console.error(`Failed to record viewer presence for ${documentName}:`, error);
      });
      heartbeatTimers.set(context.connectionId, startHeartbeat(documentName, context.connectionId));
    }
  },
  onDisconnect: async ({ context, documentName }) => {
    const timer = heartbeatTimers.get(context.connectionId);
    if (timer) {
      stopHeartbeat(timer);
      heartbeatTimers.delete(context.connectionId);
    }

    if (context.role !== "owner") {
      await markViewerGone(documentName, context.connectionId).catch((error) => {
        console.error(`Failed to clear viewer presence for ${documentName}:`, error);
      });
    }
  },
```

Replace the `getLiveViewerCount` function at the bottom of the file:

```ts
/**
 * Live viewer count for the Home page: every board's currently-active
 * (non-owner) connections, tracked in Redis so the count is correct
 * regardless of which server instance answers the request — previously this
 * read Hocuspocus's local in-memory `documents` map, which only ever saw
 * connections held by this one process.
 */
export async function getLiveViewerCount(boardId: string): Promise<number> {
  return countActiveViewers(boardId);
}
```

- [ ] **Step 6: Update the caller for the new async signature**

In `server/src/home/listPublicBoards.ts`, replace the body of `listPublicBoards` from the `const ranked = boards` line through the `.sort(...)` call with:

```ts
  const boardsWithViewerCounts = await Promise.all(
    boards.map(async (board) => ({
      id: board.id,
      name: board.name,
      ownerName: board.owner.name ?? "Anonymous",
      // Safe: the where clause above guarantees shareToken is non-null.
      // Prisma's generated type doesn't narrow through `where`, so a
      // non-null assertion (rather than `as string`) documents that the
      // guarantee comes from the query, not a blind cast.
      shareToken: board.shareToken!,
      liveViewerCount: await getLiveViewerCount(board.id),
      totalViews: board.totalViews,
      createdAt: board.createdAt,
      content: board.content,
    })),
  );

  const ranked = boardsWithViewerCounts.sort((a, b) => {
    if (a.liveViewerCount !== b.liveViewerCount) return b.liveViewerCount - a.liveViewerCount;
    if (a.totalViews !== b.totalViews) return b.totalViews - a.totalViews;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
```

- [ ] **Step 7: Run the full server test suite**

Run: `npm run test --workspace=server`
Expected: PASS — including `viewCounting.test.ts`, `home/listPublicBoards.test.ts` (still passes: `getLiveViewerCount` returns `0` for the test-created boards since nothing wrote presence for them in Redis, same effective behavior as before), and the new `viewerPresence.test.ts`.

- [ ] **Step 8: Commit**

Run:

```bash
git add server/src/collab/viewerPresence.ts server/src/collab/viewerPresence.test.ts server/src/collab/hocuspocus.ts server/src/home/listPublicBoards.ts
git commit -m "Make live viewer counts correct across instances via Redis presence"
```

---

### Task 5: server/Dockerfile

**Files:**
- Modify: `server/package.json` — add a `start` script
- Create: `server/Dockerfile`

**Interfaces:**
- Consumes: `server/src/index.ts` as the process entrypoint (unchanged).

- [ ] **Step 1: Add a `start` script**

The server has no build step today — `tsx` executes TypeScript directly, and this is true in dev (`"dev": "tsx watch src/index.ts"`) and stays true in the container (`noEmit: true` in `server/tsconfig.json` confirms there's no compiled output to run instead). Add to `server/package.json`'s `"scripts"`:

```json
    "start": "tsx src/index.ts",
```

(insert after `"dev"`, before `"prisma:generate"`)

- [ ] **Step 2: Create the Dockerfile**

Create `server/Dockerfile`. Build context must be the **repo root** (see Task 7's `build.context`), not `server/`, because this is an npm-workspaces monorepo — `npm ci` needs every workspace's `package.json` present to resolve the workspace graph, and the server imports `@cursive/shared`'s raw `.ts` directly (no build step there either):

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci

FROM deps AS runtime
COPY shared shared
COPY server server
WORKDIR /repo/server
RUN npx prisma generate
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
```

- [ ] **Step 3: Build it to confirm it compiles**

Run (from repo root): `docker build -f server/Dockerfile -t cursive-server-test .`
Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

Run:

```bash
git add server/package.json server/Dockerfile
git commit -m "Add server Dockerfile"
```

---

### Task 6: client/Dockerfile

**Files:**
- Create: `client/Dockerfile`

**Interfaces:**
- Consumes: `client/src/env.ts`'s `VITE_SYNC_URL`, `VITE_CHAT_SOCKET_URL`, `VITE_API_URL`, `VITE_LIVEKIT_URL`, `VITE_BOARD_CHAT_SOCKET_URL` — Vite build-time env vars, baked into the static bundle, supplied as Docker build args in Task 7.

- [ ] **Step 1: Create the Dockerfile**

Create `client/Dockerfile`. Same repo-root build-context reasoning as Task 5 — `npm ci` needs every workspace's `package.json`, and the client imports `@cursive/shared` directly:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY shared/package.json shared/package.json
RUN npm ci
COPY shared shared
COPY client client
WORKDIR /repo/client
ARG VITE_SYNC_URL
ARG VITE_CHAT_SOCKET_URL
ARG VITE_BOARD_CHAT_SOCKET_URL
ARG VITE_API_URL
ARG VITE_LIVEKIT_URL
ENV VITE_SYNC_URL=$VITE_SYNC_URL
ENV VITE_CHAT_SOCKET_URL=$VITE_CHAT_SOCKET_URL
ENV VITE_BOARD_CHAT_SOCKET_URL=$VITE_BOARD_CHAT_SOCKET_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /repo/client/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 2: Build it to confirm it compiles**

Run (from repo root):
```bash
docker build -f client/Dockerfile -t cursive-client-test \
  --build-arg VITE_SYNC_URL=ws://localhost:8080/sync \
  --build-arg VITE_CHAT_SOCKET_URL=ws://localhost:8080/chat \
  --build-arg VITE_BOARD_CHAT_SOCKET_URL=ws://localhost:8080/board-chat \
  --build-arg VITE_API_URL=http://localhost:8080 \
  --build-arg VITE_LIVEKIT_URL=ws://localhost:7880 \
  .
```
Expected: `tsc -b && vite build` succeeds, image builds.

- [ ] **Step 3: Commit**

Run:

```bash
git add client/Dockerfile
git commit -m "Add client Dockerfile"
```

---

### Task 7: nginx load balancer + full docker-compose wiring

**Files:**
- Create: `docker/nginx/nginx.conf`
- Modify: `docker-compose.yml` — add `app1`, `app2`, `nginx`, `client` services

**Interfaces:**
- Consumes: `server/Dockerfile` (Task 5), `client/Dockerfile` (Task 6), the `redis` service (Task 1).

- [ ] **Step 1: Write the nginx config**

Create `docker/nginx/nginx.conf`:

```nginx
events {}

http {
  upstream cursive_app {
    server app1:4000;
    server app2:4000;
  }

  server {
    listen 80;

    location /sync {
      proxy_pass http://cursive_app;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
    }

    location /chat {
      proxy_pass http://cursive_app;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
    }

    location /board-chat {
      proxy_pass http://cursive_app;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
    }

    location /api {
      proxy_pass http://cursive_app;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
      proxy_pass http://cursive_app;
    }
  }
}
```

Round-robin (nginx's default across the `upstream` block) with no sticky sessions — safe because Task 3's Redis extension keeps Hocuspocus state shared regardless of which instance a connection lands on.

- [ ] **Step 2: Add app1, app2, nginx, and client to docker-compose.yml**

Append these services to `docker-compose.yml` (after `livekit`, before the closing `volumes:` block):

```yaml
  app1:
    build:
      context: .
      dockerfile: server/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "4001:4000"
    environment:
      INSTANCE_NAME: app1
      PORT: 4000
      DATABASE_URL: postgresql://cursive:cursive_dev_password@postgres:5432/cursive?schema=public
      REDIS_URL: redis://redis:6379
      CLIENT_URL: http://localhost:8081
      BETTER_AUTH_URL: http://localhost:8080
      BETTER_AUTH_SECRET: dev-only-not-a-real-secret-app-0001
      SYNC_TICKET_SECRET: dev-only-not-a-real-secret-app-0002
      LIVEKIT_URL: ws://livekit:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_API_SECRET: secret

  app2:
    build:
      context: .
      dockerfile: server/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "4002:4000"
    environment:
      INSTANCE_NAME: app2
      PORT: 4000
      DATABASE_URL: postgresql://cursive:cursive_dev_password@postgres:5432/cursive?schema=public
      REDIS_URL: redis://redis:6379
      CLIENT_URL: http://localhost:8081
      BETTER_AUTH_URL: http://localhost:8080
      BETTER_AUTH_SECRET: dev-only-not-a-real-secret-app-0001
      SYNC_TICKET_SECRET: dev-only-not-a-real-secret-app-0002
      LIVEKIT_URL: ws://livekit:7880
      LIVEKIT_API_KEY: devkey
      LIVEKIT_API_SECRET: secret

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    depends_on:
      - app1
      - app2
    ports:
      - "8080:80"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro

  client:
    build:
      context: .
      dockerfile: client/Dockerfile
      args:
        VITE_SYNC_URL: ws://localhost:8080/sync
        VITE_CHAT_SOCKET_URL: ws://localhost:8080/chat
        VITE_BOARD_CHAT_SOCKET_URL: ws://localhost:8080/board-chat
        VITE_API_URL: http://localhost:8080
        VITE_LIVEKIT_URL: ws://localhost:7880
    restart: unless-stopped
    ports:
      - "8081:80"
```

`app1`/`app2` also each publish directly to a host port (`4001`, `4002`) — this is deliberate: it's what lets Task 9's cross-instance test connect to a specific instance and bypass nginx's round-robin, so the test can deterministically prove sync works *between* the two instances rather than accidentally hitting the same one twice. `BETTER_AUTH_SECRET`/`SYNC_TICKET_SECRET` are committed dev-only placeholder values, matching how `postgres`'s and `livekit`'s credentials are already committed directly in this file (not real secrets, not used outside local dev).

- [ ] **Step 3: Bring up the full stack**

Run: `docker-compose up -d --build`
Expected: all 7 services (`postgres`, `livekit`, `redis`, `app1`, `app2`, `nginx`, `client`) start; `docker-compose ps` shows `postgres` and `redis` as `healthy`, the rest as `running`.

- [ ] **Step 4: Confirm both server instances came up cleanly**

Run: `docker-compose logs app1 app2`
Expected: both logs show `Server listening on http://localhost:4000` (each container's own internal view) with no startup errors, and each log is prefixed by its own `INSTANCE_NAME` (`app1`/`app2`) since `docker-compose logs` labels output by service name.

- [ ] **Step 5: Confirm nginx reaches the app instances**

Run: `curl http://localhost:8080/health`
Expected: `{"status":"ok","knownShapeTypes":[...]}` — proves nginx's `/health` location successfully proxies to whichever of `app1`/`app2` it picked.

- [ ] **Step 6: Commit**

Run:

```bash
git add docker/nginx/nginx.conf docker-compose.yml
git commit -m "Add nginx load balancer and containerize client + 2 server instances"
```

---

### Task 8: Update ARCHITECTURE.md

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Replace the stale "Phase 6" line and add a real Phase 8 section**

`docs/ARCHITECTURE.md`'s "What's coming" section still calls this phase "Phase 6" — the numbering used before Phases 6 (Home page) and 7 (UI overhaul) were inserted ahead of it. Replace the line:

```
- **Phase 6** turns this into a real horizontally-scaled deployment: multiple Node instances behind nginx, sharing state through Redis and Postgres instead of each instance's own memory.
```

with:

```
- **Phase 9** brings the canvas itself much closer to a real creative tool: brushes/strokes, layers, and richer object styling.
```

And insert a new section right before "## What's coming":

```markdown
## Phase 8: Scale-out

- Three pieces of state that previously lived only in one server process's memory now live in **Redis**, shared across every instance:
  - **Yjs sync** — `@hocuspocus/extension-redis`, added alongside the existing Postgres persistence extension in `server/src/collab/hocuspocus.ts`. It uses Redis pub/sub to relay document updates and awareness between instances, so a client connected to one instance and a client connected to another stay in sync.
  - **Chat delivery** — `server/src/chat/pubsub.ts`'s in-process pub/sub (deliberately built swappable in Phase 3) is replaced by a Redis-backed implementation behind the same interface, used by both the DM/group chat gateway and the board-chat gateway.
  - **Live viewer counts** — previously read Hocuspocus's local in-memory connection list, which only ever reflected whichever single instance answered a given Home-page request. Now backed by a Redis sorted set per board (`server/src/collab/viewerPresence.ts`), with a heartbeat that refreshes each active connection's entry and a stale-entry prune on every read — so a crashed instance's connections age out on their own, with no explicit cleanup code.
- Better Auth's sessions did **not** need a Redis-backed cache: they're already persisted in Postgres via the Prisma adapter, so a session created against one instance was already readable by another.
- The whole stack — client, two server instances (`app1`/`app2`), nginx, Redis, Postgres, and LiveKit — now runs via `docker-compose up`, with nginx (`docker/nginx/nginx.conf`) load-balancing the two server instances with plain round-robin and no sticky sessions, safe specifically because the Redis-backed state above no longer makes it matter which instance a connection lands on.
```

- [ ] **Step 2: Commit**

Run:

```bash
git add docs/ARCHITECTURE.md
git commit -m "Document Phase 8 scale-out architecture"
```

---

### Task 9: Cross-instance verification and roadmap sign-off

**Files:**
- Modify: `docs/ROADMAP.md` — tick Phase 8's checkbox once verified

- [ ] **Step 1: Ensure the full stack is running**

Run: `docker-compose up -d`
Expected: all 7 services running (already true if Task 7 was just completed).

- [ ] **Step 2: Dispatch the `multiplayer-sim-tester` subagent**

Give it this task: connect two simulated clients directly to `app1` (`ws://localhost:4001`) and `app2` (`ws://localhost:4002`) — bypassing nginx so which instance each one hits is deterministic — using real minted sync tickets for the same test board. Verify three things:
1. **Yjs sync**: both clients edit different fields of the same shape concurrently; both edits converge on both connections (same field-level convergence property Phase 1 verified, now proven across two separate processes instead of one).
2. **Chat**: two chat clients, one against each instance's `/chat` (or `/board-chat`) endpoint, exchange a message; both see it.
3. **Live viewer count**: two viewer connections split across the two instances to the same board; a request to either instance's `/api/home` reports a combined live count of 2, not 1.

- [ ] **Step 3: Manual browser walkthrough**

Open `http://localhost:8081` (the client, through its own container) in two browser tabs on the same board. Draw in one tab, confirm the change appears in the other. Run `docker-compose logs app1 app2` and confirm both instances' log lines appear (proving nginx actually distributed the two tabs' connections across both instances, not just one).

- [ ] **Step 4: Tick Phase 8's roadmap checkbox**

In `docs/ROADMAP.md`, change:

```
- [ ] **Phase 8 — Scale-out.** Add Redis (shared sessions + Hocuspocus's Redis extension), containerize everything with Docker Compose, run 2+ Node instances behind an nginx load balancer, and demonstrate two clients on different instances staying in sync. Also the phase that makes Phase 6's live viewer counts correct across instances, not just on whichever single instance answers a request.
```

to:

```
- [x] **Phase 8 — Scale-out.** Redis now backs the three pieces of state that used to live only in one server process's memory: Hocuspocus's Yjs sync (`@hocuspocus/extension-redis`), chat delivery (a Redis-backed swap into the pub/sub interface built swappable back in Phase 3), and live viewer counts (a Redis sorted set with heartbeat-refreshed, self-expiring entries, replacing a read of Hocuspocus's local in-memory connection list). Better Auth's sessions needed no Redis cache — they were already Postgres-backed and correctly shared. The whole stack — client, 2 server instances, nginx, Redis, Postgres, LiveKit — runs via `docker-compose up`, with nginx round-robin load-balancing the two server instances and no sticky sessions, safe because of the Redis-backed state above. Verified with the `multiplayer-sim-tester` subagent (two simulated clients connected directly to each instance, bypassing nginx, confirming Yjs edits converge, chat messages deliver, and live viewer counts combine correctly across instances) and a manual two-tab browser walkthrough through nginx confirming both instances actually handled traffic.
```

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/ROADMAP.md
git commit -m "Mark Phase 8 (Scale-out) complete"
```
