import { useCallback, useEffect, useState } from "react";
import type { PendingBoardInvite } from "@cursive/shared";
import { api } from "../api/client.js";

export function usePendingBoardInvites(boardId: string) {
  const [invites, setInvites] = useState<PendingBoardInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.get<PendingBoardInvite[]>(`/api/boards/${boardId}/invites`);
    setInvites(data);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { invites, loading, refresh };
}
