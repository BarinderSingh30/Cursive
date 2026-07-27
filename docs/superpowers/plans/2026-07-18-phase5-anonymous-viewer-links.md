# Phase 5 — Anonymous Viewer Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, no-account-required `/watch/:shareToken` page per board (read-only canvas, subscribe-only call, Twitch-style chat sidebar), plus the board-scoped live chat feature that page depends on — both new, per `docs/superpowers/specs/2026-07-18-phase5-anonymous-viewer-links-design.md`.

**Architecture:** Extend the single `resolveBoardRole` authorization function with a DB-backed share-token fallback branch (owner enables/disables/regenerates a token stored on `Board`); build a new board-scoped chat subsystem (new `BoardMessage` model, a new WS gateway, reusing the existing generic pub/sub) since anonymous visitors can't fit the existing friend-DM `ConversationMember` model; extract the canvas/presence/call/chat experience into a shared `BoardExperience` component used by both the authenticated editing page and the new public watch page.

**Tech Stack:** Express + Zod, Prisma/PostgreSQL, `ws` WebSocketServer, Hocuspocus/Yjs, React + TypeScript, Vitest + `@testing-library/react`.

## Global Constraints

- **Never run `git`, `npm install`, `prisma migrate`/`generate`, `docker compose`, or dev-server-start commands on the user's behalf** — the user is learning this tooling and runs these himself. When a task needs one, stop and hand him the exact command with a one-line explanation of what it does, then wait for his confirmation it succeeded before continuing to any step that depends on it.
- **Running the test suite (`npm test` / `vitest run`) is fine to run directly** — it's verification, not an environment change, and every TDD step below depends on it.
- This codebase has no test coverage for Express route handlers themselves (only the pure functions routes call into) — follow that existing convention; don't invent route-level integration tests.
- Match existing import style exactly: relative imports use a `.js` extension even though the source file is `.ts`/`.tsx` (this is an ESM/NodeNext requirement already used throughout the repo).
- `BoardRole` values are `"owner" | "collaborator" | "viewer"`; `roleAtLeast(role, minimum)` from `@cursive/shared` is the only comparison helper — never hand-roll role comparisons.
- The centralized authorization check lives in `server/src/authorization/boardAccess.ts` (`resolveBoardRole`) — every surface that needs to know "can this connection do X" calls into it or into `requireBoardRole()`, never re-implements the check.

---

### Task 1: Prisma schema — share link fields + board chat model

**Files:**
- Modify: `server/prisma/schema.prisma`

**Interfaces:**
- Produces: `Board.shareEnabled: boolean`, `Board.shareToken: string | null`, new `BoardMessage` model (`id`, `boardId`, `authorId`, `content`, `createdAt`) with relations `Board.messages` and `User.boardMessages` — all later tasks that touch sharing or board chat persistence depend on these.

- [ ] **Step 1: Add the two share-link columns to `Board`**

Find the `model Board { ... }` block (currently ends right before `model BoardMember`) and change it to:

```prisma
model Board {
  id        String   @id @default(cuid())
  name      String
  ownerId   String
  // The board's canvas content as an encoded Yjs update (see
  // server/src/collab/persistence.ts) — opaque binary, never queried or
  // inspected here, just fetched/stored whole by Hocuspocus.
  content   Bytes?
  // A public, no-account-required watch link. Checked live against the DB
  // (not a signed token) so disabling/regenerating takes effect immediately
  // — see docs/superpowers/specs/2026-07-18-phase5-anonymous-viewer-links-design.md.
  shareEnabled Boolean @default(false)
  shareToken   String? @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  owner    User           @relation("BoardOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members  BoardMember[]
  invites  BoardInvite[]
  messages BoardMessage[]
}
```

- [ ] **Step 2: Add the `BoardMessage` model**

Add this new model directly after the `BoardMember` model (before `enum FriendRequestStatus`):

```prisma
model BoardMessage {
  id        String   @id @default(cuid())
  boardId   String
  // Always a real registered user — anonymous share-link visitors can read
  // board chat but can never post, so this is never nullable.
  authorId  String
  content   String
  createdAt DateTime @default(now())

  board  Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  author User  @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Add the inverse relation on `User`**

In `model User { ... }`, add one line alongside the existing `sentMessages`/`messageDeletions` relations:

```prisma
  boardMessages BoardMessage[]
```

- [ ] **Step 4: Hand the migration command to the user**

Tell the user (don't run this yourself):

> Run this from `server/` to apply the schema change to your local Postgres and regenerate the Prisma client:
> ```bash
> npm run prisma:migrate -- --name add_board_sharing_and_chat
> ```
> This creates a new migration file under `server/prisma/migrations/`, applies it to your dev database, and regenerates `@prisma/client` so the new `shareEnabled`/`shareToken`/`BoardMessage` fields are usable in code.

Wait for the user to confirm it completed successfully before starting Task 2 (every later task assumes these columns/model exist in the generated Prisma client).

- [ ] **Step 5: Commit**

Hand the user this command (don't run it yourself):
```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "Add board share-link fields and BoardMessage model"
```

---

### Task 2: Shared schemas for sharing & board chat

**Files:**
- Create: `shared/src/api/boardShare.schemas.ts`
- Create: `shared/src/api/boardChat.schemas.ts`
- Create: `shared/src/ws-events/board-chat-events.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces: `ShareLinkState` (`{ enabled: boolean; token: string | null }`), `ShareLinkInfo` (`{ boardId: string; boardName: string; hasMembership: boolean }`), `SendBoardMessageInput`, `BoardChatMessage`, `BoardChatClientEvent`, `BoardChatServerEvent` — every server and client task below imports these from `@cursive/shared`.

- [ ] **Step 1: Write `boardShare.schemas.ts`**

```ts
import { z } from "zod";

export const shareLinkStateSchema = z.object({
  enabled: z.boolean(),
  token: z.string().nullable(),
});
export type ShareLinkState = z.infer<typeof shareLinkStateSchema>;

export const shareLinkInfoSchema = z.object({
  boardId: z.string(),
  boardName: z.string(),
  /** True if the visitor already has a real BoardMember row — the client
   * redirects to the normal /board/:boardId page instead of watch mode. */
  hasMembership: z.boolean(),
});
export type ShareLinkInfo = z.infer<typeof shareLinkInfoSchema>;
```

- [ ] **Step 2: Write `boardChat.schemas.ts`**

```ts
import { z } from "zod";

export const sendBoardMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});
export type SendBoardMessageInput = z.infer<typeof sendBoardMessageSchema>;

export const boardMessageSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  authorId: z.string(),
  authorName: z.string().nullable(),
  content: z.string(),
  createdAt: z.string(),
});
export type BoardChatMessage = z.infer<typeof boardMessageSchema>;
```

- [ ] **Step 3: Write `board-chat-events.ts`**

```ts
import type { BoardChatMessage } from "../api/boardChat.schemas.js";

export type BoardChatClientEvent = { type: "send"; content: string };

export type BoardChatServerEvent = { type: "message"; message: BoardChatMessage } | { type: "error"; message: string };
```

- [ ] **Step 4: Add the barrel exports**

In `shared/src/index.ts`, add these two lines after the existing `export * from "./ws-events/chat-events.js";`:

```ts
export * from "./api/boardShare.schemas.js";
export * from "./api/boardChat.schemas.js";
export * from "./ws-events/board-chat-events.js";
```

- [ ] **Step 5: Commit**

```bash
git add shared/src/api/boardShare.schemas.ts shared/src/api/boardChat.schemas.ts shared/src/ws-events/board-chat-events.ts shared/src/index.ts
git commit -m "Add shared schemas for board sharing and board chat"
```

---

### Task 3: Connection ticket — anonymous board-sync + board-chat purpose

**Files:**
- Modify: `server/src/authorization/connectionTicket.ts`
- Modify: `server/src/authorization/connectionTicket.test.ts`

**Interfaces:**
- Consumes: none new (existing `jwt`, `env.SYNC_TICKET_SECRET`).
- Produces: `ConnectionTicketPayload` gains `anonymous: boolean` on the `board-sync` variant and a new `board-chat` variant `{ purpose: "board-chat"; userId: string; boardId: string; role: BoardRole; anonymous: boolean }` — `boardChat/wsGateway.ts` (Task 9) and `boardsRouter`'s ticket-minting routes (Tasks 6, 10) depend on this exact shape. `userId` is never actually `null` — for an anonymous visitor it's a `anon:<uuid>` string the caller constructs, so every downstream consumer (Hocuspocus, LiveKit, board chat) keeps treating `userId` as a plain identity string.

- [ ] **Step 1: Write the failing tests**

Replace the file's contents with:

