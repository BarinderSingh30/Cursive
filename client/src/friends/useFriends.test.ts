import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import { useFriends } from "./useFriends.js";

vi.mock("../api/client.js", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

function mockApiGet(routes: Record<string, unknown>) {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
    if (path in routes) return Promise.resolve(routes[path]);
    throw new Error(`Unmocked path: ${path}`);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFriends polling", () => {
  it("sets loading to false after the initial fetch", async () => {
    mockApiGet({ "/api/friends": [], "/api/friends/requests": [] });

    const { result } = renderHook(() => useFriends());

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("polls for updates every 5 seconds without re-entering the loading state", async () => {
    let friendsCallCount = 0;
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      if (path === "/api/friends") {
        friendsCallCount += 1;
        return Promise.resolve(
          friendsCallCount === 1 ? [] : [{ id: "f1", email: "alice@example.com", name: "Alice" }],
        );
      }
      if (path === "/api/friends/requests") return Promise.resolve([]);
      throw new Error(`Unmocked path: ${path}`);
    });

    vi.useFakeTimers();
    const { result } = renderHook(() => useFriends());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.friends).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(result.current.friends).toEqual([{ id: "f1", email: "alice@example.com", name: "Alice" }]);
    expect(result.current.loading).toBe(false);
  });

  it("stops polling after unmount", async () => {
    mockApiGet({ "/api/friends": [], "/api/friends/requests": [] });

    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useFriends());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loading).toBe(false);

    const callsBeforeUnmount = (api.get as ReturnType<typeof vi.fn>).mock.calls.length;
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect((api.get as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBeforeUnmount);
  });
});
