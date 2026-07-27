# Phase 4 — Video Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship camera/mic calls on a board — one self-hosted LiveKit room per board, joined explicitly via a "Join call" button, with viewers restricted to subscribe-only — matching `docs/superpowers/specs/2026-07-14-phase-4-video-calls-design.md`.

**Architecture:** A new `GET /api/boards/:boardId/call-token` route mints a LiveKit `AccessToken` gated by the existing `requireBoardRole("viewer")` middleware, with `canPublish` computed from the same `roleAtLeast` check `hocuspocus.ts` already uses for the canvas's read-only flag. The client's `useCall` hook wraps `livekit-client`'s `Room` to join/leave/publish; a "call in progress" badge reuses the board's existing Yjs `awareness` broadcast (one new `inCall` field) instead of a new channel. Video tiles render in a floating, draggable strip over the canvas — never a fixed sidebar, never inline in the top bar.

**Tech Stack:** `livekit-server-sdk` (server, token minting), `livekit-client` (browser, room/media), self-hosted `livekit/livekit-server` Docker image (dev mode), Vitest for server/client unit tests, manual browser verification for anything involving actual camera/mic/WebRTC (no automated coverage exists for that anywhere in this project).

## Global Constraints

- One LiveKit room per board; room name is the board's `id`. LiveKit auto-creates it on first join and it empties out on its own — nothing on our side manages room lifecycle.
- `canPublish` is computed **only** from `roleAtLeast(role, "collaborator")` via the board's existing role — never a second permission concept.
- Joining a call is **explicit** (a button click) — never automatic on board open, never triggers a camera/mic permission prompt for someone who hasn't clicked Join.
- Screen sharing, recording, and anonymous/link viewers are explicitly out of scope for this phase (see spec's Scope section).
- Follow existing code style: relative imports end in `.js` (ESM + `NodeNext`), Zod schemas live in `shared/src/api/*.schemas.ts` with an inferred `type X = z.infer<...>` export.
- Client-side verification for anything touching real media is manual, in the browser — no client test framework changes are needed to do this (both `client` and `server` already have Vitest configured).

---

### Task 1: LiveKit dev server + server env wiring

**Files:**
- Modify: `docker-compose.yml`
- Modify: `server/.env.example`
- Modify: `server/src/env.ts`
- Modify (local only, not committed): `server/.env`

**Interfaces:**
- Produces: `env.LIVEKIT_URL`, `env.LIVEKIT_API_KEY`, `env.LIVEKIT_API_SECRET` — consumed by Task 2's `mintCallToken`.

This task has no code logic to TDD — it's infrastructure, verified by a running container and a health-check curl, the same non-TDD shape Phase 3's Prisma migration task used.

- [ ] **Step 1: Add the `livekit` service to `docker-compose.yml`**

Add alongside the existing `postgres` service:

```yaml
  livekit:
    image: livekit/livekit-server:latest
    restart: unless-stopped
    command: --dev --bind 0.0.0.0
    ports:
      - "7880:7880"
      - "7881:7881"
      - "50000-60000:50000-60000/udp"
```

`--dev` mode starts LiveKit with a built-in placeholder API key/secret pair (`devkey` / `secret`) — fine for local dev, the same spirit as the Postgres service's hardcoded dev password. Port 7880 is the HTTP/WebSocket signaling port (what the client and our token-minting code both talk to), 7881 is the TCP fallback for WebRTC, and 50000-60000/udp is the real-time media port range — all three are LiveKit's documented minimum self-host requirement.

- [ ] **Step 2: Start it**

Run: `docker compose up -d livekit`
Expected: container starts (or is already running)

- [ ] **Step 3: Verify it's healthy**

Run: `curl -s http://localhost:7880/`
Expected: `OK`

- [ ] **Step 4: Add the server env vars**

In `server/.env.example`, add after the `SYNC_TICKET_SECRET` line:

```
# LiveKit (self-hosted, via docker-compose.yml's livekit service, --dev mode)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

Add the same three lines (with real values — `devkey`/`secret` are fine for local dev) to `server/.env`. `.env` is gitignored — nothing to stage for this file.

- [ ] **Step 5: Add them to the env schema**

In `server/src/env.ts`, add to `envSchema`, after `SYNC_TICKET_SECRET: z.string(),`:

```ts
  LIVEKIT_URL: z.string(),
  LIVEKIT_API_KEY: z.string(),
  LIVEKIT_API_SECRET: z.string(),
```

- [ ] **Step 6: Verify the server still boots**

Run: `npx tsc -p server/tsconfig.json && npm run dev:server`
Expected: no type errors; server starts without an env validation error (confirms `.env` has real values, not just `.env.example`). Stop it with Ctrl+C once you see it's up.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml server/.env.example server/src/env.ts
git commit -m "Add self-hosted LiveKit dev server and server env vars"
```

---

### Task 2: Server — `mintCallToken` (role-gated LiveKit access token)

**Files:**
- Create: `server/src/call/callToken.ts`
- Create: `server/src/call/callToken.test.ts`
- Modify: `server/package.json` (add `livekit-server-sdk` dependency)

**Interfaces:**
- Consumes: `env.LIVEKIT_API_KEY`/`env.LIVEKIT_API_SECRET` (Task 1), `roleAtLeast`/`BoardRole` from `@cursive/shared`.
- Produces: `mintCallToken(params: { userId: string; userName: string; boardId: string; role: BoardRole }): Promise<string>`. Task 3's route calls this.

- [ ] **Step 1: Install the LiveKit server SDK**

```bash
npm install livekit-server-sdk --workspace=server
```

- [ ] **Step 2: Write the failing tests**

```ts
// server/src/call/callToken.test.ts
import { describe, expect, it } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { env } from "../env.js";
import { mintCallToken } from "./callToken.js";

async function verify(token: string) {
  const verifier = new TokenVerifier(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  return verifier.verify(token);
}

describe("mintCallToken", () => {
  it("grants a collaborator publish and subscribe rights on the board's room", async () => {
    const token = await mintCallToken({ userId: "u1", userName: "Alice", boardId: "board-1", role: "collaborator" });
    const grants = await verify(token);

    expect(grants.video?.roomJoin).toBe(true);
    expect(grants.video?.room).toBe("board-1");
    expect(grants.video?.canPublish).toBe(true);
    expect(grants.video?.canSubscribe).toBe(true);
  });

  it("grants an owner publish rights too", async () => {
    const token = await mintCallToken({ userId: "u1", userName: "Alice", boardId: "board-1", role: "owner" });
    const grants = await verify(token);

    expect(grants.video?.canPublish).toBe(true);
  });

  it("restricts a viewer to subscribe-only", async () => {
    const token = await mintCallToken({ userId: "u2", userName: "Bob", boardId: "board-1", role: "viewer" });
    const grants = await verify(token);

    expect(grants.video?.canPublish).toBe(false);
    expect(grants.video?.canSubscribe).toBe(true);
  });

  it("sets the participant identity from userId", async () => {
    const token = await mintCallToken({ userId: "u3", userName: "Carol", boardId: "board-1", role: "owner" });
    const grants = await verify(token);

    expect(grants.sub).toBe("u3");
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

Run: `npm run test --workspace=server`
Expected: FAIL — `Cannot find module './callToken.js'`

- [ ] **Step 4: Implement**

```ts
// server/src/call/callToken.ts
import { AccessToken } from "livekit-server-sdk";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { env } from "../env.js";

/**
 * Mints a LiveKit access token scoped to one board's call room. This is a
 * separate token scheme from authorization/connectionTicket.ts — LiveKit
 * verifies its own JWTs against LIVEKIT_API_KEY/SECRET, not
 * SYNC_TICKET_SECRET — but it's gated the same way every other board
 * connection is: only reachable behind requireBoardRole("viewer"), with
 * publish rights computed from the same roleAtLeast check hocuspocus.ts
 * already uses for the canvas's read-only flag.
 */
export async function mintCallToken(params: {
  userId: string;
  userName: string;
  boardId: string;
  role: BoardRole;
}): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: params.userId,
    name: params.userName,
  });
  at.addGrant({
    roomJoin: true,
    room: params.boardId,
    canPublish: roleAtLeast(params.role, "collaborator"),
    canSubscribe: true,
  });
  return at.toJwt();
}
```

- [ ] **Step 5: Run it, confirm it passes**

Run: `npm run test --workspace=server`
Expected: PASS (4 tests, plus every prior server test)

- [ ] **Step 6: Verify types compile**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add server/src/call/callToken.ts server/src/call/callToken.test.ts server/package.json server/package-lock.json
git commit -m "Add role-gated LiveKit call token minting"
```

