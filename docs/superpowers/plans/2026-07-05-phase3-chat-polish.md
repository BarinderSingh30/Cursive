# Phase 3 Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typing indicators and client-side message pagination to the Phase 3 chat feature, and stand up a frontend test suite (Vitest + React Testing Library) covering the chat UI, closing the three gaps found by `/phase-check`.

**Architecture:** Typing indicators reuse the existing chat WebSocket gateway and `chatPubSub` fan-out (no new transport, nothing persisted). Pagination activates the message-list endpoint's existing `before` cursor from the client side, with scroll-position preservation so loading older messages doesn't jar the view. Frontend tests are added via a new Vitest + jsdom setup for the `client` workspace, mirroring the server's existing Vitest config.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, @testing-library/user-event, jsdom, existing `ws`/Express/Prisma server stack.

**Spec:** `docs/superpowers/specs/2026-07-05-phase3-chat-polish-design.md`

## Global Constraints

- Typing state is never persisted to the database — ephemeral only (spec §1).
- Typing/pagination fan-out reuses `resolveConversationMembership` (`server/src/chat/authorization.ts`) — never re-implement the membership check (spec §1, CLAUDE.md authorization convention).
- Typing throttle: client sends at most once per 2000ms per conversation while typing. Typing expiry: a received typing entry clears after 3000ms with no refresh (spec §1).
- Pagination page size is fixed server-side at 30 (`server/src/routes/chat.routes.ts:91`) — client treats a page shorter than 30 as "no more history."
- Scroll-to-top trigger threshold: 40px from the top of the message list (spec §2).
- Client test tooling: Vitest + `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + jsdom, matching the server's existing Vitest usage (spec §3).
- `ChatPage.tsx` is not unit tested — it has no logic beyond composing already-tested pieces (spec §3, explicit scope decision).
- All existing chat behavior (message send/receive, conversation list, unread badges, group creation) must keep working — this is additive, not a rewrite.

---

### Task 1: Server-side typing event (shared types + gateway fan-out)

**Files:**
- Modify: `shared/src/ws-events/chat-events.ts`
- Modify: `server/src/chat/wsGateway.ts`
- Test: `server/src/chat/wsGateway.test.ts`

**Interfaces:**
- Produces: `ChatClientEvent` gains `{ type: "typing"; conversationId: string }`. `ChatServerEvent` gains `{ type: "typing"; conversationId: string; userId: string; userName: string | null }`. Both exported from `@cursive/shared` (barrel already re-exports `./ws-events/chat-events.js`).
- Consumes: `resolveConversationMembership` from `server/src/chat/authorization.ts` (existing), `chatPubSub` from `server/src/chat/pubsub.ts` (existing), `prisma` from `server/src/db/prisma.ts` (existing).

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `server/src/chat/wsGateway.test.ts` (before the final closing of the outer `describe`, i.e. as a sibling to the existing `it(...)` blocks inside `describe("chat WebSocket gateway", ...)`):

```ts
  describe("typing indicator", () => {
    it("relays a typing event to other conversation members, including the sender's name", async () => {
      const alice = await prisma.user.create({
        data: { email: "alice-typing@chat-ws-test.local", emailVerified: true, name: "Alice" },
      });
      const bob = await prisma.user.create({ data: { email: "bob-typing@chat-ws-test.local", emailVerified: true } });
      const conversation = await prisma.conversation.create({
        data: {
          isGroup: false,
          dmKey: `${alice.id}:${bob.id}`,
          members: { create: [{ userId: alice.id }, { userId: bob.id }] },
        },
      });

      const aliceSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: alice.id }));
      const bobSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: bob.id }));

      aliceSocket.send(JSON.stringify({ type: "typing", conversationId: conversation.id }));
      const received = await nextMessage(bobSocket);

      expect(received).toMatchObject({ type: "typing", conversationId: conversation.id, userId: alice.id, userName: "Alice" });

      aliceSocket.close();
      bobSocket.close();
    });

    it("does not relay a typing event back to the sender", async () => {
      const alice = await prisma.user.create({ data: { email: "alice-typing2@chat-ws-test.local", emailVerified: true } });
      const bob = await prisma.user.create({ data: { email: "bob-typing2@chat-ws-test.local", emailVerified: true } });
      const conversation = await prisma.conversation.create({
        data: {
          isGroup: false,
          dmKey: `${alice.id}:${bob.id}`,
          members: { create: [{ userId: alice.id }, { userId: bob.id }] },
        },
      });

      const aliceSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: alice.id }));
      let aliceReceivedOwnTyping = false;
      aliceSocket.on("message", () => {
        aliceReceivedOwnTyping = true;
      });

      aliceSocket.send(JSON.stringify({ type: "typing", conversationId: conversation.id }));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(aliceReceivedOwnTyping).toBe(false);
      aliceSocket.close();
    });

    it("ignores a typing event from someone who isn't a member of the conversation", async () => {
      const alice = await prisma.user.create({ data: { email: "alice-typing3@chat-ws-test.local", emailVerified: true } });
      const eve = await prisma.user.create({ data: { email: "eve-typing@chat-ws-test.local", emailVerified: true } });
      const conversation = await prisma.conversation.create({
        data: { isGroup: false, dmKey: `${alice.id}:solo-typing`, members: { create: [{ userId: alice.id }] } },
      });

      const eveSocket = await connect(mintConnectionTicket({ purpose: "chat", userId: eve.id }));
      let eveReceivedAnything = false;
      eveSocket.on("message", () => {
        eveReceivedAnything = true;
      });

      eveSocket.send(JSON.stringify({ type: "typing", conversationId: conversation.id }));
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(eveReceivedAnything).toBe(false);
      eveSocket.close();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=server`
Expected: The first new test (`relays a typing event...`) times out and FAILs (default Vitest test timeout, ~5s) — the gateway currently has `if (event.type !== "send") return;`, so a `"typing"` event is silently dropped and `bobSocket` never receives anything. The other two new tests pass vacuously right now (nothing is ever relayed), which is expected — they'll stay meaningful once Step 3 makes the first test pass.

- [ ] **Step 3: Add the typing event types**

In `shared/src/ws-events/chat-events.ts`, replace the full contents with:

```ts
import type { ChatMessage, ConversationSummary } from "../api/chat.schemas.js";

export type ChatClientEvent =
  | { type: "send"; conversationId: string; content: string }
  | { type: "typing"; conversationId: string };

export type ChatServerEvent =
  | { type: "message"; message: ChatMessage }
  | { type: "conversation-created"; conversation: ConversationSummary }
  | { type: "typing"; conversationId: string; userId: string; userName: string | null }
  | { type: "error"; message: string };
```

- [ ] **Step 4: Handle the typing event in the gateway**

In `server/src/chat/wsGateway.ts`, the `socket.on("message", ...)` handler currently reads:

```ts
  socket.on("message", async (raw) => {
    let event: ChatClientEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Malformed event" });
      return;
    }

    if (event.type !== "send") return;
```

Replace it with (inserting the typing branch before the existing `"send"` guard):

```ts
  socket.on("message", async (raw) => {
    let event: ChatClientEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: "error", message: "Malformed event" });
      return;
    }

    if (event.type === "typing") {
      const access = await resolveConversationMembership({ userId, conversationId: event.conversationId });
      if (!access.isMember) return;

      const sender = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      const members = await prisma.conversationMember.findMany({ where: { conversationId: event.conversationId } });
      members
        .filter((member) => member.userId !== userId)
        .forEach((member) =>
          chatPubSub.publish(userChannel(member.userId), {
            type: "typing",
            conversationId: event.conversationId,
            userId,
            userName: sender?.name ?? null,
          } satisfies ChatServerEvent),
        );
      return;
    }

    if (event.type !== "send") return;
```

Leave the rest of the file (the existing `"send"` handling below that line, and everything above it) unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=server`
Expected: PASS — all tests in `wsGateway.test.ts`, including the 3 new ones, plus the 2 pre-existing ones.

- [ ] **Step 6: Commit**

```bash
git add shared/src/ws-events/chat-events.ts server/src/chat/wsGateway.ts server/src/chat/wsGateway.test.ts
git commit -m "Add server-side typing indicator event to chat WS gateway"
```

---

### Task 2: Client test tooling (Vitest + RTL + jsdom) proven via ChatRoomList tests

**Files:**
- Modify: `client/package.json`
- Create: `client/vitest.config.ts`
- Create: `client/src/test/setup.ts`
- Test: `client/src/chat/ChatRoomList.test.tsx`

**Interfaces:**
- Produces: a working `npm run test --workspace=client` command (Vitest + jsdom + React Testing Library + jest-dom matchers wired up), reusable by every later task's tests.
- Consumes: `ChatRoomList` from `client/src/chat/ChatRoomList.tsx` (existing, unmodified — this task adds tests only, no behavior change).

- [ ] **Step 1: Add test tooling as devDependencies and a test script**

In `client/package.json`, change:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
```

to:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

and add to `devDependencies`:

```json
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "jsdom": "^25.0.1",
    "vitest": "^4.1.9"
```

(keep the existing `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `typescript`, `vite` entries as they are).

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: Installs cleanly across all three workspaces (root `npm install` resolves workspace deps); no errors.

- [ ] **Step 3: Create the Vitest config**

Create `client/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

- [ ] **Step 4: Create the test setup file**

Create `client/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView; MessageList calls it after each
// render to keep the latest message in view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
```

- [ ] **Step 5: Write the ChatRoomList tests**

Create `client/src/chat/ChatRoomList.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ConversationSummary } from "@cursive/shared";
import { ChatRoomList } from "./ChatRoomList.js";

