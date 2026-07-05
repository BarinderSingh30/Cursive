import { useCallback, useEffect, useState } from "react";
import type { BoardSummary } from "@cursive/shared";
import { api } from "../api/client.js";

const BACKGROUND_REFRESH_MS = 3_000;

export function useBoards() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await api.get<BoardSummary[]>("/api/boards");
    setBoards(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // There's no open connection on the dashboard to push "you were just
  // invited to a board" over, unlike the board page's Hocuspocus socket —
  // so instead, refetch silently whenever you switch back to this tab, and
  // on a short interval as a fallback for "still sitting on this tab" cases.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(load, BACKGROUND_REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [load]);

  const createBoard = useCallback(async (name: string) => {
    const board = await api.post<BoardSummary>("/api/boards", { name });
    setBoards((current) => [board, ...current]);
    return board;
  }, []);

  const deleteBoard = useCallback(async (boardId: string) => {
    await api.delete(`/api/boards/${boardId}`);
    setBoards((current) => current.filter((b) => b.id !== boardId));
  }, []);

  return { boards, loading, createBoard, deleteBoard, refresh: load };
}