---

### Task 3: Server — call-token REST route

**Files:**
- Modify: `server/src/routes/boards.routes.ts`

**Interfaces:**
- Consumes: `mintCallToken` (Task 2), `requireBoardRole` (existing), `prisma` (existing).
- Produces: `GET /api/boards/:boardId/call-token` → `{ token: string; url: string }`.

- [ ] **Step 1: Add the import**

In `server/src/routes/boards.routes.ts`, add alongside the existing `mintConnectionTicket` import:

```ts
import { mintCallToken } from "../call/callToken.js";
```

- [ ] **Step 2: Add the route**

Add directly after the existing `/:boardId/sync-ticket` route:

```ts
/**
 * requireBoardRole only puts userId/boardRole on res.locals (no display
 * name) — look the user up the same way GET /:boardId/members already does
 * (m.user.name) to give LiveKit something to show on the participant's tile.
 */
boardsRouter.get("/:boardId/call-token", requireBoardRole("viewer"), async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: res.locals.userId as string } });
  const token = await mintCallToken({
    userId: res.locals.userId as string,
    userName: user.name ?? user.email,
    boardId: req.params.boardId,
    role: res.locals.boardRole,
  });
  res.json({ token, url: env.LIVEKIT_URL });
});
```

- [ ] **Step 3: Import `env`**

