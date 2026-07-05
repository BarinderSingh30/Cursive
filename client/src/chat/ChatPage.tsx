import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useFriends } from "../friends/useFriends.js";
import { api } from "../api/client.js";
import { useChatSocket } from "./useChatSocket.js";
import { ChatRoomList } from "./ChatRoomList.js";
import { MessageList } from "./MessageList.js";
import { MessageInput } from "./MessageInput.js";
import { CreateGroupDialog } from "./CreateGroupDialog.js";

export function ChatPage() {
  const {
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
  } = useChatSocket();
  const { friends } = useFriends();
  const [activeId, setActiveId] = useState<string | null>(null);
  const loadedConversationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeId) return;
    if (!loadedConversationsRef.current.has(activeId)) {
      loadedConversationsRef.current.add(activeId);
      loadMore(activeId);
    }
    markRead(activeId);
  }, [activeId, loadMore, markRead]);

  const startDm = async (friendEmail: string) => {
    const { id } = await api.post<{ id: string }>("/api/chat/conversations/dm", { friendEmail });
    await refreshConversations();
    setActiveId(id);
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 260, borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Messages</h2>
          <Link to="/dashboard">← Boards</Link>
        </div>
        <div style={{ padding: 12, borderBottom: "1px solid #e0e0e0", display: "flex", flexDirection: "column", gap: 8 }}>
          <select onChange={(e) => e.target.value && startDm(e.target.value)} value="">
            <option value="" disabled>
              Message a friend…
            </option>
            {friends.map((f) => (
              <option key={f.id} value={f.email}>
                {f.name ?? f.email}
              </option>
            ))}
          </select>
          <CreateGroupDialog onCreated={setActiveId} />
        </div>
        <ChatRoomList conversations={conversations} activeId={activeId} onSelect={setActiveId} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {activeId ? (
          <>
            <MessageList messages={messagesByConversation[activeId] ?? []} />
            <MessageInput onSend={(content) => sendMessage(activeId, content)} />
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#868e96" }}>
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
