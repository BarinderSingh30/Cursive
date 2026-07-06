# Remove friend — design

## Purpose

Let a user remove someone from their friends list from the Friends page, via a "⋯" menu next to the friend's name.

## Data flow

- New endpoint `DELETE /api/friends/:friendId` on the existing `friendsRouter` (already behind `requireAuth`).
  - Looks up the `Friendship` row between the caller and `:friendId` using the existing `orderedPair` helper (same pattern as the other friend routes).
  - 404s if no friendship exists between the two users.
  - On success, in a single Prisma transaction:
    - Deletes the `Friendship` row.
    - Deletes any `FriendRequest` row(s) between the two users, in either direction (so a fresh request can be sent later with no leftover "already handled" record).
  - Returns `204 No Content`.
- `client/src/friends/useFriends.ts` gets a new `removeFriend(friendId: string)` callback: calls `api.delete(\`/api/friends/${friendId}\`)`, then `refresh()`. Symmetric with the existing `acceptRequest`/`declineRequest` callbacks.

## Components

- **`FriendMenu.tsx`** (new) — a small, "dumb" reusable component: a "⋯" button that toggles a floating popover containing one item, "Remove friend". Props: `{ onRemove: () => void }`.
  - Manages its own open/closed state.
  - Closes on outside-click (document click listener + a ref around the menu) and after the action fires.
  - No confirmation logic inside — kept in the parent for symmetry with `BoardCard.tsx`'s `handleDelete`.
- **`FriendsPage.tsx`** — each friend `<li>` becomes a flex row: name on the left, `<FriendMenu onRemove={...} />` on the right.
  - `handleRemove(friendId, label)` runs `window.confirm(\`Remove ${label} as a friend?\`)`; if confirmed, calls `removeFriend(friendId)`. Same pattern `BoardCard` already uses for deleting a board.

## Error handling

- A 404 (friendship already gone, e.g. removed from another tab/session) is not specially surfaced — `refresh()` after the call reflects the true current state either way. Consistent with how accept/decline behave today (no toast/error UI in this app yet).

## Testing

- **Server** (`server/src/routes/friends.routes.test.ts` or equivalent): `DELETE /api/friends/:friendId`
  - Happy path: deletes the friendship and any friend-request rows between the pair.
  - 404 when no friendship exists between the caller and `:friendId`.
  - 404 when `:friendId` refers to a real user who isn't actually a friend of the caller (can't delete someone else's friendship).
- **Client**:
  - `useFriends.test.ts`: `removeFriend` calls `api.delete` with the right path, then refetches friends/requests.
  - `FriendMenu.test.tsx`: closed by default; opens on click; shows "Remove friend"; clicking it calls `onRemove`; clicking outside closes the menu without calling `onRemove`.

## Out of scope

- No change to existing DM conversations/history with a removed friend — they're left as-is. Only future *new* DMs are gated on friendship (already true today via `areFriends` in `server/src/chat/conversations.ts`).