```ts
import { describe, expect, it } from "vitest";
import { mintConnectionTicket, verifyConnectionTicket } from "./connectionTicket.js";

describe("connectionTicket", () => {
  it("round-trips a board-sync ticket for a logged-in member", () => {
    const ticket = mintConnectionTicket({
      purpose: "board-sync",
      userId: "u1",
      boardId: "b1",
      role: "collaborator",
      anonymous: false,
    });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-sync",
      userId: "u1",
      boardId: "b1",
      role: "collaborator",
      anonymous: false,
    });
  });

  it("round-trips a board-sync ticket for an anonymous share-link visitor", () => {
    const ticket = mintConnectionTicket({
      purpose: "board-sync",
      userId: "anon:abc123",
      boardId: "b1",
      role: "viewer",
      anonymous: true,
    });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-sync",
      userId: "anon:abc123",
      boardId: "b1",
      role: "viewer",
      anonymous: true,
    });
  });

  it("round-trips a chat ticket", () => {
    const ticket = mintConnectionTicket({ purpose: "chat", userId: "u1" });
    expect(verifyConnectionTicket(ticket)).toEqual({ purpose: "chat", userId: "u1" });
  });

  it("round-trips a board-chat ticket", () => {
    const ticket = mintConnectionTicket({
      purpose: "board-chat",
      userId: "u1",
      boardId: "b1",
      role: "owner",
      anonymous: false,
    });
    expect(verifyConnectionTicket(ticket)).toEqual({
      purpose: "board-chat",
      userId: "u1",
      boardId: "b1",
      role: "owner",
      anonymous: false,
    });
  });

  it("rejects a garbage token", () => {
    expect(verifyConnectionTicket("not-a-real-token")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `server/`): `npx vitest run src/authorization/connectionTicket.test.ts`
Expected: FAIL — the `board-sync` payload shape doesn't include `anonymous` yet, and `"board-chat"` isn't a valid `purpose`.

- [ ] **Step 3: Update the payload type**

In `connectionTicket.ts`, replace the `ConnectionTicketPayload` type with:

```ts
export type ConnectionTicketPayload =
  | { purpose: "board-sync"; userId: string; boardId: string; role: BoardRole; anonymous: boolean }
  | { purpose: "chat"; userId: string }
  | { purpose: "board-chat"; userId: string; boardId: string; role: BoardRole; anonymous: boolean };
```

Leave `mintConnectionTicket`/`verifyConnectionTicket` themselves unchanged — they're already generic over the payload shape.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/authorization/connectionTicket.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/authorization/connectionTicket.ts server/src/authorization/connectionTicket.test.ts
git commit -m "Add anonymous flag and board-chat purpose to connection tickets"
```

---

### Task 4: `resolveBoardRole` share-token branch + `requireBoardRole` header support

**Files:**
- Modify: `server/src/authorization/boardAccess.ts`
- Create: `server/src/authorization/boardAccess.test.ts`
- Modify: `server/src/authorization/requireBoardRole.ts`

