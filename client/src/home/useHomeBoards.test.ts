import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import { useHomeBoards } from "./useHomeBoards.js";

vi.mock("../api/client.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

function board(id: string) {
  return {
    id,
    name: `Board ${id}`,
    ownerName: "Ada",
    shareToken: `tok-${id}`,
    liveViewerCount: 0,
    totalViews: 0,
    createdAt: new Date().toISOString(),
    thumbnailShapes: [],
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useHomeBoards", () => {
  it("loads the initial page and sets loading to false", async () => {
    const board1 = board("1");
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ boards: [board1], hasMore: false });

    const { result } = renderHook(() => useHomeBoards());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.boards).toEqual([board1]);
    expect(result.current.hasMore).toBe(false);
  });

  it("polls every 15 seconds with the current limit", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ boards: [board("1")], hasMore: false });

    vi.useFakeTimers();
    const { result } = renderHook(() => useHomeBoards());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAfterInitialLoad = (api.get as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect((api.get as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterInitialLoad + 1);
    expect(result.current.loading).toBe(false);
  });

  it("sets error on a failed load and clears it on a successful retry", async () => {
    const board1 = board("1");
    (api.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useHomeBoards());

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);

    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ boards: [board1], hasMore: false });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.boards).toEqual([board1]);
  });

  it("loadMore increases the limit and re-fetches", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
      const url = new URL(path, "http://localhost");
      const limit = Number(url.searchParams.get("limit"));
      const boards = Array.from({ length: Math.min(limit, 30) }, (_, i) => board(String(i)));
      return Promise.resolve({ boards, hasMore: limit < 30 });
    });

    const { result } = renderHook(() => useHomeBoards());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.boards).toHaveLength(24);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.boards).toHaveLength(30));
    expect(result.current.hasMore).toBe(false);
  });
});
