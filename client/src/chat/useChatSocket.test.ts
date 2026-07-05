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