Add to the top of `boards.routes.ts`:

```ts
import { env } from "../env.js";
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc -p server/tsconfig.json`
Expected: no errors

- [ ] **Step 5: Manual curl smoke test**

With both dev servers running (`npm run dev:server`) and `docker compose up -d postgres livekit`, and at least one real signed-up user who owns a board (reuse an account from prior manual testing):

```bash
curl -c a.txt -b a.txt http://localhost:4000/api/boards/<your board id>/call-token
```

Expected: `{"token":"eyJ...","url":"ws://localhost:7880"}`

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/boards.routes.ts
git commit -m "Add GET /:boardId/call-token route"
```

---

### Task 4: Shared — call token response type

**Files:**
- Create: `shared/src/api/call.schemas.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Produces: `callTokenResponseSchema`/`CallTokenResponse { token: string; url: string }`. Task 6's `useCall` imports this.

- [ ] **Step 1: Write the schema**

```ts
// shared/src/api/call.schemas.ts
import { z } from "zod";

export const callTokenResponseSchema = z.object({
  token: z.string(),
  url: z.string(),
});
export type CallTokenResponse = z.infer<typeof callTokenResponseSchema>;
```

- [ ] **Step 2: Export it from the barrel**

Add to `shared/src/index.ts`:

```ts
export * from "./api/call.schemas.js";
```

- [ ] **Step 3: Verify**

