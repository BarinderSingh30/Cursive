# Phase 3 — Chat: Design

## Scope

Phase 3 ships a standalone **Messages** area: DMs and group chats between friends, reachable from the dashboard, independent of any board. There is no chat panel on the board page yet — that arrives in Phase 5, when the anonymous-viewer/broadcast feature actually needs it, by creating a group chat whose membership mirrors `BoardMember` (see "Future: board-scoped chat" below). This keeps Phase 3 scoped to exactly what `docs/ROADMAP.md` calls for and avoids building board-chat UI twice.

This first slice covers **core chat + an unread badge** only. The following were discussed and deliberately deferred to a follow-up slice, once core chat is built and manually tested end-to-end (matching how every prior phase in this project has shipped):
- Online/offline presence per friend
- Typing indicators
- Message edit/delete

## Data model

Three new Prisma models, added alongside the existing `Board`/`BoardMember`/`FriendRequest`/`Friendship`/`BoardInvite` models:

```prisma
model Conversation {
  id        String   @id @default(cuid())
  isGroup   Boolean  @default(false)
  name      String?              // group chats only
  dmKey     String?  @unique     // sorted "userIdA:userIdB", set only when isGroup = false
  createdAt DateTime @default(now())
  members   ConversationMember[]
  messages  Message[]
}

model ConversationMember {
  id             String   @id @default(cuid())
  conversationId String
  userId         String
  lastReadAt     DateTime @default(now())
  joinedAt       DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([conversationId, userId])
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  senderId       String
  content        String
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation(fields: [senderId], references: [id], onDelete: Cascade)
}
```

A DM and a group chat are the same `Conversation` row shape — `isGroup` plus which fields are set is the only difference. This is a deliberate choice: `ROADMAP.md` already notes that a board's future broadcast chat is "likely just a group chat whose membership mirrors `BoardMember`," which only works cleanly if group chat is one reusable concept rather than a separate system bolted on later.

**`dmKey`** is how "message a friend for the first time" finds-or-creates the right conversation without a race: it's the two user IDs sorted and joined (e.g. `"abc123:xyz789"`), set only on non-group conversations, enforced unique at the DB level. This mirrors the sorted-pair pattern already used for `Friendship` ordering in `friends.routes.ts`'s `orderedPair()` helper — that helper should be extracted into a shared location both files import from, resolving a small duplication already flagged by a `code-polisher` pass rather than adding a second copy of the same idea.

If two people message each other for the first time at nearly the same moment, both requests may try to create the same `dmKey` — the DB's unique constraint rejects the second insert, and that request should catch the violation and re-fetch the now-existing conversation rather than erroring out. Same category of "let the database be the source of truth under concurrency" as the CRDT work in Phase 1, just at the SQL level instead of Yjs's.

**Group membership rule**: only your own friends can be added when creating or growing a group chat. Members do not need to be mutual friends with each other — matches the friends-only invite model already used for boards, and avoids the real complexity of checking a full friend-graph clique.

**Unread tracking**: `ConversationMember.lastReadAt` is updated to "now" whenever that user opens the conversation (client calls the mark-as-read endpoint). Unread count for a conversation = messages with `createdAt > lastReadAt` and `senderId != self`.

## Real-time delivery

One new WebSocket gateway, `server/src/chat/wsGateway.ts`, served at the `/chat` path that `server/src/ws/router.ts` already has a comment stubbed in for.

