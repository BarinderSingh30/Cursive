# Home Page (Twitch-style board discovery) — Design

## Context

This is a new phase inserted between Phase 5 (anonymous viewer links) and the existing Phase 6 (scale-out) in `docs/ROADMAP.md`. It adds a public, Twitch-style Home page that recommends boards to visitors — logged in or anonymous — showing each board's owner, live viewer count, and total view count. It sits alongside (not on top of) the existing `docs/superpowers/plans/` UI overhaul phase, which is separately blocked on external design input from the user and is not part of this spec.

Today, boards are private by default: an owner must explicitly enable a share link (`Board.shareEnabled` + `Board.shareToken`) before anyone can watch via `/watch/:shareToken`, and there is no listing or discovery surface at all — a link is the only way in. This phase inverts that default and adds discovery on top of the existing Phase 5 watch infrastructure.

## Scope decisions (from stakeholder Q&A)

- **Audience**: fully public, like Twitch's actual homepage. Anonymous, logged-out visitors can browse it, not just logged-in users. Home becomes the landing page at `/`.
- **Public by default**: every new board is listed on Home automatically. Owners get a "Private" toggle to unlist a board — but a private board's watch link, if someone has it, still works. "Private" only controls Home page listing, never link-based access.
- **Share link auto-enabled**: a board's `/watch/:shareToken` link is active from creation — no manual "enable sharing" step. The existing revoke/regenerate action in the share dialog is unchanged and still exists as an explicit way to fully kill or rotate the link.
- **View counting**: `totalViews` increments once per watch session (once per Hocuspocus connection), for every connection except the owner's own. Collaborators' connections do count.
- **Live viewer count**: sourced from Hocuspocus's own in-memory connection tracking (`documents.get(boardId).getConnectionsCount()`), not a new presence system. Also excludes the owner's own connection, for consistency with `totalViews`.
- **Relationship to Dashboard**: Home (`/`) and Dashboard (`/dashboard`) stay separate pages. Dashboard is unchanged — still the place to create/manage/invite on your own boards. Home is purely discovery.
- **Board cards**: text-only (name, owner name, live badge, total views) — no canvas thumbnail/preview image. Thumbnails are an explicit non-goal for this phase; could be a future phase.
- **Listing scope & ranking**: Home lists every public (`listed: true`) board, sorted by live viewer count (desc) → `totalViews` (desc) → `createdAt` (desc). Boards with zero activity still appear (further down), rather than only showing currently-live boards.
- **Live-count delivery**: REST polling (~15s interval) reading Hocuspocus's existing connection tracking, not a new WebSocket push channel. Making live counts correct across multiple Node instances is explicitly deferred to Phase 6 (scale-out) — this phase's polling reads whichever single instance answers the request, same single-instance assumption every other pre-Phase-6 feature makes.

## Data model

`Board` (Prisma) gains two columns:
- `listed: Boolean @default(true)` — controls Home page visibility only.
- `totalViews: Int @default(0)` — persisted view counter.

`shareEnabled` changes from defaulting `false` to defaulting `true`, and `shareToken` is generated at board creation time (`POST /api/boards`) instead of lazily on first "enable sharing" click. Existing boards are unaffected retroactively — the migration only changes defaults for boards created going forward; already-existing rows keep whatever `shareEnabled`/`shareToken` they currently have, and `listed` backfills to `true` for all of them (consistent with "everything public by default").

## Backend

**`GET /api/home`** (new, public, no auth) in `server/src/routes/home.routes.ts`:
- Queries `Board.findMany({ where: { listed: true } })` joined with `owner.name`.
- For each board, live viewer count = `hocuspocus.documents.get(board.id)?.getConnectionsCount() ?? 0`, imported from `server/src/collab/hocuspocus.ts`.
- Sorted per the ranking above.
- Paginated: `?cursor=&limit=24`, client shows a "Load more" button (no infinite scroll).

**View counting**: in `collab/hocuspocus.ts`, on the Hocuspocus `onConnect` lifecycle hook (fires once a connection is established, after `onAuthenticate` resolves its role), increment `Board.totalViews` by 1 when `context.role !== 'owner'`.

**Listing toggle**: extend the existing board PATCH route (where `shareEnabled` is currently toggled, in `server/src/routes/boards.routes.ts`) to also accept a `listed` boolean, gated by the same owner-only authorization check already used for `shareEnabled`.

## Frontend

**`client/src/home/HomePage.tsx`** — new, mounted at `/` (replacing the current `Navigate to="/dashboard"` redirect), **not** wrapped in `RequireAuth`.
- Top nav shows "Dashboard" link (if logged in) or "Log in" (if not), same conditional pattern `WatchPage` already uses.
- Grid of `BoardListingCard` components: name, owner name, live-viewer badge (shown only when count > 0), total views.
- Every card — including the owner's own boards — links to `/watch/:shareToken` (Phase 5's existing watch page). Home is a discovery/watch surface only; owners still reach editing via Dashboard → `/board/:id`.
- `useHomeBoards.ts` hook: fetches `/api/home`, polls every 15s, exposes `loadMore()`.

**Dashboard** (`client/src/dashboard/BoardCard.tsx`): add a "Private"/"Public" toggle next to the existing share controls, wired to the new `listed` field via the extended PATCH route. No other Dashboard changes.

**Router** (`client/src/router.tsx`): `/` → `<HomePage />`.

## Error handling

- `GET /api/home` failure shows an inline retry message, matching the existing `useBoards` failure pattern on Dashboard.
- No live connections for a board is the normal case (`0`, not an error).
- A board deleted between a Home fetch and a click-through is already handled by Phase 5's existing "board not found" state on `WatchPage`.

## Testing

Real Vitest tests, following this repo's existing conventions (e.g. `friends.test.ts`, `useFriends.test.ts`):
- `server/src/routes/home.routes.test.ts` — only `listed: true` boards returned, correct sort order, unlisted boards excluded.
- `server/src/collab/hocuspocus.test.ts` — view-count increments once per non-owner connection, never for the owner's own connection.
- Owner-only authorization test for the `listed` PATCH route, mirroring the existing `shareEnabled` authorization test.
- `client/src/home/useHomeBoards.test.ts` and `BoardListingCard.test.tsx` — mocked-fetch conventions matching `useFriends.test.ts` / `ChatRoomList.test.tsx`.

Complementary: the `multiplayer-sim-tester` subagent simulates concurrent connects/disconnects against the local dev server to confirm the live-viewer badge tracks real connection state, the same way Phases 1–5 verified live concurrency end-to-end.

## Non-goals (explicitly out of scope for this phase)

- Canvas thumbnail/preview images on board cards.
- Any recommendation algorithm beyond the simple live → views → recency sort.
- Cross-instance-correct live counts (Phase 6's job).
- Any change to the separately-tracked UI overhaul phase, which is blocked on external design input.

## Known documentation drift found during this design

`CLAUDE.md` states "No testing framework yet — deliberately deferred until Phase 2" — this is now inaccurate; Vitest + Testing Library were added and ~25 test files already exist across `client` and `server`. Worth a follow-up fix to `CLAUDE.md`, separate from this phase.
