import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatClientEvent, ChatMessage, ChatServerEvent, ConversationSummary } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";

export function useChatSocket() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({});
  const socketRef = useRef<WebSocket | null>(null);

  const refreshConversations = useCallback(async () => {
    const list = await api.get<ConversationSummary[]>("/api/chat/conversations");
    setConversations(list);
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;

    (async () => {
      const { ticket } = await api.get<{ ticket: string }>("/api/chat/ticket");
      if (cancelled) return;

      socket = new WebSocket(`${env.CHAT_SOCKET_URL}?ticket=${ticket}`);
      socketRef.current = socket;

      socket.onmessage = (event) => {
        const data: ChatServerEvent = JSON.parse(event.data);
        if (data.type === "message") {
          setMessagesByConversation((current) => ({
            ...current,
            [data.message.conversationId]: [...(current[data.message.conversationId] ?? []), data.message],
          }));
          refreshConversations();
        }
        if (data.type === "conversation-created") {
          refreshConversations();
        }
      };
    })();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [refreshConversations]);

  const loadHistory = useCallback(async (conversationId: string) => {
    const history = await api.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages`);
    setMessagesByConversation((current) => ({ ...current, [conversationId]: history.slice().reverse() }));
  }, []);

  const sendMessage = useCallback((conversationId: string, content: string) => {
    const event: ChatClientEvent = { type: "send", conversationId, content };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  const markRead = useCallback(
    async (conversationId: string) => {
      await api.post(`/api/chat/conversations/${conversationId}/read`);
      refreshConversations();
    },
    [refreshConversations],
  );

  return { conversations, messagesByConversation, loadHistory, sendMessage, markRead, refreshConversations };
}
