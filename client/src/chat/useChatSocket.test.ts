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
