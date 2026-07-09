# Chat: clear history & delete message — design

## Problem

Users want two per-user chat controls: clear an entire conversation's history from their own view, and delete a single message from their own view. Neither should affect what the other member(s) of the conversation see — matching the existing per-user pattern already established for DMs (e.g. `canSend` in `ConversationSummary`).

## Scope

DMs and group conversations both — unlike the earlier `canSend` gating (DM-only), clearing/deleting is purely about your own view and has no bearing on friendship state, so it applies uniformly.

## Data model

Two additions to `server/prisma/schema.prisma`, one per feature — chosen because the two actions have different shapes and forcing them through one mechanism would be more expensive or more awkward for one of them:

- **`ConversationMember.clearedAt: DateTime?`** — "clear history." A single timestamp cutoff. O(1) to set regardless of conversation length.
- **New model `MessageDeletion { id, messageId, userId, createdAt }`, `@@unique([messageId, userId])`** — "delete message." Represents "this user has hidden this specific message from their own view." A timestamp cutoff can't express deleting one message in the middle of history, so this needs its own row per (message, user) pair, mirroring the existing `ConversationMember`/`BoardMember` join-table style.

## Visibility rule

A message is visible to user `U` in conversation `C` if and only if:

1. `message.createdAt > (U's ConversationMember.clearedAt ?? epoch)`, and
2. no `MessageDeletion` row exists for `(message.id, U.id)`.

This rule is expressed once, in a shared helper in `server/src/chat/conversations.ts`, and reused at all three read sites so the rule can't drift:

- `GET /api/chat/conversations/:id/messages` (paginated message fetch, `server/src/routes/chat.routes.ts`)
- `summarizeConversation`'s `lastMessage`/`lastMessageAt` computation
- `summarizeConversation`'s `unreadCount` computation

No special-casing is needed for pagination (`loadMore`): messages before the `clearedAt` cutoff are simply excluded by the query, so the existing "page shorter than 30 ⇒ no more pages" logic in `useChatSocket.ts` continues to work unchanged.

## API

- **`POST /api/chat/conversations/:id/clear`** — requires membership (same `resolveConversationMembership` check as `/read`). Sets `clearedAt = now()` on the caller's own `ConversationMember` row. Returns 204.
- **`DELETE /api/chat/messages/:messageId`** — requires the caller to be a member of that message's conversation. Upserts a `MessageDeletion` row for `(messageId, callerId)` — idempotent, so a duplicate call (e.g. a double click) is a no-op rather than an error. Returns 204.

Both are per-user actions: neither one touches any other member's `ConversationMember` row or the `Message` row itself.

## Client

- **Clear history**: a dots-menu (same visual pattern as `FriendMenu`) in the chat header next to the conversation name, with a single "Clear chat history" item. Confirmed via `window.confirm(...)` (same pattern as remove-friend), since it wipes an entire conversation's view. On success: clear local `messagesByConversation[id]` and refresh conversations (the preview collapses to "No messages yet" until a new message arrives).
- **Delete message**: a small delete control next to any message bubble in `MessageList.tsx` — yours or the other member's, since this is a per-user hide with no effect on anyone else. Fires immediately on click, no confirmation step (single message, low blast radius, matches the "one click" framing this was requested with). On success: remove that message from local state.

## Testing

TDD throughout. Server: tests for both new routes, and for the shared visibility helper (including the interaction case — a message that is both before the `clearedAt` cutoff and separately has a `MessageDeletion` row). Client: tests for the new menu item and the per-message delete control. `collab-correctness-reviewer` runs afterward since this touches `server/src/chat/**`.