Run: `npx tsc -p shared/tsconfig.json`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add shared/src/api/call.schemas.ts shared/src/index.ts
git commit -m "Add shared CallTokenResponse type"
```

---

### Task 5: Client — extend `useAwareness` with call presence

**Files:**
- Modify: `client/src/canvas/yjs/useAwareness.ts`

**Interfaces:**
- Produces: `PresenceState` gains `inCall: boolean`. `useAwareness` return value gains `setInCall(inCall: boolean): void` and `callParticipantCount: number` (count of *other* connected users — any role — with `inCall: true`). Task 8's `Board.tsx` wires both to `useCall`'s `join`/`leave`.

No new test file — this directory (`canvas/yjs/**`) has no existing unit test coverage anywhere in the project (Phase 1 established manual-browser verification as its pattern and it hasn't changed); Task 8 verifies this manually end-to-end.

- [ ] **Step 1: Replace the file**

```ts
// client/src/canvas/yjs/useAwareness.ts
import { useEffect, useRef, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { BoardRole } from "@cursive/shared";
import { pickAvailableColor } from "../presenceColors.js";

export interface PresenceState {
  name: string;
  color: string;
  role: BoardRole;
  cursor: { x: number; y: number } | null;
  inCall: boolean;
}

export function useAwareness(provider: HocuspocusProvider | null, name: string, preferredColor: string, role: BoardRole) {
  const [peers, setPeers] = useState<Map<number, PresenceState>>(new Map());
  const [color, setColor] = useState(preferredColor);
  const [callParticipantCount, setCallParticipantCount] = useState(0);
  // cursor moves constantly, inCall flips rarely — tracked together so
  // setting one field never clobbers the other in the shared "presence" field.
  const localFieldsRef = useRef<{ cursor: { x: number; y: number } | null; inCall: boolean }>({
    cursor: null,
    inCall: false,
  });

  useEffect(() => {
    if (!provider) return;

    const takenColors = new Set<string>();
    provider.awareness?.getStates().forEach((state, clientId) => {
      if (clientId === provider.awareness?.clientID) return;
      const presence = state.presence as PresenceState | undefined;
      if (presence?.color) takenColors.add(presence.color);
    });
    const resolvedColor = pickAvailableColor(preferredColor, takenColors);
    setColor(resolvedColor);
    provider.setAwarenessField("presence", { name, color: resolvedColor, role, ...localFieldsRef.current });

    const sync = () => {
      const states = new Map<number, PresenceState>();
      let othersInCall = 0;
      provider.awareness?.getStates().forEach((state, clientId) => {
        if (clientId === provider.awareness?.clientID) return;
        const presence = state.presence as PresenceState | undefined;
        if (presence?.inCall) othersInCall += 1;
        // Viewers can number in the dozens or hundreds (a broadcast link's
        // audience later on) — the "who's online" list is for people you're
        // actually collaborating with, not everyone watching. Call presence
        // is counted separately above, regardless of role, since a viewer
        // can join a call to watch/listen even though they're hidden here.
        if (presence && presence.role !== "viewer") states.set(clientId, presence);
      });
      setPeers(states);
      setCallParticipantCount(othersInCall);
    };

    sync();
    provider.awareness?.on("change", sync);
    return () => provider.awareness?.off("change", sync);
  }, [provider, name, preferredColor, role]);

  const updateCursor = (cursor: { x: number; y: number } | null) => {
    localFieldsRef.current.cursor = cursor;
    provider?.setAwarenessField("presence", { name, color, role, ...localFieldsRef.current });
  };

  const setInCall = (inCall: boolean) => {
    localFieldsRef.current.inCall = inCall;
    provider?.setAwarenessField("presence", { name, color, role, ...localFieldsRef.current });
  };

  const localPresence: PresenceState = { name, color, role, ...localFieldsRef.current };

  return { peers, updateCursor, setInCall, callParticipantCount, localPresence };
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -p client/tsconfig.json`
Expected: no errors (confirms `PresenceList.tsx` and `Stage.tsx`, which both consume `PresenceState`, still typecheck with the new field)

- [ ] **Step 3: Commit**

```bash
git add client/src/canvas/yjs/useAwareness.ts
git commit -m "Track call presence in board awareness state"
```

---

### Task 6: Client — `useCall` hook

**Files:**
- Create: `client/src/call/useCall.ts`
- Modify: `client/src/env.ts`
- Modify: `client/.env.example` and `client/.env`
- Modify: `client/package.json` (add `livekit-client` dependency)

**Interfaces:**
- Consumes: `CallTokenResponse` (Task 4), `api` (`client/src/api/client.js`), `env.LIVEKIT_URL`.
- Produces: `useCall(boardId: string, canPublish: boolean): { isJoined: boolean; participants: CallParticipant[]; join(): Promise<void>; leave(): void; toggleCamera(): Promise<void>; toggleMic(): Promise<void> }`, `CallParticipant { identity: string; name: string; isLocal: boolean; cameraTrack: Track | null; micEnabled: boolean; cameraEnabled: boolean }`. Task 7 (`CallStrip`) and Task 8 (`Board.tsx`) consume both.

No dedicated test file — this wraps `livekit-client`'s WebRTC `Room`, which can't be meaningfully exercised without a real LiveKit server and real media devices. Verified manually in Task 8.

- [ ] **Step 1: Install the LiveKit client SDK**

```bash
npm install livekit-client --workspace=client
```

- [ ] **Step 2: Add the LiveKit URL to client env**

In `client/src/env.ts`, add:

```ts
LIVEKIT_URL: (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "ws://localhost:7880",
```

In `client/.env.example` and `client/.env`, add:

```
VITE_LIVEKIT_URL=ws://localhost:7880
```

(`client/.env` is gitignored — nothing to stage for it.)

- [ ] **Step 3: Implement the hook**

```ts
// client/src/call/useCall.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { CallTokenResponse } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";

export interface CallParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  cameraTrack: Track | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
}

export function useCall(boardId: string, canPublish: boolean) {
  const roomRef = useRef<Room | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setParticipants([]);
      return;
    }
    const local = room.localParticipant;
    const all: CallParticipant[] = [
      {
        identity: local.identity,
        name: local.name ?? local.identity,
        isLocal: true,
        cameraTrack: local.getTrackPublication(Track.Source.Camera)?.track ?? null,
        micEnabled: local.isMicrophoneEnabled,
        cameraEnabled: local.isCameraEnabled,
      },
      ...Array.from(room.remoteParticipants.values()).map((p) => ({
        identity: p.identity,
        name: p.name ?? p.identity,
        isLocal: false,
        cameraTrack: p.getTrackPublication(Track.Source.Camera)?.track ?? null,
        micEnabled: p.isMicrophoneEnabled,
        cameraEnabled: p.isCameraEnabled,
      })),
    ];
    setParticipants(all);
  }, []);

  const join = useCallback(async () => {
    const { token, url } = await api.get<CallTokenResponse>(`/api/boards/${boardId}/call-token`);
    const room = new Room();
    roomRef.current = room;

    room
      .on(RoomEvent.TrackSubscribed, syncParticipants)
      .on(RoomEvent.TrackUnsubscribed, syncParticipants)
      .on(RoomEvent.ParticipantConnected, syncParticipants)
      .on(RoomEvent.ParticipantDisconnected, syncParticipants)
      .on(RoomEvent.LocalTrackPublished, syncParticipants)
      .on(RoomEvent.LocalTrackUnpublished, syncParticipants)
      .on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setIsJoined(false);
        setParticipants([]);
      });

    await room.connect(url, token);

    if (canPublish) {
      try {
        await room.localParticipant.enableCameraAndMicrophone();
      } catch {
        // Browser denied camera/mic permission — join listen/watch-only
        // instead of failing the whole call.
      }
    }

    setIsJoined(true);
    syncParticipants();
  }, [boardId, canPublish, syncParticipants]);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setIsJoined(false);
    setParticipants([]);
  }, []);

  const toggleCamera = useCallback(async () => {
    const local = roomRef.current?.localParticipant;
    if (!local) return;
    await local.setCameraEnabled(!local.isCameraEnabled);
    syncParticipants();
  }, [syncParticipants]);

  const toggleMic = useCallback(async () => {
    const local = roomRef.current?.localParticipant;
    if (!local) return;
    await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
    syncParticipants();
  }, [syncParticipants]);

  // Covers navigating away from the board mid-call, not just clicking Leave.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  return { isJoined, participants, join, leave, toggleCamera, toggleMic };
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc -p client/tsconfig.json`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add client/src/call/useCall.ts client/src/env.ts client/.env.example client/package.json client/package-lock.json
git commit -m "Add useCall hook wrapping livekit-client Room"
```

---

### Task 7: Client — `JoinCallButton`

**Files:**
- Create: `client/src/call/JoinCallButton.tsx`
- Create: `client/src/call/JoinCallButton.test.tsx`

**Interfaces:**
- Produces: `JoinCallButton({ isJoined: boolean; othersInCallCount: number; onJoin(): void; onLeave(): void })`. Task 9's `Board.tsx` renders this.

- [ ] **Step 1: Write the failing tests**

```tsx
// client/src/call/JoinCallButton.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JoinCallButton } from "./JoinCallButton.js";

describe("JoinCallButton", () => {
  it("shows plain 'Join call' when nobody else is in the call", () => {
    render(<JoinCallButton isJoined={false} othersInCallCount={0} onJoin={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Join call" })).toBeInTheDocument();
  });

  it("shows a live count when others are already in the call", () => {
    render(<JoinCallButton isJoined={false} othersInCallCount={2} onJoin={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Join call · 2" })).toBeInTheDocument();
  });

  it("calls onJoin when clicked before joining", () => {
    const onJoin = vi.fn();
    render(<JoinCallButton isJoined={false} othersInCallCount={0} onJoin={onJoin} onLeave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("shows 'In call' and calls onLeave when clicked after joining", () => {
    const onLeave = vi.fn();
    render(<JoinCallButton isJoined={true} othersInCallCount={1} onJoin={vi.fn()} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole("button", { name: "In call" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm run test --workspace=client`
Expected: FAIL — `Cannot find module './JoinCallButton.js'`

- [ ] **Step 3: Implement**

```tsx
// client/src/call/JoinCallButton.tsx
interface Props {
  isJoined: boolean;
  othersInCallCount: number;
  onJoin: () => void;
  onLeave: () => void;
}

export function JoinCallButton({ isJoined, othersInCallCount, onJoin, onLeave }: Props) {
  if (isJoined) {
    return (
      <button type="button" onClick={onLeave}>
        In call
      </button>
    );
  }

  return (
    <button type="button" onClick={onJoin}>
      Join call{othersInCallCount > 0 ? ` · ${othersInCallCount}` : ""}
    </button>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: `npm run test --workspace=client`
Expected: PASS (4 tests, plus every prior client test)

- [ ] **Step 5: Commit**

```bash
git add client/src/call/JoinCallButton.tsx client/src/call/JoinCallButton.test.tsx
git commit -m "Add JoinCallButton with live participant-count badge"
```

---

### Task 8: Client — `CallStrip`

**Files:**
- Create: `client/src/call/CallStrip.tsx`

**Interfaces:**
- Consumes: `CallParticipant` (Task 6).
- Produces: `CallStrip({ participants: CallParticipant[]; canPublish: boolean; micEnabled: boolean; cameraEnabled: boolean; onToggleMic(): void; onToggleCamera(): void; onLeave(): void })`. Task 9's `Board.tsx` renders this.

No dedicated test file — attaching a LiveKit `Track` to a real `<video>` element only does anything meaningful with a live WebRTC connection. Verified manually in Task 9.

- [ ] **Step 1: Implement**

```tsx
// client/src/call/CallStrip.tsx
import { useEffect, useRef, useState } from "react";
import type { CallParticipant } from "./useCall.js";

function ParticipantTile({ participant }: { participant: CallParticipant }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = participant.cameraTrack;
    const container = containerRef.current;
    if (!track || !container) return;

    const element = track.attach();
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.objectFit = "cover";
    container.appendChild(element);

    return () => {
      track.detach(element);
      element.remove();
    };
  }, [participant.cameraTrack]);

  return (
    <div style={{ width: 120, background: "#1a1a1a", borderRadius: 8, overflow: "hidden", position: "relative" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {!participant.cameraEnabled && <span style={{ color: "#fff", fontSize: 12 }}>{participant.name}</span>}
      </div>
      <div style={{ position: "absolute", bottom: 4, left: 4, fontSize: 11, color: "#fff", textShadow: "0 0 2px #000" }}>
        {participant.name}
        {participant.isLocal ? " (you)" : ""}
        {!participant.micEnabled ? " 🔇" : ""}
      </div>
    </div>
  );
}

interface Props {
  participants: CallParticipant[];
  canPublish: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
}

export function CallStrip({ participants, canPublish, micEnabled, cameraEnabled, onToggleMic, onToggleCamera, onLeave }: Props) {
  const [position, setPosition] = useState({ x: 16, y: 64 });
  const dragOrigin = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      const { startX, startY, originX, originY } = dragOrigin.current;
      setPosition({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
    };
    const onUp = () => {
      dragOrigin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 20,
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 10,
        padding: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div
        onMouseDown={(e) => {
          dragOrigin.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
        }}
        style={{ cursor: "grab", fontSize: 11, color: "#868e96", marginBottom: 6, userSelect: "none" }}
      >
        ⠿ Call
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {participants.map((p) => (
          <ParticipantTile key={p.identity} participant={p} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center" }}>
        {canPublish && (
          <>
            <button type="button" onClick={onToggleMic}>
              {micEnabled ? "Mute" : "Unmute"}
            </button>
            <button type="button" onClick={onToggleCamera}>
              {cameraEnabled ? "Camera off" : "Camera on"}
            </button>
          </>
        )}
        <button type="button" onClick={onLeave}>
          Leave call
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc -p client/tsconfig.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client/src/call/CallStrip.tsx
git commit -m "Add CallStrip: floating, draggable video tile strip"
```

---

### Task 9: Client — wire the call into `Board.tsx`

**Files:**
- Modify: `client/src/canvas/Board.tsx`

**Interfaces:**
- Consumes: `useAwareness`'s `setInCall`/`callParticipantCount` (Task 5), `useCall` (Task 6), `JoinCallButton` (Task 7), `CallStrip` (Task 8), `roleAtLeast` from `@cursive/shared`.

This is the integration task — no new automated test, it's what Task 9's manual pass (below) verifies end-to-end.

- [ ] **Step 1: Add imports**

In `client/src/canvas/Board.tsx`, add:

```ts
import { roleAtLeast } from "@cursive/shared";
import { useCall } from "../call/useCall.js";
import { JoinCallButton } from "../call/JoinCallButton.js";
import { CallStrip } from "../call/CallStrip.js";
```

- [ ] **Step 2: Wire the hooks in `BoardInner`**

Replace the existing `useAwareness` line:

```ts
  const { peers, updateCursor, localPresence } = useAwareness(provider, userName, preferredColor, board?.role ?? "viewer");
```

with:

```ts
  const { peers, updateCursor, setInCall, callParticipantCount, localPresence } = useAwareness(
    provider,
    userName,
    preferredColor,
    board?.role ?? "viewer",
  );
  const canPublish = roleAtLeast(board?.role ?? null, "collaborator");
  const { isJoined, participants, join, leave, toggleCamera, toggleMic } = useCall(roomId, canPublish);
  const [callError, setCallError] = useState<string | null>(null);

  const handleJoinCall = async () => {
    setCallError(null);
    try {
      await join();
      setInCall(true);
    } catch {
      // Token fetch (403/network) or room.connect() failure — surface it
      // next to the button instead of an uncaught rejection and a UI stuck
      // showing "Join call" with nothing having happened.
      setCallError("Couldn't join the call. Check your connection and try again.");
    }
  };
  const handleLeaveCall = () => {
    leave();
    setInCall(false);
  };
```

- [ ] **Step 3: Disconnect the call when access is lost or the board is deleted**

Replace the existing redirect effect:

```ts
  useEffect(() => {
    if (boardError && !boardDeleted) window.location.href = "/dashboard";
  }, [boardError, boardDeleted]);
```

with:

```ts
  useEffect(() => {
    if (boardError && !boardDeleted) {
      handleLeaveCall();
      window.location.href = "/dashboard";
    }
  }, [boardError, boardDeleted]);

  useEffect(() => {
    if (boardDeleted) handleLeaveCall();
  }, [boardDeleted]);
```

- [ ] **Step 4: Render `JoinCallButton` next to `PresenceList`**

Replace:

```tsx
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {board?.role === "owner" && <InviteMemberDialog boardId={roomId} membershipVersion={membershipVersion} />}
          <PresenceList self={localPresence} peers={peers} />
        </div>
```

with:

```tsx
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {board?.role === "owner" && <InviteMemberDialog boardId={roomId} membershipVersion={membershipVersion} />}
          <JoinCallButton
            isJoined={isJoined}
            othersInCallCount={callParticipantCount}
            onJoin={handleJoinCall}
            onLeave={handleLeaveCall}
          />
          {callError && <span style={{ fontSize: 12, color: "#e03131" }}>{callError}</span>}
          <PresenceList self={localPresence} peers={peers} />
        </div>
```

- [ ] **Step 5: Render `CallStrip` while joined**

Directly after that top-bar `<div>` closes (still inside the outer flex-column `<div>`, before the `CanvasStage` wrapper), add:

```tsx
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
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc -p client/tsconfig.json`
Expected: no errors

- [ ] **Step 7: Run the full test suites**

Run: `npm run test --workspace=server && npm run test --workspace=client`
Expected: every test across both workspaces PASSes

- [ ] **Step 8: Manual end-to-end verification in the browser**

With `docker compose up -d postgres livekit`, `npm run dev:server`, and `npm run dev:client` all running, and two browser windows logged in as different users on the same board (one owner/collaborator, one invited as viewer):

1. Neither window shows a live badge yet — button reads plain "Join call".
2. Collaborator clicks "Join call" — browser prompts for camera/mic permission; after granting, their own video tile appears in `CallStrip`.
3. In the viewer's window, the button now reads "Join call · 1" without a page refresh (confirms the awareness-based badge is live).
4. Viewer clicks "Join call" — **no** camera/mic permission prompt appears (confirms subscribe-only), and they can see/hear the collaborator's tile with no mute/camera controls of their own.
5. Collaborator clicks "Mute" — the viewer's copy of that tile shows the 🔇 indicator.
6. Drag the `CallStrip` by its "⠿ Call" handle — it moves and stays where dropped, and the canvas underneath is still fully usable.
7. Collaborator clicks "Leave call" — their tile disappears from the viewer's strip, and the viewer's badge returns to "Join call" with no count.
8. As the owner, remove the viewer from the board (via the existing member-management flow) while the viewer is mid-call — the viewer's `CallStrip` disappears and they're redirected to the dashboard, not left in a zombie call.
9. Stop the LiveKit container (`docker compose stop livekit`) and click "Join call" — an inline error appears next to the button instead of a silently stuck "Join call" or a browser console error with no UI feedback. Run `docker compose start livekit` afterward to restore it.

- [ ] **Step 9: Commit**

```bash
git add client/src/canvas/Board.tsx
git commit -m "Wire video calls into the board page"
```
