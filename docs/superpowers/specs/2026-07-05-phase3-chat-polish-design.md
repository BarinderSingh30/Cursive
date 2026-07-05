# Phase 3 chat polish: typing indicators, pagination, frontend tests

## Context

The `/phase-check` skill found Phase 3 (Chat — DMs and group chats between friends) essentially
feature-complete and demoable: message send/receive, conversation list, unread badges, group
creation, and auth are all wired end-to-end with 16 passing server-side tests. Three gaps were
flagged before the phase can be considered done to the same bar as Phases 1 and 2 (which were both
verified with real end-to-end checks, not just "files exist"):

1. No typing indicators.
2. The server already supports cursor-based message pagination
   (`GET /api/chat/conversations/:id/messages?before=<id>`, capped at 30 per page), but the client
   never uses the cursor — only the most recent page is ever visible.
3. Zero frontend test coverage. The client has no test tooling installed at all, while the server
   already uses Vitest.

This spec covers closing all three gaps.

## 1. Typing indicators

Reuses the existing chat WebSocket gateway and pub/sub fan-out — no new transport, and nothing is
persisted to the database (typing state is inherently ephemeral).

**New event types** — `shared/src/ws-events/chat-events.ts`:

- Client → server: `{ type: "typing"; conversationId: string }`
- Server → client: `{ type: "typing"; conversationId: string; userId: string; userName: string | null }`

**`client/src/chat/useChatSocket.ts`**:

- New `notifyTyping(conversationId)` function, throttled to at most once per ~2 seconds while the
  user keeps typing (a boolean "cooldown" flag reset by a `setTimeout`, not a timer per keystroke).
- New state `typingByConversation: Record<string, { userId: string; userName: string | null }[]>`.
  Each incoming `typing` server event upserts that user's entry and (re)starts a 3-second expiry
  timer for them; if no further `typing` event arrives before it fires, their entry is removed.
- No explicit "stopped typing" event — expiry is handled entirely client-side by the receiver. This
  keeps the server stateless for this feature, consistent with `pubsub.ts` already being built as a
  swappable fan-out interface (in-process now, Redis-backed in Phase 6) — no instance ends up
  holding typing state that only it knows about.

**`server/src/chat/wsGateway.ts`**:

- On `event.type === "typing"`, reuse `resolveConversationMembership` (the same authorization call
  already used for `send`) to confirm the sender belongs to the conversation.
- Look up the sender's display name with `prisma.user.findUnique({ where: { id: userId }, select: { name: true } })`
  — one query per throttled ping (≤1 per 2s per active typist), so cost is negligible.
- Fan out `{ type: "typing", conversationId, userId, userName }` to every *other* member via
  `chatPubSub`, mirroring how `message` events are delivered.

**UI**:

- `MessageList` gains a `typingUsers: { userId: string; userName: string | null }[]` prop and
  renders a line below the messages:
  - 1 person: `"Alice is typing…"`
  - 2 people: `"Alice and Bob are typing…"`
  - 3+ people: `"Alice, Bob, and 2 others are typing…"`
- `MessageInput` gains an `onTyping: () => void` prop, called on every keystroke; `ChatPage` wires
  it to `notifyTyping(activeId)`.

## 2. Client-side pagination (auto-load on scroll-to-top)

**`client/src/chat/useChatSocket.ts`**:

- `loadHistory` is replaced by `loadMore(conversationId)`:
  - First call (no messages loaded yet) fetches the latest 30 with no cursor.
  - Subsequent calls pass the oldest currently-loaded message's `id` as the `before` query param.
  - Results are prepended to `messagesByConversation[conversationId]`, de-duplicated by `id`.
  - Tracks `hasMoreByConversation[conversationId]`, set to `false` once a page comes back shorter
    than 30 (no more history).
  - Tracks a `loadingByConversation[conversationId]` flag so a scroll event can't fire a second
    concurrent fetch while one is in flight.

**`client/src/chat/MessageList.tsx`**:

- Gains `onReachTop`, `loading`, and `hasMore` props.
- An `onScroll` handler fires `onReachTop()` once `scrollTop` drops below a small threshold (e.g.
  40px), gated by `loading`/`hasMore` so it can't double-fire.
- To prevent the view jumping when older messages are inserted above the current scroll position:
  before calling `onReachTop`, record the container's `scrollHeight`; after the new (taller) content
  renders, a `useLayoutEffect` sets `scrollTop += newScrollHeight - oldScrollHeight`, keeping the
  same messages visually in place (the standard "reverse infinite scroll" technique).

## 3. Frontend tests (Vitest + React Testing Library + jsdom)

**Tooling** — added to `client/package.json` as devDependencies: `vitest`, `@testing-library/react`,
`@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. New `client/vitest.config.ts`
with `environment: "jsdom"`, and a `"test": "vitest run"` script — mirroring the server's existing
Vitest setup so both workspaces run tests the same way.

**Coverage** (scoped to the chat feature, not a client-wide sweep):

- **`useChatSocket.test.ts`**: incoming `message` events append to state and trigger a conversation
  refresh; `loadMore` prepends and de-dupes correctly and flips `hasMore` false on a short page;
  `sendMessage` sends the correctly-shaped JSON frame; typing events populate
  `typingByConversation` and expire after the timeout (`vi.useFakeTimers`). The WebSocket is faked
  with a minimal `MockWebSocket` class assigned to `global.WebSocket`; `api` calls are mocked with
  `vi.mock`.
- **`MessageInput.test.tsx`**: keystrokes call `onTyping`; submitting calls `onSend` with trimmed
  content and clears the input; empty/whitespace-only submit is a no-op.
- **`MessageList.test.tsx`**: renders self- vs. other-message alignment; renders all three
  typing-indicator text variants; fires `onReachTop` when scrolled near the top.
- **`ChatRoomList.test.tsx`**: empty state renders; unread badge shows/hides correctly; `onSelect`
  fires on click.

`ChatPage.tsx` is left untested — it has no logic of its own beyond composing the pieces above, and
testing it would mostly duplicate their coverage while requiring heavier mocking (router, friends
list, auth session).

## Out of scope

- Server-side "stopped typing" events, read receipts beyond the existing conversation-level
  `lastReadAt`, and message search/filtering — not requested, not needed for Phase 3's goal.
- Testing `ChatPage.tsx` itself (see above).
- Any client-wide test tooling decisions beyond the chat feature — this only sets up Vitest/RTL for
  the client workspace generally, it doesn't retroactively test unrelated existing components
  (canvas, auth, dashboard, friends).

## Verification

1. `npm run test --workspace=server` — existing chat tests still pass, plus new tests for the
   typing-event authorization/fan-out path (membership-gated, non-members rejected).
2. `npm run test --workspace=client` — the new suite above, all green.
3. Manual check: two logged-in sessions in a shared DM — confirm the typing indicator appears and
   clears correctly, and that scrolling a long conversation loads older pages without the view
   jumping.
