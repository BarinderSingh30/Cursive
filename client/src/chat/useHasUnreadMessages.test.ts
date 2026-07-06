import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationSummary } from "@cursive/shared";
import { api } from "../api/client.js";
import { useHasUnreadMessages } from "./useHasUnreadMessages.js";

vi.mock("../api/client.js", () => ({
  api: { get: vi.fn() },
}));

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

function mockConversations(conversations: ConversationSummary[]) {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(conversations);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useHasUnreadMessages", () => {
  it("is false when no conversation has unread messages", async () => {
    mockConversations([makeConversation({ unreadCount: 0 })]);

    const { result } = renderHook(() => useHasUnreadMessages());

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("is true when at least one conversation has unread messages", async () => {
    mockConversations([makeConversation({ id: "conv-1", unreadCount: 0 }), makeConversation({ id: "conv-2", unreadCount: 3 })]);

    const { result } = renderHook(() => useHasUnreadMessages());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("polls for updates every 5 seconds", async () => {
    let callCount = 0;
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount += 1;
      return Promise.resolve([makeConversation({ unreadCount: callCount === 1 ? 0 : 2 })]);
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useHasUnreadMessages());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current).toBe(true);
  });

  it("stops polling after unmount", async () => {
    mockConversations([makeConversation({ unreadCount: 0 })]);

    vi.useFakeTimers();
    const { unmount } = renderHook(() => useHasUnreadMessages());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const callsBeforeUnmount = (api.get as ReturnType<typeof vi.fn>).mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect((api.get as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBeforeUnmount);
  });
});
