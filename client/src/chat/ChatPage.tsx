import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFriends } from "../friends/useFriends.js";
import { api } from "../api/client.js";
import { useChatSocket } from "./useChatSocket.js";
import { ChatRoomList } from "./ChatRoomList.js";
import { FriendSearch } from "./FriendSearch.js";
import { MessageList } from "./MessageList.js";
import { MessageInput } from "./MessageInput.js";
import { CreateGroupDialog } from "./CreateGroupDialog.js";
import { ConversationMenu } from "./ConversationMenu.js";
import styles from "./ChatPage.module.css";

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
    deleteMessage,
    clearHistory,
  } = useChatSocket();
  const { friends } = useFriends();
  const [activeId, setActiveId] = useState<string | null>(null);
  const loadedConversationsRef = useRef<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Lets other screens (e.g. the Friends page's "Message" action) deep-link
  // straight into a DM via /messages?dm=<friendEmail>, reusing the same
  // conversation-creation flow startDm() already provides for FriendSearch.
  useEffect(() => {
    const dmEmail = searchParams.get("dm");
    if (!dmEmail) return;
    setSearchParams((params) => {
      params.delete("dm");
      return params;
    });
    startDm(dmEmail);
  }, [searchParams]);

  const activeConversation = conversations.find((c) => c.id === activeId);

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarHeading}>Messages</h2>
          <Link to="/dashboard" className={styles.backLink}>
            ← Boards
          </Link>
        </div>
        <div className={styles.sidebarActions}>
          <FriendSearch friends={friends} onSelect={startDm} />
          <CreateGroupDialog onCreated={setActiveId} />
        </div>
        <ChatRoomList conversations={conversations} activeId={activeId} onSelect={setActiveId} />
      </div>
      <div className={styles.thread}>
        {activeId ? (
          <>
            <div className={styles.threadHeader}>
              <h3 className={styles.threadHeading}>{activeConversation?.displayName}</h3>
              <ConversationMenu onClearHistory={() => clearHistory(activeId)} />
            </div>
            <MessageList
              messages={messagesByConversation[activeId] ?? []}
              typingUsers={typingByConversation[activeId] ?? []}
              onReachTop={() => loadMore(activeId)}
              loading={loadingByConversation[activeId] ?? false}
              hasMore={hasMoreByConversation[activeId] ?? true}
              onDeleteMessage={(messageId) => deleteMessage(activeId, messageId)}
            />
            <MessageInput
              onSend={(content) => sendMessage(activeId, content)}
              onTyping={() => notifyTyping(activeId)}
              disabled={activeConversation?.canSend === false}
            />
          </>
        ) : (
          <div className={styles.emptyThread}>Select a conversation to start chatting</div>
        )}
      </div>
    </div>
  );
}
