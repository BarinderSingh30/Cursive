import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatClientEvent, ChatMessage, ChatServerEvent, ConversationSummary } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";

export interface TypingUser {
  userId: string;
  userName: string | null;
}

const TYPING_THROTTLE_MS = 2000;
const TYPING_EXPIRY_MS = 3000;

export function useChatSocket() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({});
  const [typingByConversation, setTypingByConversation] = useState<Record<string, TypingUser[]>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const typingCooldownRef = useRef<Record<string, boolean>>({});
  const typingExpiryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const refreshConversations = useCallback(async () => {
    const list = await api.get<ConversationSummary[]>("/api/chat/conversations");
    setConversations(list);
  }, []);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  const handleTypingEvent = useCallback((conversationId: string, userId: string, userName: string | null) => {
    setTypingByConversation((current) => {
      const withoutUser = (current[conversationId] ?? []).filter((u) => u.userId !== userId);
      return { ...current, [conversationId]: [...withoutUser, { userId, userName }] };
    });

    const timerKey = `${conversationId}:${userId}`;
    clearTimeout(typingExpiryTimersRef.current[timerKey]);
    typingExpiryTimersRef.current[timerKey] = setTimeout(() => {
      setTypingByConversation((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? []).filter((u) => u.userId !== userId),
      }));
    }, TYPING_EXPIRY_MS);
  }, []);

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
        if (data.type === "typing") {
          handleTypingEvent(data.conversationId, data.userId, data.userName);
        }
      };
    })();

    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [refreshConversations, handleTypingEvent]);

  const [hasMoreByConversation, setHasMoreByConversation] = useState<Record<string, boolean>>({});
  const [loadingByConversation, setLoadingByConversation] = useState<Record<string, boolean>>({});

  const loadMore = useCallback(
    async (conversationId: string) => {
      if (loadingByConversation[conversationId]) return;

      setLoadingByConversation((current) => ({ ...current, [conversationId]: true }));
      try {
        const existing = messagesByConversation[conversationId] ?? [];
        const oldest = existing[0];
        const query = oldest ? `?before=${oldest.id}` : "";
        const page = await api.get<ChatMessage[]>(`/api/chat/conversations/${conversationId}/messages${query}`);
        const newMessages = page.slice().reverse();

        setMessagesByConversation((current) => {
          const currentMessages = current[conversationId] ?? [];
          const existingIds = new Set(currentMessages.map((m) => m.id));
          const deduped = newMessages.filter((m) => !existingIds.has(m.id));
          return { ...current, [conversationId]: [...deduped, ...currentMessages] };
        });
        setHasMoreByConversation((current) => ({ ...current, [conversationId]: page.length === 30 }));
      } finally {
        setLoadingByConversation((current) => ({ ...current, [conversationId]: false }));
      }
    },
    [messagesByConversation, loadingByConversation],
  );

  const sendMessage = useCallback((conversationId: string, content: string) => {
    const event: ChatClientEvent = { type: "send", conversationId, content };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  const notifyTyping = useCallback((conversationId: string) => {
    if (typingCooldownRef.current[conversationId]) return;
    typingCooldownRef.current[conversationId] = true;
    setTimeout(() => {
      typingCooldownRef.current[conversationId] = false;
    }, TYPING_THROTTLE_MS);

    const event: ChatClientEvent = { type: "typing", conversationId };
    socketRef.current?.send(JSON.stringify(event));
  }, []);

  const markRead = useCallback(
    async (conversationId: string) => {
      await api.post(`/api/chat/conversations/${conversationId}/read`);
      refreshConversations();
    },
    [refreshConversations],
  );

  return {
    conversations,
    messagesByConversation,
    typingByConversation,
    hasMoreByConversation,
    loadingByConversation,
    loadMore,
    sendMessage,
    notifyTyping,
    markRead,
    refreshConversations,
  };
}
