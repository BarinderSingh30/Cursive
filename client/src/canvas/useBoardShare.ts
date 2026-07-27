import { useCallback, useEffect, useState } from "react";
import type { ShareLinkState, BoardListingState } from "@cursive/shared";
import { api } from "../api/client.js";

export function useBoardShare(boardId: string) {
  const [state, setState] = useState<ShareLinkState>({ enabled: false, token: null });
  const [listed, setListed] = useState(true);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [shareData, listingData] = await Promise.all([
      api.get<ShareLinkState>(`/api/boards/${boardId}/share`),
      api.get<BoardListingState>(`/api/boards/${boardId}/listed`),
    ]);
    setState(shareData);
    setListed(listingData.listed);
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

  const makePublic = useCallback(async () => {
    const result = await api.post<BoardListingState>(`/api/boards/${boardId}/listed/enable`);
    setListed(result.listed);
  }, [boardId]);

  const makePrivate = useCallback(async () => {
    const result = await api.post<BoardListingState>(`/api/boards/${boardId}/listed/disable`);
    setListed(result.listed);
  }, [boardId]);

  return { ...state, listed, loading, enable, disable, regenerate, makePublic, makePrivate };
}