**Interfaces:**
- Consumes: `prisma.board`, `prisma.boardMember` (generated client from Task 1's migration).
- Produces: `resolveBoardRole({ userId, boardId, shareToken? }): Promise<BoardAccessResult>` — the share-token branch is additive; every existing caller (that never passes `shareToken`) behaves exactly as before. `requireBoardRole(minimum)` now reads an `X-Share-Token` request header and forwards it, and `res.locals.userId`/`res.locals.anonymous` can now describe an anonymous caller for `"viewer"`-minimum routes (Tasks 5, 6, 10 rely on this).

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { resolveBoardRole } from "./boardAccess.js";

const TEST_USER_FILTER = { email: { contains: "@board-access-test.local" } };

afterEach(async () => {
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("resolveBoardRole", () => {
  it("returns the real membership role for a logged-in member, ignoring any share token", async () => {
    const owner = await prisma.user.create({ data: { email: "owner@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, members: { create: { userId: owner.id, role: "owner" } } },
    });

    const result = await resolveBoardRole({ userId: owner.id, boardId: board.id, shareToken: "wrong-token" });
    expect(result).toEqual({ role: "owner", userId: owner.id, anonymous: false });
  });

  it("returns null role for a logged-in non-member with no share token", async () => {
    const owner = await prisma.user.create({ data: { email: "owner2@board-access-test.local", emailVerified: true } });
    const stranger = await prisma.user.create({ data: { email: "stranger@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    const result = await resolveBoardRole({ userId: stranger.id, boardId: board.id });
    expect(result).toEqual({ role: null, userId: stranger.id, anonymous: false });
  });

  it("resolves an anonymous visitor with a valid, enabled share token as a viewer", async () => {
    const owner = await prisma.user.create({ data: { email: "owner3@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: true, shareToken: "tok-1" },
    });

    const result = await resolveBoardRole({ userId: null, boardId: board.id, shareToken: "tok-1" });
    expect(result).toEqual({ role: "viewer", userId: null, anonymous: true });
  });

  it("resolves a logged-in non-member with a valid share token as a non-anonymous viewer", async () => {
    const owner = await prisma.user.create({ data: { email: "owner4@board-access-test.local", emailVerified: true } });
    const visitor = await prisma.user.create({ data: { email: "visitor4@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: true, shareToken: "tok-2" },
    });

    const result = await resolveBoardRole({ userId: visitor.id, boardId: board.id, shareToken: "tok-2" });
    expect(result).toEqual({ role: "viewer", userId: visitor.id, anonymous: false });
  });

  it("rejects a share token that doesn't match this board's token", async () => {
    const owner = await prisma.user.create({ data: { email: "owner5@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: true, shareToken: "tok-3" },
    });

    const result = await resolveBoardRole({ userId: null, boardId: board.id, shareToken: "wrong-token" });
    expect(result).toEqual({ role: null, userId: null, anonymous: true });
  });

  it("rejects a valid token for a board whose sharing is disabled", async () => {
    const owner = await prisma.user.create({ data: { email: "owner6@board-access-test.local", emailVerified: true } });
    const board = await prisma.board.create({
      data: { name: "Board", ownerId: owner.id, shareEnabled: false, shareToken: "tok-4" },
    });

    const result = await resolveBoardRole({ userId: null, boardId: board.id, shareToken: "tok-4" });
    expect(result).toEqual({ role: null, userId: null, anonymous: true });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `server/`): `npx vitest run src/authorization/boardAccess.test.ts`
Expected: FAIL — `resolveBoardRole` doesn't accept a `shareToken` parameter yet, and the membership-only branch throws it away.

- [ ] **Step 3: Implement the share-token branch**

Replace `boardAccess.ts`'s contents with:

```ts
import type { BoardRole } from "@cursive/shared";
import { prisma } from "../db/prisma.js";

export interface BoardAccessResult {
  role: BoardRole | null;
  userId: string | null;
  anonymous: boolean;
}

/**
 * The single source of truth for "what can this connection do on this board."
 * Every surface that needs to know — Yjs sync, board chat, REST routes,
 * LiveKit token minting — calls into this instead of re-implementing the
 * check. Explicit membership always wins; the share-token branch is purely a
 * fallback for visitors with no BoardMember row (owner/collaborator/invited
 * viewers opening their own public link still resolve to their real role).
 */
export async function resolveBoardRole(params: {
  userId: string | null;
  boardId: string;
  shareToken?: string;
}): Promise<BoardAccessResult> {
  const { userId, boardId, shareToken } = params;

  if (userId) {
    const membership = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
    });
    if (membership) {
      return { role: membership.role as BoardRole, userId, anonymous: false };
    }
  }

  if (shareToken) {
    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (board?.shareEnabled && board.shareToken === shareToken) {
      return { role: "viewer", userId, anonymous: !userId };
    }
  }

  return { role: null, userId, anonymous: !userId };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/authorization/boardAccess.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Extend `requireBoardRole` to read the share-token header**

Replace `requireBoardRole.ts`'s contents with:

```ts
import type { NextFunction, Request, Response } from "express";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { getSessionFromRequest } from "../auth/session.js";
import { resolveBoardRole } from "./boardAccess.js";

/**
 * Express middleware factory: rejects unless the caller has at least
 * `minimum` role on `req.params.boardId`. The caller can be a logged-in
 * member (session cookie) or a share-link visitor (`X-Share-Token` header,
 * logged in or not) — resolveBoardRole is what actually decides which. A
 * share-token resolution never produces higher than "viewer", so this never
 * changes behavior for "collaborator"/"owner"-minimum routes.
 */
export function requireBoardRole(minimum: BoardRole) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const boardId = req.params.boardId;
    const result = await getSessionFromRequest(req);
    const userId = result?.user?.id ?? null;
    const shareToken = req.header("x-share-token") || undefined;

    const access = await resolveBoardRole({ userId, boardId, shareToken });
    if (!roleAtLeast(access.role, minimum)) {
      res.status(access.userId ? 403 : 401).json({ error: "Not allowed" });
      return;
    }

    res.locals.userId = access.userId;
    res.locals.boardRole = access.role;
    res.locals.anonymous = access.anonymous;
    next();
  };
}
```

- [ ] **Step 6: Run the full server test suite to check nothing else broke**

Run (from `server/`): `npm test`
Expected: PASS — every existing route that calls `requireBoardRole` with a real session and no share token behaves identically (`access.userId` is always truthy there, same as `res.locals.userId as string` casts elsewhere assume).

- [ ] **Step 7: Commit**

```bash
git add server/src/authorization/boardAccess.ts server/src/authorization/boardAccess.test.ts server/src/authorization/requireBoardRole.ts
git commit -m "Add share-token fallback to resolveBoardRole and requireBoardRole"
```

---

### Task 5: Board share lifecycle routes + public share-link lookup

**Files:**
- Modify: `server/src/routes/boards.routes.ts`

**Interfaces:**
- Consumes: `resolveBoardRole`/`requireBoardRole` (Task 4), `ShareLinkState`/`ShareLinkInfo` (Task 2), `getSessionFromRequest` from `../auth/session.js`.
- Produces: `GET /:boardId/share`, `POST /:boardId/share/enable`, `POST /:boardId/share/regenerate`, `POST /:boardId/share/disable` (all owner-only), and public `GET /by-share/:shareToken` — Task 17's `WatchPage`/`useShareLink` and Task 16's `useBoardShare` call these by exact path.

- [ ] **Step 1: Add the imports this task needs**

At the top of `boards.routes.ts`, add:

```ts
import { randomUUID } from "node:crypto";
import type { ShareLinkState, ShareLinkInfo } from "@cursive/shared";
import { getSessionFromRequest } from "../auth/session.js";
```

(These join the existing imports — don't remove anything already there.)

- [ ] **Step 2: Add the owner-only share lifecycle routes**

Add these anywhere after the existing `boardsRouter.get("/:boardId", ...)` route:

```ts
boardsRouter.get("/:boardId/share", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  const body: ShareLinkState = { enabled: board.shareEnabled, token: board.shareEnabled ? board.shareToken : null };
  res.json(body);
});

boardsRouter.post("/:boardId/share/enable", requireBoardRole("owner"), async (req, res) => {
  const board = await prisma.board.findUniqueOrThrow({ where: { id: req.params.boardId } });
  const token = board.shareToken ?? randomUUID();
  const updated = await prisma.board.update({
    where: { id: board.id },
    data: { shareEnabled: true, shareToken: token },
  });
  const body: ShareLinkState = { enabled: true, token: updated.shareToken };
  res.json(body);
});

// Replaces the token outright, instantly invalidating any previously shared URL.
boardsRouter.post("/:boardId/share/regenerate", requireBoardRole("owner"), async (req, res) => {
  const updated = await prisma.board.update({
    where: { id: req.params.boardId },
    data: { shareEnabled: true, shareToken: randomUUID() },
  });
  const body: ShareLinkState = { enabled: true, token: updated.shareToken };
  res.json(body);
});

boardsRouter.post("/:boardId/share/disable", requireBoardRole("owner"), async (req, res) => {
  await prisma.board.update({ where: { id: req.params.boardId }, data: { shareEnabled: false } });
  const body: ShareLinkState = { enabled: false, token: null };
  res.json(body);
});
```

- [ ] **Step 3: Add the public share-link lookup route**

Add this route (no `requireBoardRole` gate — it's the discovery endpoint itself, reachable with or without a session):

```ts
/**
 * Public: resolves a share token to the board it belongs to, with no role
 * requirement — this is how an anonymous visitor's browser first learns
 * which board a /watch/:shareToken URL points at. If the visitor happens to
 * be logged in and already has real board membership, hasMembership tells
 * the client to redirect to the normal /board/:boardId page instead.
 */
boardsRouter.get("/by-share/:shareToken", async (req, res) => {
  const board = await prisma.board.findFirst({
    where: { shareToken: req.params.shareToken, shareEnabled: true },
  });
  if (!board) {
    res.status(404).json({ error: "This link isn't active" });
    return;
  }

  const session = await getSessionFromRequest(req);
  const userId = session?.user?.id ?? null;
  const membership = userId
    ? await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId: board.id, userId } } })
    : null;

  const body: ShareLinkInfo = { boardId: board.id, boardName: board.name, hasMembership: membership !== null };
  res.json(body);
});
```

- [ ] **Step 4: Run the server test suite**

Run (from `server/`): `npm test`
Expected: PASS — this task only adds new routes, matching this codebase's convention of not writing dedicated route-level tests (only the pure functions they call are unit tested).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/boards.routes.ts
git commit -m "Add board share-link lifecycle routes and public share lookup"
```

---

### Task 6: Anonymous-aware sync-ticket and call-token routes

**Files:**
- Modify: `server/src/routes/boards.routes.ts`

**Interfaces:**
- Consumes: `mintConnectionTicket` (Task 3's updated shape), `mintCallToken` (unchanged signature).
- Produces: a local `visitorIdentity(req, res)` helper used by this task and Task 10 — returns the real `userId` when logged in, or a stable `anon:<id>` string built from the `X-Anon-Id` request header (falling back to a fresh random id only if the client didn't send one).

- [ ] **Step 1: Add the `visitorIdentity` helper**

Add this function near the top of `boards.routes.ts`, after the imports:

```ts
/**
 * The identity string embedded in a connection ticket/call token: the real
 * session user id when logged in, or a stable anon:<id> string for a
 * share-link visitor. The client generates and persists that id itself
 * (see client/src/viewer/useAnonIdentity.ts) so it stays stable across
 * reconnects on the same browser — the random() fallback only fires if a
 * caller somehow omits the header.
 */
function visitorIdentity(req: import("express").Request, res: import("express").Response): string {
  const userId = res.locals.userId as string | null;
  if (userId) return userId;
  return `anon:${req.header("x-anon-id") || randomUUID()}`;
}
```

- [ ] **Step 2: Update the sync-ticket route**

Replace the existing `boardsRouter.get("/:boardId/sync-ticket", ...)` route with:

```ts
boardsRouter.get("/:boardId/sync-ticket", requireBoardRole("viewer"), async (req, res) => {
  const ticket = mintConnectionTicket({
    purpose: "board-sync",
    userId: visitorIdentity(req, res),
    anonymous: res.locals.anonymous as boolean,
    boardId: req.params.boardId,
    role: res.locals.boardRole as BoardRole,
  });
  res.json({ ticket });
});
```

`boards.routes.ts`'s existing `@cursive/shared` import doesn't include `BoardRole` yet — add `type BoardRole` to that import list now, since this step and the call-token route below both cast `res.locals.boardRole as BoardRole`.

- [ ] **Step 3: Update the call-token route**

Replace the existing `boardsRouter.get("/:boardId/call-token", ...)` route with:

```ts
boardsRouter.get("/:boardId/call-token", requireBoardRole("viewer"), async (req, res) => {
  const userId = res.locals.userId as string | null;
  const identity = visitorIdentity(req, res);
  const userName = userId
    ? await prisma.user.findUniqueOrThrow({ where: { id: userId } }).then((u) => u.name ?? u.email)
    : req.header("x-anon-name") || "Guest";

  const token = await mintCallToken({
    userId: identity,
    userName,
    boardId: req.params.boardId,
    role: res.locals.boardRole as BoardRole,
  });
  res.json({ token, url: env.LIVEKIT_URL });
});
```

- [ ] **Step 4: Run the server test suite**

Run (from `server/`): `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/boards.routes.ts
git commit -m "Let anonymous share-link visitors mint sync tickets and call tokens"
```

---

### Task 7: Board chat persistence

**Files:**
- Create: `server/src/boardChat/messages.ts`
- Create: `server/src/boardChat/messages.test.ts`

**Interfaces:**
- Consumes: `prisma.boardMessage` (Task 1), `BoardChatMessage` type (Task 2).
- Produces: `recordBoardMessage(boardId, authorId, content): Promise<BoardChatMessage>`, `listBoardMessages(boardId, before?): Promise<BoardChatMessage[]>` — Task 9's WS gateway and Task 10's REST route depend on these exact signatures.

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { recordBoardMessage, listBoardMessages } from "./messages.js";

const TEST_USER_FILTER = { email: { contains: "@board-chat-msg-test.local" } };

afterEach(async () => {
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

describe("recordBoardMessage", () => {
  it("persists a message and returns it with the author's name", async () => {
    const author = await prisma.user.create({
      data: { email: "author@board-chat-msg-test.local", emailVerified: true, name: "Author" },
    });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: author.id } });

    const message = await recordBoardMessage(board.id, author.id, "hello board");

    expect(message).toMatchObject({ boardId: board.id, authorId: author.id, authorName: "Author", content: "hello board" });
  });
});

describe("listBoardMessages", () => {
  it("returns messages oldest-appropriate for pagination, newest first", async () => {
    const author = await prisma.user.create({ data: { email: "author2@board-chat-msg-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: author.id } });
    await recordBoardMessage(board.id, author.id, "first");
    await recordBoardMessage(board.id, author.id, "second");

    const page = await listBoardMessages(board.id);

    expect(page.map((m) => m.content)).toEqual(["second", "first"]);
  });

  it("pages before a given message id", async () => {
    const author = await prisma.user.create({ data: { email: "author3@board-chat-msg-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: author.id } });
    const first = await recordBoardMessage(board.id, author.id, "first");
    await recordBoardMessage(board.id, author.id, "second");

    const page = await listBoardMessages(board.id, first.id);

    expect(page).toEqual([]);
  });

  it("only returns messages for the requested board", async () => {
    const author = await prisma.user.create({ data: { email: "author4@board-chat-msg-test.local", emailVerified: true } });
    const boardA = await prisma.board.create({ data: { name: "A", ownerId: author.id } });
    const boardB = await prisma.board.create({ data: { name: "B", ownerId: author.id } });
    await recordBoardMessage(boardA.id, author.id, "in A");
    await recordBoardMessage(boardB.id, author.id, "in B");

    const page = await listBoardMessages(boardA.id);

    expect(page.map((m) => m.content)).toEqual(["in A"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `server/`): `npx vitest run src/boardChat/messages.test.ts`
Expected: FAIL — `./messages.js` doesn't exist yet.

- [ ] **Step 3: Implement `messages.ts`**

```ts
import type { BoardChatMessage } from "@cursive/shared";
import { prisma } from "../db/prisma.js";

const PAGE_SIZE = 30;

export async function recordBoardMessage(boardId: string, authorId: string, content: string): Promise<BoardChatMessage> {
  const message = await prisma.boardMessage.create({
    data: { boardId, authorId, content },
    include: { author: true },
  });
  return {
    id: message.id,
    boardId: message.boardId,
    authorId: message.authorId,
    authorName: message.author.name,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function listBoardMessages(boardId: string, before?: string): Promise<BoardChatMessage[]> {
  const messages = await prisma.boardMessage.findMany({
    where: { boardId },
    include: { author: true },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });
  return messages.map((m) => ({
    id: m.id,
    boardId: m.boardId,
    authorId: m.authorId,
    authorName: m.author.name,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/boardChat/messages.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/boardChat/messages.ts server/src/boardChat/messages.test.ts
git commit -m "Add board chat message persistence"
```

---

### Task 8: Board chat write-gate

**Files:**
- Create: `server/src/boardChat/authorization.ts`
- Create: `server/src/boardChat/authorization.test.ts`

**Interfaces:**
- Consumes: the `board-chat` `ConnectionTicketPayload` variant (Task 3).
- Produces: `canPostBoardChat(payload): boolean` — Task 9's WS gateway calls this on every `"send"` event.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { canPostBoardChat } from "./authorization.js";

describe("canPostBoardChat", () => {
  it("allows a logged-in owner", () => {
    expect(canPostBoardChat({ purpose: "board-chat", userId: "u1", boardId: "b1", role: "owner", anonymous: false })).toBe(
      true,
    );
  });

  it("allows a logged-in collaborator", () => {
    expect(
      canPostBoardChat({ purpose: "board-chat", userId: "u1", boardId: "b1", role: "collaborator", anonymous: false }),
    ).toBe(true);
  });

  it("allows a logged-in viewer, whether invited or share-link", () => {
    expect(
      canPostBoardChat({ purpose: "board-chat", userId: "u1", boardId: "b1", role: "viewer", anonymous: false }),
    ).toBe(true);
  });

  it("rejects a fully anonymous share-link visitor", () => {
    expect(
      canPostBoardChat({ purpose: "board-chat", userId: "anon:abc", boardId: "b1", role: "viewer", anonymous: true }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `server/`): `npx vitest run src/boardChat/authorization.test.ts`
Expected: FAIL — `./authorization.js` doesn't exist yet.

- [ ] **Step 3: Implement `authorization.ts`**

```ts
import type { ConnectionTicketPayload } from "../authorization/connectionTicket.js";

type BoardChatTicket = Extract<ConnectionTicketPayload, { purpose: "board-chat" }>;

/**
 * The one board-chat write rule: any logged-in visitor can post — owner,
 * collaborator, an invited viewer, or a logged-in stranger just watching via
 * the public link — only a fully anonymous (not-logged-in) visitor can't.
 * Twitch-chat behavior, not a role check: role is always at least "viewer"
 * here already, since a ticket couldn't have been minted otherwise.
 */
export function canPostBoardChat(payload: BoardChatTicket): boolean {
  return !payload.anonymous;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/boardChat/authorization.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/boardChat/authorization.ts server/src/boardChat/authorization.test.ts
git commit -m "Add board chat write-gate (anonymous visitors are read-only)"
```

---

### Task 9: Board chat WebSocket gateway

**Files:**
- Create: `server/src/boardChat/wsGateway.ts`
- Create: `server/src/boardChat/wsGateway.test.ts`
- Modify: `server/src/ws/router.ts`

**Interfaces:**
- Consumes: `verifyConnectionTicket` (Task 3), `canPostBoardChat` (Task 8), `recordBoardMessage` (Task 7), `chatPubSub` (existing `server/src/chat/pubsub.ts`, reused as-is).
- Produces: `boardChatWss: WebSocketServer` mounted at the `/board-chat` upgrade path — Task 14's client hook connects to this exact path.

- [ ] **Step 1: Write the failing tests**

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { prisma } from "../db/prisma.js";
import { mintConnectionTicket } from "../authorization/connectionTicket.js";
import { boardChatWss } from "./wsGateway.js";

let server: ReturnType<typeof createServer>;
let baseUrl: string;

beforeEach(async () => {
  server = createServer();
  server.on("upgrade", (request, socket, head) => {
    boardChatWss.handleUpgrade(request, socket, head, (ws) => boardChatWss.emit("connection", ws, request));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `ws://localhost:${(server.address() as AddressInfo).port}`;
});

const TEST_USER_FILTER = { email: { contains: "@board-chat-ws-test.local" } };

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.board.deleteMany({ where: { owner: TEST_USER_FILTER } });
  await prisma.user.deleteMany({ where: TEST_USER_FILTER });
});

function connect(ticket: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl}?ticket=${ticket}`);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => socket.once("message", (raw) => resolve(JSON.parse(raw.toString()))));
}

describe("board chat WebSocket gateway", () => {
  it("delivers a sent message to every other connection on the same board", async () => {
    const owner = await prisma.user.create({ data: { email: "owner@board-chat-ws-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    const ownerSocket = await connect(
      mintConnectionTicket({ purpose: "board-chat", userId: owner.id, boardId: board.id, role: "owner", anonymous: false }),
    );
    const viewerSocket = await connect(
      mintConnectionTicket({
        purpose: "board-chat",
        userId: "anon:visitor-1",
        boardId: board.id,
        role: "viewer",
        anonymous: true,
      }),
    );

    ownerSocket.send(JSON.stringify({ type: "send", content: "hello everyone" }));
    const received = await nextMessage(viewerSocket);

    expect(received).toMatchObject({ type: "message", message: { content: "hello everyone", authorId: owner.id } });

    ownerSocket.close();
    viewerSocket.close();
  });

  it("rejects a send from an anonymous visitor and never persists it", async () => {
    const owner = await prisma.user.create({ data: { email: "owner2@board-chat-ws-test.local", emailVerified: true } });
    const board = await prisma.board.create({ data: { name: "Board", ownerId: owner.id } });

    const anonSocket = await connect(
      mintConnectionTicket({
        purpose: "board-chat",
        userId: "anon:visitor-2",
        boardId: board.id,
        role: "viewer",
        anonymous: true,
      }),
    );

    anonSocket.send(JSON.stringify({ type: "send", content: "sneaky" }));
    const received = await nextMessage(anonSocket);

    expect(received.type).toBe("error");
    const stored = await prisma.boardMessage.findMany({ where: { boardId: board.id } });
    expect(stored).toHaveLength(0);

    anonSocket.close();
  });

  it("does not deliver a board-chat message to a connection on a different board", async () => {
    const owner = await prisma.user.create({ data: { email: "owner3@board-chat-ws-test.local", emailVerified: true } });
    const boardA = await prisma.board.create({ data: { name: "A", ownerId: owner.id } });
    const boardB = await prisma.board.create({ data: { name: "B", ownerId: owner.id } });

    const socketA = await connect(
      mintConnectionTicket({ purpose: "board-chat", userId: owner.id, boardId: boardA.id, role: "owner", anonymous: false }),
    );
    const socketB = await connect(
      mintConnectionTicket({ purpose: "board-chat", userId: owner.id, boardId: boardB.id, role: "owner", anonymous: false }),
    );
    let socketBReceived = false;
    socketB.on("message", () => {
      socketBReceived = true;
    });

    socketA.send(JSON.stringify({ type: "send", content: "only for A" }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(socketBReceived).toBe(false);
    socketA.close();
    socketB.close();
  });

  it("rejects a connection with an invalid ticket", async () => {
    const socket = new WebSocket(`${baseUrl}?ticket=garbage`);
    const closeCode = await new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
    expect(closeCode).toBe(4401);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `server/`): `npx vitest run src/boardChat/wsGateway.test.ts`
Expected: FAIL — `./wsGateway.js` doesn't exist yet.

- [ ] **Step 3: Implement `wsGateway.ts`**

```ts
import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { sendBoardMessageSchema, type BoardChatClientEvent, type BoardChatServerEvent } from "@cursive/shared";
import { verifyConnectionTicket } from "../authorization/connectionTicket.js";
import { canPostBoardChat } from "./authorization.js";
import { recordBoardMessage } from "./messages.js";
import { chatPubSub } from "../chat/pubsub.js";

function boardChannel(boardId: string): string {
  return `board-chat:${boardId}`;
}

function send(socket: WebSocket, event: BoardChatServerEvent): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}

export const boardChatWss = new WebSocketServer({ noServer: true });

boardChatWss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
  const { searchParams } = new URL(request.url ?? "", "http://localhost");
  const payload = verifyConnectionTicket(searchParams.get("ticket") ?? "");

  if (!payload || payload.purpose !== "board-chat") {
    socket.close(4401, "Not authorized");
    return;
  }

  const unsubscribe = chatPubSub.subscribe(boardChannel(payload.boardId), (event) =>
    send(socket, event as BoardChatServerEvent),
  );

  socket.on("message", async (raw) => {
    let event: BoardChatClientEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Malformed event" });
      return;
    }

    if (event.type !== "send") return;

    if (!canPostBoardChat(payload)) {
      send(socket, { type: "error", message: "Log in to chat" });
      return;
    }

    const parsed = sendBoardMessageSchema.safeParse({ content: event.content });
    if (!parsed.success) {
      send(socket, { type: "error", message: "Invalid message" });
      return;
    }

    try {
      const message = await recordBoardMessage(payload.boardId, payload.userId, parsed.data.content);
      chatPubSub.publish(boardChannel(payload.boardId), { type: "message", message } satisfies BoardChatServerEvent);
    } catch (err) {
      console.error(err);
      send(socket, { type: "error", message: "Something went wrong" });
    }
  });

  socket.on("close", unsubscribe);
});
```

- [ ] **Step 4: Wire `/board-chat` into the upgrade router**

In `server/src/ws/router.ts`, add the import:

```ts
import { boardChatWss } from "../boardChat/wsGateway.js";
```

And add this branch inside `createUpgradeHandler`'s returned function, after the existing `/chat` branch and before `socket.destroy()`:

```ts
    if (pathname === "/board-chat") {
      boardChatWss.handleUpgrade(request, socket, head, (ws) => {
        boardChatWss.emit("connection", ws, request);
      });
      return;
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `server/`): `npx vitest run src/boardChat/wsGateway.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full server test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/boardChat/wsGateway.ts server/src/boardChat/wsGateway.test.ts server/src/ws/router.ts
git commit -m "Add board chat WebSocket gateway"
```

---

### Task 10: Board chat REST routes (ticket + history)

**Files:**
- Modify: `server/src/routes/boards.routes.ts`

**Interfaces:**
- Consumes: `visitorIdentity` (Task 6), `mintConnectionTicket` (Task 3), `listBoardMessages` (Task 7).
- Produces: `GET /:boardId/chat/ticket`, `GET /:boardId/chat/messages?before=` — Task 14's `useBoardChatSocket` calls these exact paths.

- [ ] **Step 1: Add the import**

Add `listBoardMessages` to `boards.routes.ts`'s imports:

```ts
import { listBoardMessages } from "../boardChat/messages.js";
```

- [ ] **Step 2: Add the two routes**

Add these anywhere after the call-token route:

```ts
boardsRouter.get("/:boardId/chat/ticket", requireBoardRole("viewer"), async (req, res) => {
  const ticket = mintConnectionTicket({
    purpose: "board-chat",
    userId: visitorIdentity(req, res),
    anonymous: res.locals.anonymous as boolean,
    boardId: req.params.boardId,
    role: res.locals.boardRole as BoardRole,
  });
  res.json({ ticket });
});

boardsRouter.get("/:boardId/chat/messages", requireBoardRole("viewer"), async (req, res) => {
  const before = typeof req.query.before === "string" ? req.query.before : undefined;
  const messages = await listBoardMessages(req.params.boardId, before);
  res.json(messages);
});
```

- [ ] **Step 3: Run the server test suite**

Run (from `server/`): `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/boards.routes.ts
git commit -m "Add board chat ticket and message history routes"
```

---

### Task 11: Client API layer — share-link headers

**Files:**
- Modify: `client/src/api/client.ts`
- Create: `client/src/viewer/shareContext.ts`

**Interfaces:**
- Produces: `api.get/post/delete` now accept an optional `RequestInit` (for custom headers), and `ShareRequestContext` (`{ shareToken?, anonId?, anonName? }`) + `shareHeaders(ctx?): HeadersInit | undefined` — every hook in Tasks 12–14 imports `ShareRequestContext`/`shareHeaders` from `client/src/viewer/shareContext.ts`.

- [ ] **Step 1: Extend the api client to accept extra `RequestInit`**

Replace `client/src/api/client.ts`'s `api` export with:

```ts
export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, init),
  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "DELETE" }),
};
```

(Leave `ApiError` and `request` themselves untouched — `request` already spreads `init` and merges `init?.headers`, so this is purely widening the public surface.)

- [ ] **Step 2: Write `shareContext.ts`**

```ts
export interface ShareRequestContext {
  shareToken?: string;
  /** A stable per-browser id for a not-logged-in visitor — see useAnonIdentity.ts. */
  anonId?: string;
  /** The display name a not-logged-in visitor picked — see useAnonIdentity.ts. */
  anonName?: string;
}

/**
 * Builds the headers requireBoardRole (server) reads to resolve a share-link
 * visitor: X-Share-Token identifies which board's public link this is,
 * X-Anon-Id/X-Anon-Name only matter for a visitor with no session at all.
 * Returns undefined for the normal authenticated case (no shareToken) so
 * existing api.get/post calls that never pass a ShareRequestContext are
 * unaffected.
 */
export function shareHeaders(ctx?: ShareRequestContext): HeadersInit | undefined {
  if (!ctx?.shareToken) return undefined;
  const headers: Record<string, string> = { "X-Share-Token": ctx.shareToken };
  if (ctx.anonId) headers["X-Anon-Id"] = ctx.anonId;
  if (ctx.anonName) headers["X-Anon-Name"] = ctx.anonName;
  return headers;
}
```

- [ ] **Step 3: Run the client test suite**

Run (from `client/`): `npm test`
Expected: PASS (no existing test touches these files' old behavior)

- [ ] **Step 4: Commit**

```bash
git add client/src/api/client.ts client/src/viewer/shareContext.ts
git commit -m "Let the API client attach share-link headers"
```

---

### Task 12: Thread share context through the Yjs and call hooks

**Files:**
- Modify: `client/src/canvas/yjs/hocuspocusProvider.ts`
- Modify: `client/src/canvas/yjs/useYjsDocument.ts`
- Modify: `client/src/call/useCall.ts`
- Modify: `client/src/env.ts`

**Interfaces:**
- Consumes: `ShareRequestContext`/`shareHeaders` (Task 11).
- Produces: `createHocuspocusProvider(boardId, document, shareContext?)`, `useYjsDocument(roomId, shareContext?)`, `useCall(boardId, canPublish, shareContext?)` — all backward compatible (existing call sites that omit the new param are unaffected). `env.BOARD_CHAT_SOCKET_URL` — Task 14 depends on it.

- [ ] **Step 1: Add the board-chat socket URL to `env.ts`**

Add this line to the `env` object in `client/src/env.ts`:

```ts
  BOARD_CHAT_SOCKET_URL: (import.meta.env.VITE_BOARD_CHAT_SOCKET_URL as string | undefined) ?? "ws://localhost:4000/board-chat",
```

- [ ] **Step 2: Thread `shareContext` through `hocuspocusProvider.ts`**

Replace its contents with:

```ts
import { HocuspocusProvider } from "@hocuspocus/provider";
import type * as Y from "yjs";
import { env } from "../../env.js";
import { api } from "../../api/client.js";
import { shareHeaders, type ShareRequestContext } from "../../viewer/shareContext.js";

export function createHocuspocusProvider(boardId: string, document: Y.Doc, shareContext?: ShareRequestContext) {
  return new HocuspocusProvider({
    url: env.SYNC_URL,
    name: boardId,
    document,
    // Fetched fresh on every (re)connect attempt rather than passed once —
    // tickets are short-lived on purpose, see server/src/authorization/connectionTicket.ts.
    token: async () => {
      const { ticket } = await api.get<{ ticket: string }>(`/api/boards/${boardId}/sync-ticket`, {
        headers: shareHeaders(shareContext),
      });
      return ticket;
    },
  });
}
```

- [ ] **Step 3: Thread `shareContext` through `useYjsDocument.ts`**

Replace its contents with:

```ts
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { createHocuspocusProvider } from "./hocuspocusProvider.js";
import type { ShareRequestContext } from "../../viewer/shareContext.js";

export function useYjsDocument(roomId: string, shareContext?: ShareRequestContext) {
  const doc = useMemo(() => new Y.Doc(), [roomId]);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    const nextProvider = createHocuspocusProvider(roomId, doc, shareContext);
    setProvider(nextProvider);

    // Only tear down the socket connection here, not the Y.Doc itself —
    // React 18 StrictMode runs this cleanup and then re-runs the effect
    // once in development, and a destroyed Y.Doc can't be reused.
    return () => {
      nextProvider.destroy();
    };
  }, [roomId, doc, shareContext?.shareToken, shareContext?.anonId, shareContext?.anonName]);

  return { doc, provider };
}
```

- [ ] **Step 4: Thread `shareContext` through `useCall.ts`**

In `client/src/call/useCall.ts`:
- Add the import: `import { shareHeaders, type ShareRequestContext } from "../viewer/shareContext.js";`
- Change the function signature to `export function useCall(boardId: string, canPublish: boolean, shareContext?: ShareRequestContext) {`
- In the `join` callback, change the token fetch line to:
  ```ts
  const { token, url } = await api.get<CallTokenResponse>(`/api/boards/${boardId}/call-token`, {
    headers: shareHeaders(shareContext),
  });
  ```
- Add `shareContext` to `join`'s `useCallback` dependency array: `[boardId, canPublish, isJoined, syncParticipants, shareContext]`

- [ ] **Step 5: Run the client test suite**

Run (from `client/`): `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/canvas/yjs/hocuspocusProvider.ts client/src/canvas/yjs/useYjsDocument.ts client/src/call/useCall.ts client/src/env.ts
git commit -m "Thread share-link context through Yjs and call connection hooks"
```

---

### Task 13: Anonymous identity + share-link lookup hooks

**Files:**
- Create: `client/src/viewer/useAnonIdentity.ts`
- Create: `client/src/viewer/useShareLink.ts`

**Interfaces:**
- Consumes: `ShareLinkInfo` (Task 2), `api`/`ApiError` (existing client).
- Produces: `useAnonIdentity(shareToken): { anonId: string; anonName: string | null; setAnonName(name): void }`, `useShareLink(shareToken): { info: ShareLinkInfo | null; notFound: boolean; loading: boolean }` — Task 17's `WatchPage` depends on both.

- [ ] **Step 1: Write `useAnonIdentity.ts`**

```ts
import { useState } from "react";

function storageKey(shareToken: string, field: "id" | "name"): string {
  return `cursive:anon:${shareToken}:${field}`;
}

/**
 * A not-logged-in share-link visitor's stable per-browser identity: a random
 * id (so their cursor/chat identity is stable across reconnects) and a
 * self-chosen display name (prompted once, see WatchPage.tsx), both kept in
 * localStorage scoped to this specific share link.
 */
export function useAnonIdentity(shareToken: string) {
  const [anonId] = useState<string>(() => {
    const existing = localStorage.getItem(storageKey(shareToken, "id"));
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(storageKey(shareToken, "id"), created);
    return created;
  });
  const [anonName, setAnonNameState] = useState<string | null>(() => localStorage.getItem(storageKey(shareToken, "name")));

  const setAnonName = (name: string) => {
    localStorage.setItem(storageKey(shareToken, "name"), name);
    setAnonNameState(name);
  };

  return { anonId, anonName, setAnonName };
}
```

- [ ] **Step 2: Write `useShareLink.ts`**

```ts
import { useEffect, useState } from "react";
import type { ShareLinkInfo } from "@cursive/shared";
import { api, ApiError } from "../api/client.js";

export function useShareLink(shareToken: string) {
  const [info, setInfo] = useState<ShareLinkInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ShareLinkInfo>(`/api/boards/by-share/${shareToken}`)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  return { info, notFound, loading };
}
```

- [ ] **Step 3: Run the client test suite**

Run (from `client/`): `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/viewer/useAnonIdentity.ts client/src/viewer/useShareLink.ts
git commit -m "Add anonymous identity and share-link lookup hooks"
```

---

### Task 14: Board chat panel + socket hook

**Files:**
- Create: `client/src/boardChat/useBoardChatSocket.ts`
- Create: `client/src/boardChat/BoardChatPanel.tsx`
- Create: `client/src/boardChat/BoardChatPanel.test.tsx`

**Interfaces:**
- Consumes: `BoardChatMessage`, `BoardChatClientEvent`, `BoardChatServerEvent` (Task 2), `ShareRequestContext`/`shareHeaders` (Task 11), `env.BOARD_CHAT_SOCKET_URL` (Task 12).
- Produces: `useBoardChatSocket(boardId, shareContext?): { messages, hasMore, loading, loadMore, sendMessage }`, `<BoardChatPanel messages canPost onSend onReachTop />` (purely presentational — Task 15's `BoardExperience` owns wiring the two together, mirroring how `ChatPage` wires `useChatSocket` to `MessageList`/`MessageInput`).

- [ ] **Step 1: Write `useBoardChatSocket.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardChatClientEvent, BoardChatMessage, BoardChatServerEvent } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";
import { shareHeaders, type ShareRequestContext } from "../viewer/shareContext.js";

const RECONNECT_DELAY_MS = 2000;
const PAGE_SIZE = 30;

export function useBoardChatSocket(boardId: string, shareContext?: ShareRequestContext) {
  const [messages, setMessages] = useState<BoardChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      const { ticket } = await api.get<{ ticket: string }>(`/api/boards/${boardId}/chat/ticket`, {
        headers: shareHeaders(shareContext),
      });
      if (cancelled) return;

      socket = new WebSocket(`${env.BOARD_CHAT_SOCKET_URL}?ticket=${ticket}`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const data: BoardChatServerEvent = JSON.parse(event.data);
        if (data.type === "message") {
          setMessages((current) => [...current, data.message]);
        }
      };

      // The server can drop a connection for reasons unrelated to the user
      // (a deploy, a restart) — reconnect instead of leaving sendMessage
      // silently writing into a dead socket until a page reload.
      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [boardId, shareContext?.shareToken, shareContext?.anonId, shareContext?.anonName]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const oldest = messages[0];
      const query = oldest ? `?before=${oldest.id}` : "";
      const page = await api.get<BoardChatMessage[]>(`/api/boards/${boardId}/chat/messages${query}`, {
        headers: shareHeaders(shareContext),
      });
      const newMessages = page.slice().reverse();
      setMessages((current) => {
        const existingIds = new Set(current.map((m) => m.id));
        const deduped = newMessages.filter((m) => !existingIds.has(m.id));
        return [...deduped, ...current];
      });
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [boardId, messages, loading, shareContext]);

  const sendMessage = useCallback((content: string) => {
    const event: BoardChatClientEvent = { type: "send", content };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  return { messages, hasMore, loading, loadMore, sendMessage };
}
```

- [ ] **Step 2: Write the failing component test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BoardChatPanel } from "./BoardChatPanel.js";

const sampleMessage = {
  id: "m1",
  boardId: "b1",
  authorId: "u1",
  authorName: "Alice",
  content: "hello",
  createdAt: new Date().toISOString(),
};

describe("BoardChatPanel", () => {
  it("renders each message with its author name", () => {
    render(<BoardChatPanel messages={[sampleMessage]} canPost={true} onSend={vi.fn()} onReachTop={vi.fn()} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("lets a logged-in visitor send a message", () => {
    const onSend = vi.fn();
    render(<BoardChatPanel messages={[]} canPost={true} onSend={onSend} onReachTop={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Chat message"), { target: { value: "hey" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hey");
  });

  it("shows a log-in prompt instead of an input for an anonymous visitor", () => {
    render(<BoardChatPanel messages={[]} canPost={false} onSend={vi.fn()} onReachTop={vi.fn()} />);
    expect(screen.queryByLabelText("Chat message")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `client/`): `npx vitest run src/boardChat/BoardChatPanel.test.tsx`
Expected: FAIL — `./BoardChatPanel.js` doesn't exist yet.

- [ ] **Step 4: Implement `BoardChatPanel.tsx`**

```tsx
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardChatMessage } from "@cursive/shared";

interface Props {
  messages: BoardChatMessage[];
  canPost: boolean;
  onSend: (content: string) => void;
  onReachTop: () => void;
}

export function BoardChatPanel({ messages, canPost, onSend, onReachTop }: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  };

  return (
    <div style={{ width: 300, borderLeft: "1px solid #e0e0e0", display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #e0e0e0" }}>
        <strong>Chat</strong>
      </div>
      <div
        ref={listRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop === 0) onReachTop();
        }}
        style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
      >
        {messages.map((m) => (
          <div key={m.id} style={{ fontSize: 13 }}>
            <strong>{m.authorName ?? "Someone"}</strong> <span>{m.content}</span>
          </div>
        ))}
      </div>
      {canPost ? (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e0e0e0" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something…"
            aria-label="Chat message"
            style={{ flex: 1 }}
          />
          <button type="submit">Send</button>
        </form>
      ) : (
        <div style={{ padding: 12, borderTop: "1px solid #e0e0e0", fontSize: 13, color: "#868e96" }}>
          <a href="/login">Log in</a> to chat
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `client/`): `npx vitest run src/boardChat/BoardChatPanel.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add client/src/boardChat/useBoardChatSocket.ts client/src/boardChat/BoardChatPanel.tsx client/src/boardChat/BoardChatPanel.test.tsx
git commit -m "Add board chat socket hook and Twitch-style chat panel"
```

---

### Task 15: Extract `BoardExperience` and refactor `Board.tsx`

**Files:**
- Create: `client/src/canvas/BoardExperience.tsx`
- Modify: `client/src/canvas/Board.tsx`

**Interfaces:**
- Consumes: `useYjsDocument` (Task 12), `useCall` (Task 12), `useBoardChatSocket`/`BoardChatPanel` (Task 14), existing `useYShapes`, `useAwareness`, `useActiveTool`, `PresenceList`, `CanvasStage`, `JoinCallButton`, `CallStrip`, `colorForUser`.
- Produces: `<BoardExperience boardId role userId userName shareContext? onMembershipChanged? onBoardDeleted? />` — Task 17's `WatchPage` depends on this exact prop shape.

**Note:** this moves the Join-Call button and presence list out of `Board.tsx`'s top app bar into a row `BoardExperience` renders directly above the canvas (so `WatchPage`, which has no owner top bar at all, still gets them). This is a small, deliberate layout change from what exists today — call it out during the manual verification pass (Task 18) in case it needs visual polish.

- [ ] **Step 1: Write `BoardExperience.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { useYjsDocument } from "./yjs/useYjsDocument.js";
import { useYShapes } from "./yjs/useYShapes.js";
import { useAwareness } from "./yjs/useAwareness.js";
import { useActiveTool } from "./tools/useActiveTool.js";
import { PresenceList } from "./cursors/PresenceList.js";
import { CanvasStage } from "./Stage.js";
import { colorForUser } from "./presenceColors.js";
import { useCall } from "../call/useCall.js";
import { JoinCallButton } from "../call/JoinCallButton.js";
import { CallStrip } from "../call/CallStrip.js";
import { useBoardChatSocket } from "../boardChat/useBoardChatSocket.js";
import { BoardChatPanel } from "../boardChat/BoardChatPanel.js";
import type { ShareRequestContext } from "../viewer/shareContext.js";

interface Props {
  boardId: string;
  role: BoardRole;
  /** The real session user id, or null for a fully anonymous share-link visitor. */
  userId: string | null;
  userName: string;
  /** Present only when reached via a public /watch/:shareToken link. */
  shareContext?: ShareRequestContext;
  onMembershipChanged?: () => void;
  onBoardDeleted?: () => void;
}

/**
 * The canvas + live presence + call + chat experience shared by the
 * authenticated editing page (Board.tsx) and the public watch page
 * (viewer/WatchPage.tsx) — everything except each page's own top-bar chrome
 * (owner controls vs. a plain "watching via public link" banner).
 */
export function BoardExperience({ boardId, role, userId, userName, shareContext, onMembershipChanged, onBoardDeleted }: Props) {
  const { doc, provider } = useYjsDocument(boardId, shareContext);
  const { shapes, addShape, updateShape, removeShape } = useYShapes(doc);
  const preferredColor = useMemo(() => colorForUser(userId ?? "guest"), [userId]);
  const isViewer = role === "viewer";

  const { peers, viewerPeers, updateCursor, setInCall, callParticipantCount, localPresence } = useAwareness(
    provider,
    userName,
    preferredColor,
    role,
  );
  const { tool } = useActiveTool();
  const canPublish = roleAtLeast(role, "collaborator");
  const { isJoined, participants, join, leave, toggleCamera, toggleMic } = useCall(boardId, canPublish, shareContext);
  const [callError, setCallError] = useState<string | null>(null);

  useEffect(() => {
    setInCall(canPublish && isJoined);
  }, [canPublish, isJoined]);

  const handleJoinCall = async () => {
    setCallError(null);
    try {
      await join();
    } catch {
      setCallError("Couldn't join the call. Check your connection and try again.");
    }
  };
  const handleLeaveCall = () => leave();

  // Viewers (invited or share-link, logged in or anonymous) have no Join
  // Call button — they auto-watch/listen whenever a collaborator/owner is
  // actually in a call, and auto-disconnect the moment none are.
  useEffect(() => {
    if (canPublish) return;
    if (callParticipantCount > 0 && !isJoined) {
      join().catch(() => {});
    } else if (callParticipantCount === 0 && isJoined) {
      leave();
    }
  }, [canPublish, callParticipantCount, isJoined, join, leave]);

  useEffect(() => {
    if (!provider) return;
    const onStateless = ({ payload }: { payload: string }) => {
      try {
        const message = JSON.parse(payload);
        if (message?.type === "membership-changed") onMembershipChanged?.();
        if (message?.type === "board-deleted") onBoardDeleted?.();
      } catch {
        // ignore malformed/unrelated stateless payloads
      }
    };
    provider.on("stateless", onStateless);
    return () => {
      provider.off("stateless", onStateless);
    };
  }, [provider, onMembershipChanged, onBoardDeleted]);

  const { messages: chatMessages, loadMore: loadMoreChat, sendMessage: sendChatMessage } = useBoardChatSocket(
    boardId,
    shareContext,
  );
  useEffect(() => {
    loadMoreChat();
    // Only ever load the initial page once per board — pagination past that
    // is user-triggered via BoardChatPanel's onReachTop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "center", padding: 8 }}>
          {canPublish && (
            <JoinCallButton
              isJoined={isJoined}
              othersInCallCount={callParticipantCount}
              onJoin={handleJoinCall}
              onLeave={handleLeaveCall}
            />
          )}
          {callError && <span style={{ fontSize: 12, color: "#e03131" }}>{callError}</span>}
          <PresenceList self={localPresence} peers={peers} viewerPeers={viewerPeers} />
        </div>
        {isJoined && (
          <CallStrip
            participants={participants}
            canPublish={canPublish}
            micEnabled={participants.find((p) => p.isLocal)?.micEnabled ?? false}
            cameraEnabled={participants.find((p) => p.isLocal)?.cameraEnabled ?? false}
            onToggleMic={toggleMic}
            onToggleCamera={toggleCamera}
            onLeave={handleLeaveCall}
          />
        )}
        <div style={{ flex: 1 }}>
          <CanvasStage
            shapes={shapes}
            peers={peers}
            activeTool={tool}
            readOnly={isViewer}
            onAddShape={addShape}
            onUpdateShape={updateShape}
            onRemoveShape={removeShape}
            onCursorMove={updateCursor}
          />
        </div>
      </div>
      <BoardChatPanel
        messages={chatMessages}
        canPost={userId !== null}
        onSend={sendChatMessage}
        onReachTop={loadMoreChat}
      />
    </div>
  );
}
```

- [ ] **Step 2: Refactor `Board.tsx` to use it**

Replace `Board.tsx`'s contents with:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Toolbar } from "./tools/Toolbar.js";
import { ActiveToolProvider } from "./tools/useActiveTool.js";
import { InviteMemberDialog } from "./InviteMemberDialog.js";
import { ShareBoardDialog } from "./ShareBoardDialog.js";
import { BoardExperience } from "./BoardExperience.js";
import { useBoard } from "./useBoard.js";
import { useSession } from "../auth/authClient.js";

function BoardDeletedOverlay() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 18, margin: 0 }}>The owner deleted this board.</p>
      <Link to="/dashboard">
        <button type="button">Go back to dashboard</button>
      </Link>
    </div>
  );
}

function BoardInner({ roomId }: { roomId: string }) {
  const { data: session } = useSession();
  const { board, error: boardError, refresh: refreshBoard } = useBoard(roomId);
  const [boardDeleted, setBoardDeleted] = useState(false);
  const [membershipVersion, setMembershipVersion] = useState(0);

  const userId = session?.user.id ?? null;
  const userName = session?.user.name || session?.user.email || "Guest";
  const isViewer = board?.role === "viewer";

  // If we no longer have access — e.g. the owner just removed us — bounce
  // back to the dashboard automatically. Board *deletion* is handled
  // separately below with an explicit message instead of a silent redirect.
  useEffect(() => {
    if (boardError && !boardDeleted) {
      window.location.href = "/dashboard";
    }
  }, [boardError, boardDeleted]);

  if (boardDeleted) return <BoardDeletedOverlay />;
  if (!board) return <p style={{ padding: 24 }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 8,
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link to="/dashboard">← Boards</Link>
          <strong>{board.name}</strong>
          {isViewer ? <span style={{ fontSize: 12, color: "#868e96" }}>👀 Viewing only</span> : <Toolbar />}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {board.role === "owner" && <ShareBoardDialog boardId={roomId} />}
          {board.role === "owner" && <InviteMemberDialog boardId={roomId} membershipVersion={membershipVersion} />}
        </div>
      </div>
      <BoardExperience
        boardId={roomId}
        role={board.role}
        userId={userId}
        userName={userName}
        onMembershipChanged={() => {
          refreshBoard();
          setMembershipVersion((v) => v + 1);
        }}
        onBoardDeleted={() => setBoardDeleted(true)}
      />
    </div>
  );
}

export function Board({ roomId }: { roomId: string }) {
  return (
    <ActiveToolProvider>
      <BoardInner roomId={roomId} />
    </ActiveToolProvider>
  );
}
```

(`ShareBoardDialog` doesn't exist yet — that's Task 16, which comes right after this one; `Board.tsx` won't compile standalone until then, which is fine since these commit as one deliberate sequence.)

- [ ] **Step 3: Commit**

```bash
git add client/src/canvas/BoardExperience.tsx client/src/canvas/Board.tsx
git commit -m "Extract BoardExperience so the editing page and watch page can share it"
```

---

### Task 16: Share dialog (owner controls)

**Files:**
- Create: `client/src/canvas/useBoardShare.ts`
- Create: `client/src/canvas/ShareBoardDialog.tsx`

**Interfaces:**
- Consumes: `ShareLinkState` (Task 2), existing `api` client.
- Produces: `<ShareBoardDialog boardId />` — referenced by `Board.tsx` (Task 15).

- [ ] **Step 1: Write `useBoardShare.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import type { ShareLinkState } from "@cursive/shared";
import { api } from "../api/client.js";

export function useBoardShare(boardId: string) {
  const [state, setState] = useState<ShareLinkState>({ enabled: false, token: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.get<ShareLinkState>(`/api/boards/${boardId}/share`);
    setState(data);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setState(await api.post<ShareLinkState>(`/api/boards/${boardId}/share/enable`));
  }, [boardId]);

  const disable = useCallback(async () => {
    setState(await api.post<ShareLinkState>(`/api/boards/${boardId}/share/disable`));
  }, [boardId]);

  const regenerate = useCallback(async () => {
    setState(await api.post<ShareLinkState>(`/api/boards/${boardId}/share/regenerate`));
  }, [boardId]);

  return { ...state, loading, enable, disable, regenerate };
}
```

- [ ] **Step 2: Write `ShareBoardDialog.tsx`**

```tsx
import { useRef } from "react";
import { useBoardShare } from "./useBoardShare.js";

export function ShareBoardDialog({ boardId }: { boardId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { enabled, token, loading, enable, disable, regenerate } = useBoardShare(boardId);
  const url = token ? `${window.location.origin}/watch/${token}` : null;

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        Share
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 320 }}>
          <h3 style={{ margin: 0 }}>Public watch link</h3>
          {loading ? (
            <p style={{ margin: 0, color: "#868e96" }}>Loading…</p>
          ) : enabled && url ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#868e96" }}>
                Anyone with this link can watch this board's canvas and call, and read chat. Logged-in visitors can
                also chat.
              </p>
              <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ width: "100%" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={regenerate}>
                  Regenerate link
                </button>
                <button type="button" onClick={disable}>
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#868e96" }}>
                Turn this on to get a public link anyone can use to watch this board, no account required.
              </p>
              <button type="button" onClick={enable}>
                Enable public link
              </button>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 3: Run the client test suite**

Run (from `client/`): `npm test`
Expected: PASS — this also confirms `Board.tsx` from Task 15 now compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add client/src/canvas/useBoardShare.ts client/src/canvas/ShareBoardDialog.tsx
git commit -m "Add owner-facing share link dialog"
```

---

### Task 17: Public watch page + route

**Files:**
- Create: `client/src/viewer/WatchPage.tsx`
- Modify: `client/src/router.tsx`

**Interfaces:**
- Consumes: `useShareLink` (Task 13), `useAnonIdentity` (Task 13), `BoardExperience` (Task 15), existing `useSession`.
- Produces: the `/watch/:shareToken` route.

- [ ] **Step 1: Write `WatchPage.tsx`**

```tsx
import { Navigate, useParams } from "react-router-dom";
import { ActiveToolProvider } from "../canvas/tools/useActiveTool.js";
import { BoardExperience } from "../canvas/BoardExperience.js";
import { useSession } from "../auth/authClient.js";
import { useShareLink } from "./useShareLink.js";
import { useAnonIdentity } from "./useAnonIdentity.js";

function LinkNotActive() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <p style={{ fontSize: 18, margin: 0 }}>This link isn't active.</p>
      <a href="/login">Log in</a>
    </div>
  );
}

function AnonNamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <p style={{ margin: 0 }}>What should we call you in chat?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim();
          if (input) onSubmit(input);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input name="name" placeholder="Guest name" required />
        <button type="submit">Continue</button>
      </form>
    </div>
  );
}

export function WatchPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { data: session, isPending } = useSession();
  const { info, notFound, loading } = useShareLink(shareToken!);
  const { anonId, anonName, setAnonName } = useAnonIdentity(shareToken!);

  if (isPending || loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (notFound) return <LinkNotActive />;
  if (!info) return null;
  // Already a real member (owner/collaborator/invited viewer) — the share
  // link is only a fallback entry point, not a second way to view a board
  // you already belong to.
  if (info.hasMembership) return <Navigate to={`/board/${info.boardId}`} replace />;

  const userId = session?.user?.id ?? null;
  const userName = userId ? session?.user.name || session?.user.email || "Guest" : anonName;

  if (!userId && !anonName) {
    return <AnonNamePrompt onSubmit={setAnonName} />;
  }

  return (
    <ActiveToolProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 8,
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <strong>{info.boardName}</strong>
          <span style={{ fontSize: 12, color: "#868e96" }}>👀 Watching via public link</span>
        </div>
        <BoardExperience
          boardId={info.boardId}
          role="viewer"
          userId={userId}
          userName={userName ?? "Guest"}
          shareContext={{ shareToken: shareToken!, anonId, anonName: anonName ?? undefined }}
        />
      </div>
    </ActiveToolProvider>
  );
}
```

- [ ] **Step 2: Add the route**

In `client/src/router.tsx`, add the import:

```ts
import { WatchPage } from "./viewer/WatchPage.js";
```

And add this route (outside `RequireAuth` — the whole point is no account needed) anywhere among the top-level `<Route>` entries, e.g. right after the `/signup` route:

```tsx
<Route path="/watch/:shareToken" element={<WatchPage />} />
```

- [ ] **Step 3: Run the client test suite**

Run (from `client/`): `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/viewer/WatchPage.tsx client/src/router.tsx
git commit -m "Add the public /watch/:shareToken page"
```

---

### Task 18: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm both workspaces build clean**

Run (from the repo root): `npm run -w server test && npm run -w client test`
Expected: PASS across both workspaces.

- [ ] **Step 2: Dispatch the `multiplayer-sim-tester` subagent**

Ask it to simulate, against the local dev server (already running, started by the user per this repo's convention):
- An owner enabling sharing on a board, then a simulated anonymous client connecting via the share token — confirm its Yjs connection is read-only (a simulated draw attempt from it never lands), it shows up in `viewerPeers`, and a `board-chat` "send" event from it is rejected server-side and never persisted (query `BoardMessage` after to confirm zero rows from that connection).
- A second simulated client that authenticates normally (a real session, no board membership) connecting via the same share token — confirm it *can* post to board chat and that the message persists.

- [ ] **Step 3: Manual browser walkthrough (you)**

Since this repo has no automated UI/E2E harness, this needs a real browser pass once the dev servers are up:
1. Open a board you own, click **Share**, **Enable public link**, copy the URL.
2. Open that URL in an incognito window — confirm the canvas is read-only, you're prompted for a guest name, and you show up in the presence list once you enter one.
3. In a second incognito window, log in as a different real account (not a board member) and open the same link — confirm it does *not* redirect to `/board/:id` (no membership), and that its chat input is enabled (unlike the anonymous window's "Log in to chat" prompt).
4. Start a call as the owner — confirm both incognito windows auto-join as subscribe-only.
5. Back in the owner's dialog, click **Regenerate link** — confirm the old URL now shows "This link isn't active" in a fresh tab, while the already-open incognito windows keep working until they naturally reconnect.
6. Report anything that looks or feels off — the design explicitly left room for you to request layout/behavior tweaks here (see Task 15's note about the presence/call-button row moving).

- [ ] **Step 4: Update the roadmap**

Once the manual walkthrough above passes, hand the user this (a doc-only change, but still a commit — let him run it):

```bash
git add docs/ROADMAP.md
git commit -m "Mark Phase 5 (anonymous viewer links) complete"
```

(First edit `docs/ROADMAP.md`'s Phase 5 line from `- [ ]` to `- [x]`, matching the style of the completed Phase 1–4 lines above it.)
