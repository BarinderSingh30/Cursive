import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import { MockWebSocket } from "../test/mockWebSocket.js";
import { useChatSocket } from "./useChatSocket.js";

vi.mock("../api/client.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
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
      vi.advanceTimersByTime(8000);
    });
    expect(result.current.typingByConversation["conv-1"]).toEqual([]);
  });

  it("clears the sender's typing indicator as soon as their message arrives", async () => {
    mockApiGet({ "/api/chat/conversations": [], "/api/chat/ticket": { ticket: "t" } });

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.emitMessage({ type: "typing", conversationId: "conv-1", userId: "alice", userName: "Alice" });
    });
    expect(result.current.typingByConversation["conv-1"]).toEqual([{ userId: "alice", userName: "Alice" }]);

    act(() => {
      socket.emitMessage({
        type: "message",
        message: {
          id: "m1",
          conversationId: "conv-1",
          senderId: "alice",
          senderName: "Alice",
          content: "hi",
          createdAt: new Date().toISOString(),
        },
      });
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

describe("useChatSocket reconnection", () => {
  it("opens a new socket after the connection drops, so sending works again", async () => {
    mockApiGet({ "/api/chat/conversations": [], "/api/chat/ticket": { ticket: "t" } });

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    vi.useFakeTimers();
    MockWebSocket.instances[0].emitClose();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    vi.useRealTimers();

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));

    act(() => {
      result.current.sendMessage("conv-1", "hello again");
    });

    expect(MockWebSocket.instances[1].sent).toHaveLength(1);
    expect(MockWebSocket.instances[0].sent).toHaveLength(0);
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

describe("useChatSocket deleteMessage", () => {
  it("calls the delete endpoint and removes the message from local state", async () => {
    mockApiGet({
      "/api/chat/conversations": [],
      "/api/chat/ticket": { ticket: "t" },
      "/api/chat/conversations/conv-1/messages": [
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
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    await act(async () => {
      await result.current.loadMore("conv-1");
    });
    expect(result.current.messagesByConversation["conv-1"].map((m) => m.id)).toEqual(["m1"]);

    await act(async () => {
      await result.current.deleteMessage("conv-1", "m1");
    });

    expect(api.delete).toHaveBeenCalledWith("/api/chat/messages/m1");
    expect(result.current.messagesByConversation["conv-1"]).toEqual([]);
  });
});

describe("useChatSocket clearHistory", () => {
  it("calls the clear endpoint, empties local messages, and refreshes conversations", async () => {
    mockApiGet({
      "/api/chat/conversations": [],
      "/api/chat/ticket": { ticket: "t" },
      "/api/chat/conversations/conv-1/messages": [
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
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() => useChatSocket());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));

    await act(async () => {
      await result.current.loadMore("conv-1");
    });
    expect(result.current.messagesByConversation["conv-1"]).toHaveLength(1);

    const callsBefore = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "/api/chat/conversations",
    ).length;

    await act(async () => {
      await result.current.clearHistory("conv-1");
    });

    expect(api.post).toHaveBeenCalledWith("/api/chat/conversations/conv-1/clear");
    expect(result.current.messagesByConversation["conv-1"]).toEqual([]);
    const callsAfter = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "/api/chat/conversations",
    ).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });
});

describe("useChatSocket remote message-deleted / history-cleared events", () => {
  it("removes a message from local state when a message-deleted event arrives over the socket", async () => {
    mockApiGet({
      "/api/chat/conversations": [],
      "/api/chat/ticket": { ticket: "t" },
      "/api/chat/conversations/conv-1/messages": [
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
    const socket = MockWebSocket.instances[0];

    await act(async () => {
      await result.current.loadMore("conv-1");
    });
    expect(result.current.messagesByConversation["conv-1"]).toHaveLength(1);

    act(() => {
      socket.emitMessage({ type: "message-deleted", conversationId: "conv-1", messageId: "m1" });
    });

    expect(result.current.messagesByConversation["conv-1"]).toEqual([]);
  });

  it("empties local messages and refreshes conversations when a history-cleared event arrives over the socket", async () => {
    mockApiGet({
      "/api/chat/conversations": [],
      "/api/chat/ticket": { ticket: "t" },
      "/api/chat/conversations/conv-1/messages": [
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
    const socket = MockWebSocket.instances[0];

    await act(async () => {
      await result.current.loadMore("conv-1");
    });
    expect(result.current.messagesByConversation["conv-1"]).toHaveLength(1);

    const callsBefore = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === "/api/chat/conversations",
    ).length;

    act(() => {
      socket.emitMessage({ type: "history-cleared", conversationId: "conv-1" });
    });

    expect(result.current.messagesByConversation["conv-1"]).toEqual([]);
    await waitFor(() => {
      const callsAfter = (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === "/api/chat/conversations",
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