function makeConversation(overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "conv-1",
    isGroup: false,
    displayName: "Alice",
    lastMessage: "hey",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    ...overrides,
  };
}

describe("ChatRoomList", () => {
  it("shows an empty state when there are no conversations", () => {
    render(<ChatRoomList conversations={[]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it("shows an unread badge when unreadCount is greater than 0", () => {
    render(<ChatRoomList conversations={[makeConversation({ unreadCount: 3 })]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the unread badge when unreadCount is 0", () => {
    render(<ChatRoomList conversations={[makeConversation({ unreadCount: 0 })]} activeId={null} onSelect={vi.fn()} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("calls onSelect with the conversation id when clicked", () => {
    const onSelect = vi.fn();
    render(<ChatRoomList conversations={[makeConversation({ id: "conv-42" })]} activeId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Alice"));
    expect(onSelect).toHaveBeenCalledWith("conv-42");
  });
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: PASS — 4 tests in `ChatRoomList.test.tsx`. (No red/green cycle needed here: `ChatRoomList` already implements this behavior, so these tests lock in existing behavior rather than drive new code.)

- [ ] **Step 7: Commit**

```bash
git add client/package.json client/package-lock.json client/vitest.config.ts client/src/test/setup.ts client/src/chat/ChatRoomList.test.tsx
git commit -m "Add Vitest + React Testing Library to the client workspace"
```

---

### Task 3: `useChatSocket` — typing support

**Files:**
- Modify: `client/src/chat/useChatSocket.ts`
- Create: `client/src/test/mockWebSocket.ts`
- Test: `client/src/chat/useChatSocket.test.ts`

**Interfaces:**
- Produces: `useChatSocket()` return value gains `typingByConversation: Record<string, TypingUser[]>` and `notifyTyping(conversationId: string): void`, where `TypingUser = { userId: string; userName: string | null }` (also exported from this file for reuse by `MessageList`).
- Consumes: `ChatServerEvent`/`ChatClientEvent` from `@cursive/shared` (Task 1's new `"typing"` variants).

- [ ] **Step 1: Create the MockWebSocket test helper**

Create `client/src/test/mockWebSocket.ts`:

```ts
export class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `client/src/chat/useChatSocket.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import { MockWebSocket } from "../test/mockWebSocket.js";
import { useChatSocket } from "./useChatSocket.js";

vi.mock("../api/client.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

function mockApiGet(routes: Record<string, unknown>) {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
    if (path in routes) return Promise.resolve(routes[path]);
    throw new Error(`Unmocked path: ${path}`);
  });
}

beforeEach(() => {
  MockWebSocket.reset();
  (globalThis as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useChatSocket typing", () => {
  it("adds a typing user when a typing event arrives, and removes them after the expiry window", async () => {
    mockApiGet({ "/api/chat/conversations": [], "/api/chat/ticket": { ticket: "t" } });

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances[0];

    vi.useFakeTimers();

    act(() => {
      socket.emitMessage({ type: "typing", conversationId: "conv-1", userId: "alice", userName: "Alice" });
    });
    expect(result.current.typingByConversation["conv-1"]).toEqual([{ userId: "alice", userName: "Alice" }]);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.typingByConversation["conv-1"]).toEqual([]);
  });

  it("throttles notifyTyping so it sends at most once per 2 seconds", async () => {
    mockApiGet({ "/api/chat/conversations": [], "/api/chat/ticket": { ticket: "t" } });

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances[0];

    vi.useFakeTimers();

    act(() => {
      result.current.notifyTyping("conv-1");
      result.current.notifyTyping("conv-1");
    });
    expect(socket.sent).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      result.current.notifyTyping("conv-1");
    });
    expect(socket.sent).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — `result.current.typingByConversation` and `result.current.notifyTyping` are `undefined` (not yet added to the hook's return value), so both new tests throw/fail their assertions.

- [ ] **Step 4: Add typing support to the hook**

Replace the full contents of `client/src/chat/useChatSocket.ts` with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatClientEvent, ChatMessage, ChatServerEvent, ConversationSummary } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";

export interface TypingUser {
  userId: string;
  userName: string | null;
}

const TYPING_THROTTLE_MS = 2000;
const TYPING_EXPIRY_MS = 3000;

export function useChatSocket() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({});
  const [typingByConversation, setTypingByConversation] = useState<Record<string, TypingUser[]>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const typingCooldownRef = useRef<Record<string, boolean>>({});
  const typingExpiryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refreshConversations = useCallback(async () => {
    const list = await api.get<ConversationSummary[]>("/api/chat/conversations");
    setConversations(list);
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const handleTypingEvent = useCallback((conversationId: string, userId: string, userName: string | null) => {
    setTypingByConversation((current) => {
      const withoutUser = (current[conversationId] ?? []).filter((u) => u.userId !== userId);
      return { ...current, [conversationId]: [...withoutUser, { userId, userName }] };
    });

    const timerKey = `${conversationId}:${userId}`;
    clearTimeout(typingExpiryTimersRef.current[timerKey]);
    typingExpiryTimersRef.current[timerKey] = setTimeout(() => {
      setTypingByConversation((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? []).filter((u) => u.userId !== userId),
      }));
    }, TYPING_EXPIRY_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;

    (async () => {
      const { ticket } = await api.get<{ ticket: string }>("/api/chat/ticket");
      if (cancelled) return;

      socket = new WebSocket(`${env.CHAT_SOCKET_URL}?ticket=${ticket}`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const data: ChatServerEvent = JSON.parse(event.data);
        if (data.type === "message") {
          setMessagesByConversation((current) => ({
            ...current,
            [data.message.conversationId]: [...(current[data.message.conversationId] ?? []), data.message],
          }));
          refreshConversations();
        }
        if (data.type === "conversation-created") {
          refreshConversations();
        }
        if (data.type === "typing") {
          handleTypingEvent(data.conversationId, data.userId, data.userName);
        }
      };
    })();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [refreshConversations, handleTypingEvent]);

  const loadHistory = useCallback(async (conversationId: string) => {
    const history = await api.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages`);
    setMessagesByConversation((current) => ({ ...current, [conversationId]: history.slice().reverse() }));
  }, []);

  const sendMessage = useCallback((conversationId: string, content: string) => {
    const event: ChatClientEvent = { type: "send", conversationId, content };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  const notifyTyping = useCallback((conversationId: string) => {
    if (typingCooldownRef.current[conversationId]) return;
    typingCooldownRef.current[conversationId] = true;
    setTimeout(() => {
      typingCooldownRef.current[conversationId] = false;
    }, TYPING_THROTTLE_MS);

    const event: ChatClientEvent = { type: "typing", conversationId };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  const markRead = useCallback(
    async (conversationId: string) => {
      await api.post(`/api/chat/conversations/${conversationId}/read`);
      refreshConversations();
    },
    [refreshConversations],
  );

  return {
    conversations,
    messagesByConversation,
    typingByConversation,
    loadHistory,
    sendMessage,
    notifyTyping,
    markRead,
    refreshConversations,
  };
}
```

(This step keeps `loadHistory` as-is — Task 4 replaces it with `loadMore`. Keeping the diff scoped to typing-only here means this task's tests stay focused on typing behavior.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: PASS — both new tests in `useChatSocket.test.ts`, plus the 4 `ChatRoomList` tests from Task 2.

- [ ] **Step 6: Commit**

```bash
git add client/src/chat/useChatSocket.ts client/src/test/mockWebSocket.ts client/src/chat/useChatSocket.test.ts
git commit -m "Add typing indicator support to useChatSocket"
```

---

### Task 4: `useChatSocket` — client-side pagination

**Files:**
- Modify: `client/src/chat/useChatSocket.ts`
- Modify: `client/src/chat/ChatPage.tsx`
- Test: `client/src/chat/useChatSocket.test.ts`

**Interfaces:**
- Produces: `useChatSocket()` return value replaces `loadHistory(conversationId)` with `loadMore(conversationId): Promise<void>`, and adds `hasMoreByConversation: Record<string, boolean>` and `loadingByConversation: Record<string, boolean>`.
- Consumes: `GET /api/chat/conversations/:id/messages` and `GET /api/chat/conversations/:id/messages?before=<id>` (existing server routes, `server/src/routes/chat.routes.ts:79-105`, unchanged).

- [ ] **Step 1: Write the failing tests**

Append this `describe` block to `client/src/chat/useChatSocket.test.ts` (after the `describe("useChatSocket typing", ...)` block):

```ts
describe("useChatSocket pagination", () => {
  it("loads the latest page on first call with no cursor", async () => {
    mockApiGet({
      "/api/chat/conversations": [],
      "/api/chat/ticket": { ticket: "t" },
      "/api/chat/conversations/conv-1/messages": [
        {
          id: "m3",
          conversationId: "conv-1",
          senderId: "bob",
          senderName: "Bob",
          content: "c3",
          createdAt: "2026-01-01T00:00:02.000Z",
        },
        {
          id: "m2",
          conversationId: "conv-1",
          senderId: "bob",
          senderName: "Bob",
          content: "c2",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
    });

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    await act(async () => {
      await result.current.loadMore("conv-1");
    });

    expect(result.current.messagesByConversation["conv-1"].map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(result.current.hasMoreByConversation["conv-1"]).toBe(false);
  });

  it("prepends an older page using the oldest loaded message as the cursor, and dedupes", async () => {
    mockApiGet({
      "/api/chat/conversations": [],
      "/api/chat/ticket": { ticket: "t" },
      "/api/chat/conversations/conv-1/messages": [
        {
          id: "m2",
          conversationId: "conv-1",
          senderId: "bob",
          senderName: "Bob",
          content: "c2",
          createdAt: "2026-01-01T00:00:01.000Z",
        },
      ],
      "/api/chat/conversations/conv-1/messages?before=m2": [
        {
          id: "m1",
          conversationId: "conv-1",
          senderId: "bob",
          senderName: "Bob",
          content: "c1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    await act(async () => {
      await result.current.loadMore("conv-1");
    });
    await act(async () => {
      await result.current.loadMore("conv-1");
    });

    expect(result.current.messagesByConversation["conv-1"].map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — `result.current.loadMore` is `undefined` (the hook still only exposes `loadHistory`).

- [ ] **Step 3: Replace `loadHistory` with `loadMore` in the hook**

In `client/src/chat/useChatSocket.ts`, replace:

```ts
  const loadHistory = useCallback(async (conversationId: string) => {
    const history = await api.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages`);
    setMessagesByConversation((current) => ({ ...current, [conversationId]: history.slice().reverse() }));
  }, []);
```

with:

```ts
  const [hasMoreByConversation, setHasMoreByConversation] = useState<Record<string, boolean>>({});
  const [loadingByConversation, setLoadingByConversation] = useState<Record<string, boolean>>({});

  const loadMore = useCallback(
    async (conversationId: string) => {
      if (loadingByConversation[conversationId]) return;

      setLoadingByConversation((current) => ({ ...current, [conversationId]: true }));
      try {
        const existing = messagesByConversation[conversationId] ?? [];
        const oldest = existing[0];
        const query = oldest ? `?before=${oldest.id}` : "";
        const page = await api.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages${query}`);
        const newMessages = page.slice().reverse();

        setMessagesByConversation((current) => {
          const currentMessages = current[conversationId] ?? [];
          const existingIds = new Set(currentMessages.map((m) => m.id));
          const deduped = newMessages.filter((m) => !existingIds.has(m.id));
          return { ...current, [conversationId]: [...deduped, ...currentMessages] };
        });
        setHasMoreByConversation((current) => ({ ...current, [conversationId]: page.length === 30 }));
      } finally {
        setLoadingByConversation((current) => ({ ...current, [conversationId]: false }));
      }
    },
    [messagesByConversation, loadingByConversation],
  );
```

Note this state must be declared alongside the hook's other `useState` calls near the top — add the two new `useState` lines right after the existing `const [typingByConversation, ...]` line.

Then update the return statement at the bottom of the file from:

```ts
  return {
    conversations,
    messagesByConversation,
    typingByConversation,
    loadHistory,
    sendMessage,
    notifyTyping,
    markRead,
    refreshConversations,
  };
```

to:

```ts
  return {
    conversations,
    messagesByConversation,
    typingByConversation,
    hasMoreByConversation,
    loadingByConversation,
    loadMore,
    sendMessage,
    notifyTyping,
    markRead,
    refreshConversations,
  };
```

- [ ] **Step 4: Update `ChatPage` to use `loadMore` and load each conversation only once per session**

In `client/src/chat/ChatPage.tsx`, replace:

```tsx
export function ChatPage() {
  const { conversations, messagesByConversation, loadHistory, sendMessage, markRead, refreshConversations } =
    useChatSocket();
  const { friends } = useFriends();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (activeId) {
      loadHistory(activeId);
      markRead(activeId);
    }
  }, [activeId, loadHistory, markRead]);
```

with:

```tsx
export function ChatPage() {
  const {
    conversations,
    messagesByConversation,
    typingByConversation,
    hasMoreByConversation,
    loadingByConversation,
    loadMore,
    sendMessage,
    notifyTyping,
    markRead,
    refreshConversations,
  } = useChatSocket();
  const { friends } = useFriends();
  const [activeId, setActiveId] = useState<string | null>(null);
  const loadedConversationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeId) return;
    if (!loadedConversationsRef.current.has(activeId)) {
      loadedConversationsRef.current.add(activeId);
      loadMore(activeId);
    }
    markRead(activeId);
  }, [activeId, loadMore, markRead]);
```

This also requires adding `useRef` to the React import at the top of the file — change:

```tsx
import { useEffect, useState } from "react";
```

to:

```tsx
import { useEffect, useRef, useState } from "react";
```

(`typingByConversation`, `hasMoreByConversation`, `loadingByConversation`, and `notifyTyping` are wired into the rendered JSX in Tasks 6 and 7 — this step only needs them destructured so the file keeps compiling once those props are added.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: PASS — all tests in `useChatSocket.test.ts` (typing + pagination) and `ChatRoomList.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add client/src/chat/useChatSocket.ts client/src/chat/useChatSocket.test.ts client/src/chat/ChatPage.tsx
git commit -m "Add client-side message pagination to useChatSocket"
```

---

### Task 5: `MessageInput` — typing wiring

**Files:**
- Modify: `client/src/chat/MessageInput.tsx`
- Modify: `client/src/chat/ChatPage.tsx`
- Test: `client/src/chat/MessageInput.test.tsx`

**Interfaces:**
- Produces: `MessageInput` gains an optional `onTyping?: () => void` prop, called on every keystroke that leaves non-whitespace content in the field.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Create `client/src/chat/MessageInput.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageInput } from "./MessageInput.js";

describe("MessageInput", () => {
  it("calls onTyping while the user types", async () => {
    const user = userEvent.setup();
    const onTyping = vi.fn();
    render(<MessageInput onSend={vi.fn()} onTyping={onTyping} />);

    await user.type(screen.getByPlaceholderText("Type a message…"), "hi");

    expect(onTyping).toHaveBeenCalled();
  });

  it("calls onSend with the trimmed content and clears the input on submit", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText("Type a message…") as HTMLInputElement;
    await user.type(input, "  hello world  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("hello world");
    expect(input.value).toBe("");
  });

  it("does not call onSend when the input is empty or whitespace only", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    await user.type(screen.getByPlaceholderText("Type a message…"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — the first test fails because `MessageInput` doesn't accept or call an `onTyping` prop yet. The other two pass already (existing behavior) — that's fine, they'll stay green through Step 3.

- [ ] **Step 3: Add `onTyping` to `MessageInput`**

Replace the full contents of `client/src/chat/MessageInput.tsx` with:

```tsx
import { useState, type FormEvent } from "react";

interface Props {
  onSend: (content: string) => void;
  onTyping?: () => void;
}

export function MessageInput({ onSend, onTyping }: Props) {
  const [value, setValue] = useState("");

  const handleChange = (next: string) => {
    setValue(next);
    if (next.trim().length > 0) onTyping?.();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e0e0e0" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type a message…"
        style={{ flex: 1 }}
      />
      <button type="submit">Send</button>
    </form>
  );
}
```

- [ ] **Step 4: Wire `notifyTyping` into `ChatPage`**

In `client/src/chat/ChatPage.tsx`, replace:

```tsx
            <MessageList messages={messagesByConversation[activeId] ?? []} />
            <MessageInput onSend={(content) => sendMessage(activeId, content)} />
```

with:

```tsx
            <MessageList messages={messagesByConversation[activeId] ?? []} />
            <MessageInput onSend={(content) => sendMessage(activeId, content)} onTyping={() => notifyTyping(activeId)} />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: PASS — all 3 tests in `MessageInput.test.tsx`, plus everything from earlier tasks.

- [ ] **Step 6: Commit**

```bash
git add client/src/chat/MessageInput.tsx client/src/chat/MessageInput.test.tsx client/src/chat/ChatPage.tsx
git commit -m "Wire typing notifications into MessageInput"
```

---

### Task 6: `MessageList` — typing indicator rendering

**Files:**
- Modify: `client/src/chat/MessageList.tsx`
- Modify: `client/src/chat/ChatPage.tsx`
- Test: `client/src/chat/MessageList.test.tsx`

**Interfaces:**
- Produces: `MessageList` gains an optional `typingUsers?: TypingUser[]` prop (where `TypingUser = { userId: string; userName: string | null }`), rendering "Alice is typing…" / "Alice and Bob are typing…" / "Alice, Bob, and 2 others are typing…" beneath the messages.
- Consumes: `TypingUser` shape matches `useChatSocket`'s `typingByConversation` entries (Task 3).

- [ ] **Step 1: Write the failing tests**

Create `client/src/chat/MessageList.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ChatMessage } from "@cursive/shared";
import { MessageList } from "./MessageList.js";

vi.mock("../auth/authClient.js", () => ({
  useSession: () => ({ data: { user: { id: "self-1" } } }),
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    conversationId: "conv-1",
    senderId: "other-1",
    senderName: "Bob",
    content: "hello",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MessageList", () => {
  it("renders message content and the other user's name", () => {
    render(<MessageList messages={[makeMessage()]} />);
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows no typing indicator when typingUsers is empty", () => {
    render(<MessageList messages={[]} typingUsers={[]} />);
    expect(screen.queryByText(/typing/)).not.toBeInTheDocument();
  });

  it("shows a single-person typing indicator", () => {
    render(<MessageList messages={[]} typingUsers={[{ userId: "u1", userName: "Alice" }]} />);
    expect(screen.getByText("Alice is typing…")).toBeInTheDocument();
  });

  it("shows a two-person typing indicator", () => {
    render(
      <MessageList
        messages={[]}
        typingUsers={[
          { userId: "u1", userName: "Alice" },
          { userId: "u2", userName: "Bob" },
        ]}
      />,
    );
    expect(screen.getByText("Alice and Bob are typing…")).toBeInTheDocument();
  });

  it("shows a capped typing indicator for 4 people", () => {
    render(
      <MessageList
        messages={[]}
        typingUsers={[
          { userId: "u1", userName: "Alice" },
          { userId: "u2", userName: "Bob" },
          { userId: "u3", userName: "Carol" },
          { userId: "u4", userName: "Dave" },
        ]}
      />,
    );
    expect(screen.getByText("Alice, Bob, and 2 others are typing…")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — the 3 typing-indicator tests fail (no such text is rendered yet; `MessageList` doesn't accept a `typingUsers` prop). The first test (message content) already passes.

- [ ] **Step 3: Add typing indicator rendering to `MessageList`**

Replace the full contents of `client/src/chat/MessageList.tsx` with:

```tsx
import { useEffect, useRef } from "react";
import type { ChatMessage } from "@cursive/shared";
import { useSession } from "../auth/authClient.js";

export interface TypingUser {
  userId: string;
  userName: string | null;
}

interface Props {
  messages: ChatMessage[];
  typingUsers?: TypingUser[];
}

function formatTypingText(users: TypingUser[]): string {
  const names = users.map((u) => u.userName ?? "Someone");
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const [first, second, ...rest] = names;
  const label = rest.length === 1 ? "other" : "others";
  return `${first}, ${second}, and ${rest.length} ${label} are typing…`;
}

export function MessageList({ messages, typingUsers = [] }: Props) {
  const { data: session } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {messages.map((m) => {
        const isSelf = m.senderId === session?.user.id;
        return (
          <div key={m.id} style={{ alignSelf: isSelf ? "flex-end" : "flex-start", maxWidth: "70%" }}>
            {!isSelf && <div style={{ fontSize: 11, color: "#868e96" }}>{m.senderName ?? "Unknown"}</div>}
            <div
              style={{
                background: isSelf ? "#1971c2" : "#f1f3f5",
                color: isSelf ? "#fff" : "#1e1e1e",
                borderRadius: 12,
                padding: "8px 12px",
              }}
            >
              {m.content}
            </div>
          </div>
        );
      })}
      {typingUsers.length > 0 && (
        <div style={{ fontSize: 12, color: "#868e96", fontStyle: "italic" }}>{formatTypingText(typingUsers)}</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Wire `typingByConversation` into `ChatPage`**

In `client/src/chat/ChatPage.tsx`, replace:

```tsx
            <MessageList messages={messagesByConversation[activeId] ?? []} />
```

with:

```tsx
            <MessageList
              messages={messagesByConversation[activeId] ?? []}
              typingUsers={typingByConversation[activeId] ?? []}
            />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: PASS — all 5 tests in `MessageList.test.tsx`, plus everything from earlier tasks.

- [ ] **Step 6: Commit**

```bash
git add client/src/chat/MessageList.tsx client/src/chat/MessageList.test.tsx client/src/chat/ChatPage.tsx
git commit -m "Render typing indicator text in MessageList"
```

---

### Task 7: `MessageList` — scroll-to-top pagination with scroll-position preservation

**Files:**
- Modify: `client/src/chat/MessageList.tsx`
- Modify: `client/src/chat/ChatPage.tsx`
- Test: `client/src/chat/MessageList.test.tsx`

**Interfaces:**
- Produces: `MessageList` gains optional `onReachTop?: () => void`, `loading?: boolean` (default `false`), and `hasMore?: boolean` (default `true`) props. Scrolling within 40px of the top calls `onReachTop` (when not already `loading` and `hasMore` is `true`), and the scroll position is preserved when `messages` grows from a prepend.
- Consumes: `loadMore`, `loadingByConversation`, `hasMoreByConversation` from `useChatSocket` (Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `client/src/chat/MessageList.test.tsx` (after the existing tests, still inside `describe("MessageList", ...)`):

```tsx
  it("calls onReachTop when scrolled near the top", () => {
    const onReachTop = vi.fn();
    const { container } = render(
      <MessageList messages={[makeMessage()]} onReachTop={onReachTop} loading={false} hasMore={true} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, configurable: true });

    fireEvent.scroll(scrollContainer);

    expect(onReachTop).toHaveBeenCalledTimes(1);
  });

  it("does not call onReachTop when already loading", () => {
    const onReachTop = vi.fn();
    const { container } = render(
      <MessageList messages={[makeMessage()]} onReachTop={onReachTop} loading={true} hasMore={true} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, configurable: true });

    fireEvent.scroll(scrollContainer);

    expect(onReachTop).not.toHaveBeenCalled();
  });

  it("does not call onReachTop when hasMore is false", () => {
    const onReachTop = vi.fn();
    const { container } = render(
      <MessageList messages={[makeMessage()]} onReachTop={onReachTop} loading={false} hasMore={false} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, configurable: true });

    fireEvent.scroll(scrollContainer);

    expect(onReachTop).not.toHaveBeenCalled();
  });

  it("preserves scroll position when older messages are prepended after onReachTop fires", () => {
    const onReachTop = vi.fn();
    const { container, rerender } = render(
      <MessageList messages={[makeMessage({ id: "m2" })]} onReachTop={onReachTop} loading={false} hasMore={true} />,
    );
    const scrollContainer = container.firstChild as HTMLDivElement;

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 500, configurable: true });
    Object.defineProperty(scrollContainer, "scrollTop", { value: 10, writable: true, configurable: true });

    fireEvent.scroll(scrollContainer);
    expect(onReachTop).toHaveBeenCalledTimes(1);

    Object.defineProperty(scrollContainer, "scrollHeight", { value: 800, configurable: true });
    rerender(
      <MessageList
        messages={[makeMessage({ id: "m1" }), makeMessage({ id: "m2" })]}
        onReachTop={onReachTop}
        loading={false}
        hasMore={true}
      />,
    );

    expect(scrollContainer.scrollTop).toBe(10 + (800 - 500));
  });
```

Also add `fireEvent` to the existing import line at the top of the file — change:

```tsx
import { render, screen } from "@testing-library/react";
```

to:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=client`
Expected: FAIL — `MessageList` doesn't accept `onReachTop`/`loading`/`hasMore` props yet, so none of the 4 new tests can pass (no scroll handling exists at all).

- [ ] **Step 3: Add scroll-to-top pagination and scroll preservation to `MessageList`**

Replace the full contents of `client/src/chat/MessageList.tsx` with:

```tsx
import { useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@cursive/shared";
import { useSession } from "../auth/authClient.js";

export interface TypingUser {
  userId: string;
  userName: string | null;
}

interface Props {
  messages: ChatMessage[];
  typingUsers?: TypingUser[];
  onReachTop?: () => void;
  loading?: boolean;
  hasMore?: boolean;
}

function formatTypingText(users: TypingUser[]): string {
  const names = users.map((u) => u.userName ?? "Someone");
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const [first, second, ...rest] = names;
  const label = rest.length === 1 ? "other" : "others";
  return `${first}, ${second}, and ${rest.length} ${label} are typing…`;
}

const SCROLL_TOP_THRESHOLD = 40;

export function MessageList({ messages, typingUsers = [], onReachTop, loading = false, hasMore = true }: Props) {
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (prevScrollHeightRef.current !== null) {
      container.scrollTop += container.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = null;
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !onReachTop || loading || !hasMore) return;
    if (container.scrollTop <= SCROLL_TOP_THRESHOLD) {
      prevScrollHeightRef.current = container.scrollHeight;
      onReachTop();
    }
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      {messages.map((m) => {
        const isSelf = m.senderId === session?.user.id;
        return (
          <div key={m.id} style={{ alignSelf: isSelf ? "flex-end" : "flex-start", maxWidth: "70%" }}>
            {!isSelf && <div style={{ fontSize: 11, color: "#868e96" }}>{m.senderName ?? "Unknown"}</div>}
            <div
              style={{
                background: isSelf ? "#1971c2" : "#f1f3f5",
                color: isSelf ? "#fff" : "#1e1e1e",
                borderRadius: 12,
                padding: "8px 12px",
              }}
            >
              {m.content}
            </div>
          </div>
        );
      })}
      {typingUsers.length > 0 && (
        <div style={{ fontSize: 12, color: "#868e96", fontStyle: "italic" }}>{formatTypingText(typingUsers)}</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
```

(This replaces the `messages.length`-keyed `useEffect` from Task 6 with a `messages`-keyed `useLayoutEffect` that branches on whether a prepend was just flagged — see the Global Constraints and spec §2 for why this is the right condition to branch on.)

- [ ] **Step 4: Wire `loadMore`/`loadingByConversation`/`hasMoreByConversation` into `ChatPage`**

In `client/src/chat/ChatPage.tsx`, replace:

```tsx
            <MessageList
              messages={messagesByConversation[activeId] ?? []}
              typingUsers={typingByConversation[activeId] ?? []}
            />
```

with:

```tsx
            <MessageList
              messages={messagesByConversation[activeId] ?? []}
              typingUsers={typingByConversation[activeId] ?? []}
              onReachTop={() => loadMore(activeId)}
              loading={loadingByConversation[activeId] ?? false}
              hasMore={hasMoreByConversation[activeId] ?? true}
            />
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test --workspace=client`
Expected: PASS — all tests in `MessageList.test.tsx` (9 total), and the full client suite.

- [ ] **Step 6: Commit**

```bash
git add client/src/chat/MessageList.tsx client/src/chat/MessageList.test.tsx client/src/chat/ChatPage.tsx
git commit -m "Add scroll-to-top pagination with scroll-position preservation to MessageList"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full server test suite**

Run: `npm run test --workspace=server`
Expected: PASS — all server chat tests (pre-existing + Task 1's 3 new typing tests).

- [ ] **Step 2: Run the full client test suite**

Run: `npm run test --workspace=client`
Expected: PASS — `ChatRoomList.test.tsx` (4), `useChatSocket.test.ts` (4), `MessageInput.test.tsx` (3), `MessageList.test.tsx` (9). 20 tests total.

- [ ] **Step 3: Type-check both workspaces**

Run: `npm run build --workspace=client` then, separately, confirm the server still compiles by running its existing test suite (already done in Step 1 — the server has no separate typecheck script; `vitest run` type-checks via `tsx`/`ts-node` transforms as it runs).
Expected: `client` build completes with no TypeScript errors (this catches any prop-type mismatch left over from the incremental `ChatPage.tsx` edits across Tasks 4-7).

- [ ] **Step 4: Manual end-to-end check**

With the Postgres container and `npm run dev:server` / `npm run dev:client` both running: open two browser sessions (e.g. one normal window, one incognito) logged in as two friends who share a DM.
- Type in one window's message box and confirm "X is typing…" appears in the other window within ~2 seconds, and disappears within ~3 seconds of stopping.
- Send enough messages in that DM to exceed 30 (or manually insert test rows), reload, then scroll to the top of the message list and confirm older messages load in without the visible messages jumping around.

Expected: both behaviors work as described. If either fails, use `superpowers:systematic-debugging` to isolate before considering this plan complete.

- [ ] **Step 5: Update the roadmap note (optional, only if manual check passes)**

If Step 4 passes, you may want to mention in a future conversation that Phase 3's remaining polish items are closed — this plan intentionally does not edit `docs/ROADMAP.md` itself, since ticking the Phase 3 checkbox is a project-level decision for the user to make, not an implementation step.