- **Auth**: generalizes the existing `syncTicket.ts` pattern into a shared `authorization/connectionTicket.ts` — a short-lived signed JWT minted via `GET /api/chat/ticket`, carrying `{ userId, purpose: "chat", exp }`. A `purpose` field stops a board sync ticket and a chat ticket from being interchangeable. This exists because a plain session cookie can't be reliably read during a raw WebSocket handshake — the same reason board sync needed it.
- **Connection tracking**: an in-process `Map<userId, Set<WebSocket>>` (a user can have multiple tabs/devices open). This is the `chat/pubsub.ts` swappable interface `docs/ROADMAP.md`'s plan already calls for — in-process now, Redis pub/sub in Phase 6 so delivery still works once there's more than one Node instance.
- **Authorization**: chat has no role tiers, just membership. One function, `chat/authorization.ts`'s `assertConversationMember(userId, conversationId)`, called by both the WS gateway (before persisting or fanning out a message) and every conversation-scoped REST route below — so the two surfaces can't drift out of sync with each other, the same principle `boardAccess.ts` already establishes for boards.
- **Client → server message**: `{ type: "send", conversationId, content }`.
- **Server → client messages**: `{ type: "message", message }` (a message arrived in a conversation you're in), `{ type: "conversation-created", conversation }` (someone started a new DM/group with you — appears in your list live, same pattern as the board's "membership-changed" broadcast), `{ type: "error", message }` (a rejected send — not a member, empty content — socket stays open, nothing is persisted or fanned out).
- The connection is opened once, at app-shell level, not per-conversation — it's also what keeps the unread badge live without a polling loop.

## REST routes

New `server/src/routes/chat.routes.ts`, all behind the existing `requireAuth` middleware:

- `GET /api/chat/conversations` — your conversation list: name (or DM partner's name), last message preview, unread count; sorted by most recent activity.
- `POST /api/chat/conversations/dm` — `{ friendEmail }` → find-or-create the DM with that friend (must already be a friend, same check style already used for board invites).
- `POST /api/chat/conversations/group` — `{ name, memberEmails[] }` → create a group; every listed member must be a friend of the creator.
- `GET /api/chat/conversations/:id/messages` — paginated history via `?before=<messageId>` cursor.
- `POST /api/chat/conversations/:id/read` — marks the caller's `lastReadAt` as now.
- `GET /api/chat/ticket` — mints the short-lived chat WS ticket, mirroring `GET /:boardId/sync-ticket`.

## Shared schemas

- `shared/src/api/chat.schemas.ts` — Zod schemas for the REST payloads/responses above (`conversationSchema`, `messageSchema`, `createDmSchema`, `createGroupSchema`).
- `shared/src/ws-events/chat-events.ts` — a discriminated union of the WS event shapes listed above, imported by both client and server so they can't drift.

## Client

New `client/src/chat/` folder:

- `ChatPage.tsx` — new `/messages` route, reachable from the dashboard nav next to Friends/Notifications.
- `ChatRoomList.tsx` — conversation list with unread badges, "New DM" / "New group" actions.
- `MessageList.tsx` — scrollable history for the selected conversation, loads older messages on scroll-up.
- `MessageInput.tsx` — text input + send button, Enter-to-send.
- `useChatSocket.ts` — mints/uses the chat ticket, opens the single `/chat` connection, holds conversations + unread state in memory, exposes `sendMessage()`, handles incoming `message` / `conversation-created` events.

## Error handling

- WS: malformed sends or a non-member trying to send get `{ type: "error" }` back; never persisted, never fanned out; the socket itself stays open.
- REST: reuses the existing `errorHandler` middleware, same pattern as `boards.routes.ts`/`friends.routes.ts` today.
- Ticket expiry only matters at connect time, exactly like Hocuspocus's sync ticket — once the socket is open it stays open; there's no per-message re-check.

## Future: board-scoped chat (not this phase)

When Phase 5 needs a chat panel on the board itself, it should create/reuse a `Conversation` with `isGroup = true` whose membership is kept in sync with that board's `BoardMember` rows, rather than introducing a second chat system. This is the reconciliation `docs/ROADMAP.md` already flags — recorded here so the Phase 5 design starts from the right assumption instead of re-deriving it.

## Deferred to a follow-up slice within Phase 3

Discussed and explicitly out of scope for this first pass, to keep the testable unit small:
- **Presence** (online/offline per friend) — needs a lightweight global presence mechanism, distinct from the per-board Yjs awareness that exists today.
- **Typing indicators** — ephemeral state broadcast over the `/chat` socket; real but non-essential complexity.
- **Message edit/delete** — needs soft-delete/edited-at handling in the `Message` schema and corresponding UI.
