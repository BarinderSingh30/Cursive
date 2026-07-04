import { useCallback, useEffect, useState } from "react";
import type { BoardSummary } from "@cursive/shared";
import { api } from "../api/client.js";

export function useBoards() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await api.get<BoardSummary[]>("/api/boards");
    setBoards(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createBoard = useCallback(async (name: string) => {
    const board = await api.post<BoardSummary>("/api/boards", { name });
    setBoards((current) => [board, ...current]);
    return board;
  }, []);

  return { boards, loading, createBoard, refresh };
}
