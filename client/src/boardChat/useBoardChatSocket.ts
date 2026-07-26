import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardChatClientEvent, BoardChatMessage, BoardChatServerEvent } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";
import { shareHeaders, type ShareRequestContext } from "../viewer/shareContext.js";

const RECONNECT_DELAY_MS = 2000;
const PAGE_SIZE = 30;

export function useBoardChatSocket(boardId: string, shareContext?: ShareRequestContext) {
  const [messages, setMessages] = useState<BoardChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      const { ticket } = await api.get<{ ticket: string }>(`/api/boards/${boardId}/chat/ticket`, {
        headers: shareHeaders(shareContext),
      });
      if (cancelled) return;

      socket = new WebSocket(`${env.BOARD_CHAT_SOCKET_URL}?ticket=${ticket}`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const data: BoardChatServerEvent = JSON.parse(event.data);
        if (data.type === "message") {
          setMessages((current) => [...current, data.message]);
        }
      };

      // The server can drop a connection for reasons unrelated to the user
      // (a deploy, a restart) — reconnect instead of leaving sendMessage
      // silently writing into a dead socket until a page reload.
      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [boardId, shareContext?.shareToken, shareContext?.anonId, shareContext?.anonName]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const oldest = messages[0];
      const query = oldest ? `?before=${oldest.id}` : "";
      const page = await api.get<BoardChatMessage[]>(`/api/boards/${boardId}/chat/messages${query}`, {
        headers: shareHeaders(shareContext),
      });
      const newMessages = page.slice().reverse();
      setMessages((current) => {
        const existingIds = new Set(current.map((m) => m.id));
        const deduped = newMessages.filter((m) => !existingIds.has(m.id));
        return [...deduped, ...current];
      });
      setHasMore(page.length === PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [boardId, messages, loading, shareContext]);

  const sendMessage = useCallback((content: string) => {
    const event: BoardChatClientEvent = { type: "send", content };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  return { messages, hasMore, loading, loadMore, sendMessage };
}
