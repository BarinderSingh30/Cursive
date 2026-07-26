import { useCallback, useEffect, useState } from "react";
import type { ShareLinkState } from "@cursive/shared";
import { api } from "../api/client.js";

export function useBoardShare(boardId: string) {
  const [state, setState] = useState<ShareLinkState>({ enabled: false, token: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.get<ShareLinkState>(`/api/boards/${boardId}/share`);
    setState(data);
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    setState(await api.post<ShareLinkState>(`/api/boards/${boardId}/share/enable`));
  }, [boardId]);

  const disable = useCallback(async () => {
    setState(await api.post<ShareLinkState>(`/api/boards/${boardId}/share/disable`));
  }, [boardId]);

  const regenerate = useCallback(async () => {
    setState(await api.post<ShareLinkState>(`/api/boards/${boardId}/share/regenerate`));
  }, [boardId]);

  return { ...state, loading, enable, disable, regenerate };
}
