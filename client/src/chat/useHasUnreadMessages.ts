import { useCallback, useEffect, useState } from "react";
import type { ConversationSummary } from "@cursive/shared";
import { api } from "../api/client.js";

const POLL_INTERVAL_MS = 5000;

export function useHasUnreadMessages(): boolean {
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    const conversations = await api.get<ConversationSummary[]>("/api/chat/conversations");
    setHasUnread(conversations.some((c) => c.unreadCount > 0));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return hasUnread;
}
