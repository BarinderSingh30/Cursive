import { useCallback, useEffect, useState } from "react";
import type { BoardSummary } from "@cursive/shared";
import { api, ApiError } from "../api/client.js";

export function useBoard(boardId: string) {
  const [board, setBoard] = useState<BoardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<BoardSummary>(`/api/boards/${boardId}`);
      setBoard(data);
      setError(null);
    } catch (err) {
      // Most likely a 403/404 — we were removed from this board (or it was deleted).
      setError(err instanceof ApiError ? err : new ApiError(500, "Could not load this board"));
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { board, loading, error, refresh };
}
