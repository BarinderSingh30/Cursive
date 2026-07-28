import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "@cursive/shared";
import { useSession } from "../auth/authClient.js";
import styles from "./MessageList.module.css";

export interface TypingUser {
  userId: string;
  userName: string | null;
}

interface Props {
  messages: ChatMessage[];
  typingUsers?: TypingUser[];
  onReachTop?: () => void;
  loading?: boolean;
  hasMore?: boolean;
  onDeleteMessage?: (messageId: string) => void;
}

function formatTypingText(users: TypingUser[]): string {
  const names = users.map((u) => u.userName ?? "Someone");
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const [first, second, ...rest] = names;
  const label = rest.length === 1 ? "other" : "others";
  return `${first}, ${second}, and ${rest.length} ${label} are typing…`;
}

const SCROLL_TOP_THRESHOLD = 40;

export function MessageList({
  messages,
  typingUsers = [],
  onReachTop,
  loading = false,
  hasMore = true,
  onDeleteMessage,
}: Props) {
  const { data: session } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);

  // Single source of truth for open/close: clicking a message opens it (or
  // closes it if already open), clicking a different message switches to it,
  // and clicking anywhere else closes whatever's open. Handling this in one
  // listener avoids a race between a per-message click handler and a
  // separate "outside click" listener fighting over the same state.
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickedId = target.closest<HTMLElement>("[data-message-id]")?.dataset.messageId ?? null;
      setOpenMessageId((current) => (clickedId === current ? null : clickedId));
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (prevScrollHeightRef.current !== null) {
      container.scrollTop += container.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = null;
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container || !onReachTop || loading || !hasMore) return;
    if (container.scrollTop <= SCROLL_TOP_THRESHOLD) {
      prevScrollHeightRef.current = container.scrollHeight;
      onReachTop();
    }
  };

  return (
    <div ref={containerRef} onScroll={handleScroll} className={styles.list}>
      {messages.map((m) => {
        const isSelf = m.senderId === session?.user.id;
        return (
          <div
            key={m.id}
            data-message-id={m.id}
            className={`${styles.messageRow} ${isSelf ? styles.self : styles.other}`}
            style={{ cursor: onDeleteMessage ? "pointer" : undefined }}
          >
            <div>
              {!isSelf && <div className={styles.senderName}>{m.senderName ?? "Unknown"}</div>}
              <div className={`${styles.bubble} ${isSelf ? styles.bubbleSelf : styles.bubbleOther}`}>{m.content}</div>
            </div>
            {onDeleteMessage && openMessageId === m.id && (
              <button
                type="button"
                onClick={() => onDeleteMessage(m.id)}
                aria-label="Delete message"
                title="Delete message"
                className={styles.deleteButton}
              >
                Delete
              </button>
            )}
          </div>
        );
      })}
      {typingUsers.length > 0 && <div className={styles.typing}>{formatTypingText(typingUsers)}</div>}
      <div ref={bottomRef} />
    </div>
  );
}
