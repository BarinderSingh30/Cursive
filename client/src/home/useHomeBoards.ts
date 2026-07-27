import { useCallback, useEffect, useState } from "react";
import type { HomeBoardsPage } from "@cursive/shared";
import { api } from "../api/client.js";

const POLL_MS = 15_000;
const PAGE_SIZE = 24;

export function useHomeBoards() {
  const [page, setPage] = useState<HomeBoardsPage>({ boards: [], hasMore: false });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Never rejects: a failed fetch sets `error` instead of throwing, so both
  // the initial-load effect and the polling interval below can call this
  // without a dangling .catch — a rejection here would otherwise surface as
  // an unhandled promise rejection every 15s while the API is down.
  const load = useCallback(async (currentLimit: number) => {
    try {
      const data = await api.get<HomeBoardsPage>(`/api/home?limit=${currentLimit}`);
      setPage(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(limit).finally(() => setLoading(false));
  }, [load, limit]);

  // Re-fetches the same limit on an interval, so live viewer counts and
  // rankings update without the user refreshing — never shrinks the list
  // a "Load more" click already expanded, since it always asks for the
  // current limit, not the original page size.
  useEffect(() => {
    const interval = setInterval(() => load(limit), POLL_MS);
    return () => clearInterval(interval);
  }, [load, limit]);

  const loadMore = useCallback(() => {
    setLimit((current) => current + PAGE_SIZE);
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    load(limit).finally(() => setLoading(false));
  }, [load, limit]);

  return { boards: page.boards, hasMore: page.hasMore, loading, error, loadMore, retry };
}
