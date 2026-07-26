import { useEffect, useState } from "react";
import type { ShareLinkInfo } from "@cursive/shared";
import { api, ApiError } from "../api/client.js";

export function useShareLink(shareToken: string) {
  const [info, setInfo] = useState<ShareLinkInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ShareLinkInfo>(`/api/boards/by-share/${shareToken}`)
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  return { info, notFound, loading };
}
