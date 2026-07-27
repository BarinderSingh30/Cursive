# Phase 5 — Anonymous Viewer Links (Design)

## Goal

A shareable, read-only public link to a board (`/watch/:shareToken`) that needs no
account to view. Twitch-style layout: canvas/call on the left, a vertical chat
sidebar on the right. Twitch-style chat rules: any **logged-in** visitor (owner,
collaborator, invited viewer, or a logged-in stranger who just opened the public
link) can post; a **fully anonymous** visitor is read-only everywhere, chat
included.

Board-scoped live chat does not exist yet (today's chat is only friend
DMs/groups) — this phase builds it, since the Twitch-style experience requires
it and there's no smaller version worth shipping separately.

## A. Data model & share-link lifecycle

`Board` gains:
```prisma
shareEnabled Boolean @default(false)
shareToken   String? @unique
```

No JWT for the share token itself — it's checked live against the DB so
disable/regenerate takes effect immediately, which is a hard requirement here.
This is a deliberate deviation from the original scaffolding plan's "viewer
tokens must never touch the DB" note — that goal was about not adding a new
class of DB load, but this project already does a DB hit at ticket-mint time
for logged-in users, so one more at share-link resolution isn't a new cost
class.

New owner-only routes on `boards.routes.ts` (all behind `requireBoardRole("owner")`):
- `GET /:boardId/share` → `{ enabled, url }`
- `POST /:boardId/share/enable` → generates a token if none exists, sets `shareEnabled: true`
- `POST /:boardId/share/regenerate` → replaces the token, stays enabled (instantly invalidates the old URL)
- `POST /:boardId/share/disable` → `shareEnabled: false` (token kept around so re-enabling doesn't mint a new URL)

`resolveBoardRole` (`server/src/authorization/boardAccess.ts`) gains a second
branch — the only place this logic lives, per this project's centralized
authorization rule:

```ts
resolveBoardRole({ userId, boardId, shareToken }):
  if (userId) {
    membership = look up BoardMember
    if (membership) return { role: membership.role, userId, anonymous: false }
  }
  // no explicit membership (or not logged in) — fall back to the public link
  if (shareToken && board.shareEnabled && board.shareToken === shareToken)
    return { role: "viewer", userId, anonymous: !userId }
  return { role: null, userId, anonymous: !userId }
```

Explicit membership always wins — an owner/collaborator/invited-viewer opening
their own share link still resolves to their real role. `requireBoardRole`
middleware is extended to also read an `X-Share-Token` header and pass it
through. Every existing "collaborator"/"owner" minimum route is automatically
unaffected, since a share-link resolution never produces higher than `viewer`.

## B. Board chat (new subsystem)

Reuses existing patterns (connection tickets, the generic `chatPubSub`
interface, the WS router dispatch-by-path) but is a separate module from
DM/group chat — its access rule (anyone who can resolve *any* role on the
board) doesn't fit `ConversationMember`-based membership, and anonymous
visitors can't be conversation members at all.

New Prisma model:
```prisma
model BoardMessage {
  id        String   @id @default(cuid())
  boardId   String
  authorId  String   // always a real user — anonymous visitors can never post
  content   String
  createdAt DateTime @default(now())

  board  Board @relation(fields: [boardId], references: [id], onDelete: Cascade)
  author User  @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
```

`shared/src/ws-events/board-chat-events.ts`:
```ts
type BoardChatClientEvent = { type: "send"; content: string };
type BoardChatServerEvent =
  | { type: "message"; message: BoardChatMessage }
  | { type: "error"; message: string };
```

Connection ticket gains a third `purpose`:
```ts
| { purpose: "board-chat"; userId: string | null; boardId: string; role: BoardRole; anonymous: boolean }
```
Minted by `GET /api/boards/:boardId/chat/ticket`, gated by the now
share-token-aware `requireBoardRole("viewer")` — so both invited viewers and
share-link visitors (logged in or anonymous) can get one.

`server/src/boardChat/wsGateway.ts` (mirrors `chat/wsGateway.ts`), mounted at a
new `/board-chat` upgrade path in `ws/router.ts`:
- on `"send"`: reject if `payload.anonymous` — every other role (owner,
  collaborator, invited viewer, share-link viewer) can post
- persists via `prisma.boardMessage.create`, broadcasts on
  `chatPubSub.publish(\`board-chat:${boardId}\`, ...)` — same pubsub singleton,
  new channel convention, so Phase 6's Redis swap covers it for free
- `GET /api/boards/:boardId/chat/messages?before=cursor` — paginated history,
  same cursor style as `chat.routes.ts`, gated the same share-token-aware way
  so anonymous visitors get read access without needing a socket for the
  initial load

Client: `client/src/boardChat/BoardChatPanel.tsx` (Twitch-style vertical
column: scrollable history + input pinned at bottom) and
`useBoardChatSocket.ts` (mirrors `useChatSocket.ts`). An anonymous visitor sees
a "Log in to chat" prompt in place of the input, not just a disabled input.

## C. Client routing, layout & anonymous identity

New route `/watch/:shareToken` (public, outside `RequireAuth`) → `WatchPage.tsx`.

Flow: `WatchPage` calls `GET /api/boards/by-share/:shareToken` (new public,
no-auth route) → `{ boardId, boardName }` or a "this link isn't active" state
if disabled/invalid. If the visitor is logged in and already has real
membership, redirect to `/board/:boardId` instead — the share link is only the
fallback entry point for people without explicit membership.

`Board.tsx`'s `BoardInner` currently mixes owner-only chrome (Invite dialog)
with the actual board experience (canvas, presence, call). Extract the latter
into `canvas/BoardExperience.tsx`, parameterized by
`{ boardId, role, userId, userName, shareToken? }`, used by both:
- `Board.tsx` — top bar keeps Toolbar/Invite/new Share-dialog launcher (owner-only)
- `WatchPage.tsx` — top bar is just the board name + a "watching via public link" note

Every hook that mints a ticket (`useYjsDocument`/`createHocuspocusProvider`,
`useCall`, the new `useBoardChatSocket`) and `useBoard` gets an optional
`shareToken` threaded through, forwarded as an `X-Share-Token` header — same
endpoints, same server logic, resolved via the share branch instead of session
membership when there's no `BoardMember` row.

Anonymous display name: first visit with no session prompts for a name
(inline, non-blocking), stored in `localStorage` keyed by shareToken. A stable
per-visitor id (`crypto.randomUUID()`, also localStorage-persisted) is
generated once and sent as the pseudo-`userId` on ticket requests, namespaced
server-side (e.g. `anon:<uuid>`) so it's never confusable with a real account
id in logs/DB.

Presence and calls need no new work: `useAwareness` already has a
`viewerPeers` bucket built for exactly this ("a future broadcast link's
audience"), and `mintCallToken`/LiveKit gating already derives `canPublish`
from role alone — a share-link viewer resolves to `role: "viewer"` and flows
through the existing viewer auto-subscribe logic in `BoardExperience`
untouched.

## D. Error handling

- `/watch/:shareToken` for a disabled/invalid/deleted board → a plain "this
  link isn't active" page, with a link to `/login` (in case the visitor
  actually has an account and the owner meant to invite them properly).
- Regenerating the link while people are watching doesn't kill already-minted
  tickets — only new connection attempts with the old token fail, consistent
  with how `notifyBoardMembershipChanged` already behaves for membership removal.
- Anonymous chat-send attempts are rejected server-side in the gateway, never
  trusting the client to just hide the input — same defense-in-depth
  principle already used for `canPublish` in calls.

## E. Verification

1. Unit tests: `resolveBoardRole`'s new share-token branch (valid / disabled /
   wrong-token / mismatched-board), and the board-chat write-gate (anonymous
   rejected, every other role allowed).
2. `multiplayer-sim-tester` subagent: simulate an anonymous share-link
   connection alongside real members — verify it's read-only on canvas,
   appears in `viewerPeers`, and a `board-chat` send from it is discarded
   server-side.
3. Manual browser pass: open a board as owner, enable sharing, open the link
   in an incognito window, confirm canvas is read-only, chat works once
   logged in as a second account but not as a true anonymous guest, call
   auto-subscribes when the owner is in one, and regenerate actually kills the
   old link.
