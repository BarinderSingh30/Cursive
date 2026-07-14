# Phase 4 — Video Calls: Design

## Scope

Phase 4 adds camera/mic calls to a board via a self-hosted LiveKit server, matching `docs/ROADMAP.md`'s one-liner: "Camera/mic while sketching together." One call room per board. Joining is **explicit** — a "Join call" button, never automatic on board open — so opening a board to sketch never touches the camera/mic or opens a LiveKit connection unasked. `server/src/authorization/boardAccess.ts` already names this exact use in its docstring ("LiveKit token minting (Phase 4)"), so the call-token endpoint is a new consumer of an existing, unmodified check rather than a new authorization concept.

Deliberately deferred to a later slice:
- Screen sharing (roadmap says camera/mic; screen share is a separate LiveKit track type and permission surface — adding it later doesn't change the room model established here)
- Recording
- Anonymous/link viewers on a call (that's Phase 5's whole feature — read-only chat *and* call for a link viewer, no account)
- Reconciling call presence with the board's chat panel (`ROADMAP.md` already flags this as a Phase 5 design question once board-scoped chat exists)

## Permission model

Same role tiers the canvas already uses, enforced at the LiveKit token grant, not just in the UI:

- **viewer**: can join the room and subscribe to others' audio/video, cannot publish their own — the call equivalent of the canvas's `readOnly` flag.
- **collaborator / owner**: can join and publish camera + mic.

This is computed the same way `hocuspocus.ts`'s `onAuthenticate` already computes `readOnly` — `roleAtLeast(role, "collaborator")` — so there's one mental model for "what can this role do on this board," not a second one invented for calls.

## Server: call token minting

New `server/src/call/callToken.ts`:

```ts
import { AccessToken } from "livekit-server-sdk";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { env } from "../env.js";

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

New route in `boards.routes.ts`, same shape as the existing `/sync-ticket` route. `requireBoardRole` only puts `userId` and `boardRole` on `res.locals` (see `authorization/requireBoardRole.ts`) — it has no display name to hand back, so the route looks the user up the same way `GET /:boardId/members` already does (`m.user.name`) to get something to show on the LiveKit participant's tile:

```ts
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

This is a **separate token scheme** from `connectionTicket.ts` — LiveKit verifies its own JWTs against `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`, not `SYNC_TICKET_SECRET`, so the two are not interchangeable and neither needs to know the other exists. What they share is the gate in front of them: `requireBoardRole("viewer")`, same as every other board-scoped connection.

**Room lifecycle**: LiveKit auto-creates a room on first join (room name = `boardId`) and it naturally empties out once the last participant disconnects. Nothing on our side creates, tracks, or tears down room state — one less thing to get out of sync.

## Client: call connection

New `client/src/call/useCall.ts` wraps `livekit-client`'s `Room`:

- `join()`: fetch `{ token, url }` from `GET /api/boards/:boardId/call-token` (cookie-authed REST call, same pattern as fetching the sync ticket), `room.connect(url, token)`, then `room.localParticipant.enableCameraAndMicrophone()` — but only attempted if the board role permits publishing; a viewer never triggers the browser's camera/mic permission prompt at all.
- Remote participants' tracks are attached/detached via `RoomEvent.TrackSubscribed` / `TrackUnsubscribed`, matching the pattern in `livekit-client`'s own docs.
- `leave()`: `room.disconnect()`.
- `toggleCamera()` / `toggleMic()`: local mute/unmute, only meaningful when publishing is allowed.

## Call awareness ("is a call happening?")

Extends the existing Yjs `awareness` state (`client/src/canvas/yjs/useAwareness.ts`) — already broadcasting cursor position, name, and color per connected user — with one more field: `inCall: boolean`. Set to `true` on `join()`, `false` on `leave()`/disconnect. No new channel, no new WebSocket, no LiveKit webhook: the board already has a live feed of "who's here," this reuses it for "who's on the call."

`JoinCallButton` derives its badge from `peers.filter(p => p.inCall).length` — showing "Join call · 2" whenever the count is nonzero, plain "Join call" otherwise.

## UI

- **`JoinCallButton.tsx`** — sits in the board's top bar next to `PresenceList`, live badge as above.
- **`CallStrip.tsx`** — appears only once you've joined; a small floating, draggable strip of video tiles positioned over the canvas (not a fixed sidebar, not inline in the top bar), so it never permanently reduces canvas space and can be moved out of the way of what you're drawing. One tile per participant (local + remote), each showing camera-off/mic-off state; strip includes mute, camera-toggle, and leave controls.

## Error handling

- **Camera/mic permission denied by the browser**: catch the `enableCameraAndMicrophone()` rejection and join listen/watch-only instead of failing the whole call — same "degrade, don't crash" instinct as the rest of the app.
- **Access revoked mid-call** (owner removes you from the board): `Board.tsx` already listens for a `membership-changed` stateless event to redirect you off the board; extend that same handler to also call `leave()` on an active call before the redirect fires, so you don't stay connected to a room you no longer have any board role on.
- **Call-token fetch fails** (403 from `requireBoardRole`, or the mint throws): show an inline error where the Join button was, rather than a silent no-op click.
- **LiveKit unreachable** (e.g. the dev container isn't up): `room.connect()` rejects / emits a `Disconnected`-style failure — surface that as an inline message instead of leaving the UI stuck on "Connecting…" indefinitely.

## Infra

`docker-compose.yml` gets a new `livekit` service, `livekit/livekit-server` image, run in `--dev` mode (default `devkey` / `secret` API key pair — fine for local dev, matching how `SYNC_TICKET_SECRET` and the Postgres password are already dev-only placeholders in `.env.example`).

New env vars:
- Server `.env.example`: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Client `.env.example`: `VITE_LIVEKIT_URL`

## Testing

- **Server**: a Vitest test on `callToken.ts` asserting the minted grant's `canPublish` is `true` for `collaborator`/`owner` and `false` for `viewer` — same shape as the existing `connectionTicket.test.ts`. Route-level enforcement is already covered structurally by reusing `requireBoardRole`, the same middleware every other gated board route already relies on.
- **No automated test for actual media/WebRTC** — there's no meaningful way to simulate a camera or a WebRTC connection in Vitest, and `multiplayer-sim-tester` is scoped to simulated Yjs clients verifying CRDT convergence, not media. Verified manually in the browser instead, with two real windows logged in as different roles:
  - a viewer can join, sees/hears others, and never gets a camera/mic permission prompt or publish controls
  - a collaborator's own camera tile appears in their own strip
  - the "Join call · N" badge updates live in a tab that hasn't joined
  - leaving and rejoining works cleanly
  - being removed from the board mid-call disconnects the call, not just the board
