import { useCallback, useEffect, useState } from "react";
import type { BoardMemberSummary } from "@cursive/shared";
import { api } from "../api/client.js";

export function useBoardMembers(boardId: string) {
  const [members, setMembers] = useState<BoardMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await api.get<BoardMemberSummary[]>(`/api/boards/${boardId}/members`);
    setMembers(data);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const removeMember = useCallback(
    async (userId: string) => {
      await api.delete(`/api/boards/${boardId}/members/${userId}`);
      setMembers((current) => current.filter((m) => m.userId !== userId));
    },
    [boardId],
  );

  return { members, loading, refresh, removeMember };
}
