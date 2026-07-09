import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "@cursive/shared";
import { useSession } from "../auth/authClient.js";

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
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      {messages.map((m) => {
        const isSelf = m.senderId === session?.user.id;
        return (
          <div
            key={m.id}
            data-message-id={m.id}
            style={{
              alignSelf: isSelf ? "flex-end" : "flex-start",
              maxWidth: "70%",
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              flexDirection: isSelf ? "row-reverse" : "row",
              cursor: onDeleteMessage ? "pointer" : undefined,
            }}
          >
            <div>
              {!isSelf && <div style={{ fontSize: 11, color: "#868e96" }}>{m.senderName ?? "Unknown"}</div>}
              <div
                style={{
                  background: isSelf ? "#1971c2" : "#f1f3f5",
                  color: isSelf ? "#fff" : "#1e1e1e",
                  borderRadius: 12,
                  padding: "8px 12px",
                }}
              >
                {m.content}
              </div>
            </div>
            {onDeleteMessage && openMessageId === m.id && (
              <button
                type="button"
                onClick={() => onDeleteMessage(m.id)}
                aria-label="Delete message"
                title="Delete message"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#adb5bd",
                  fontSize: 12,
                  lineHeight: 1,
                  padding: "4px 6px",
                }}
              >
                Delete
              </button>
            )}
          </div>
        );
      })}
      {typingUsers.length > 0 && (
        <div style={{ fontSize: 12, color: "#868e96", fontStyle: "italic" }}>{formatTypingText(typingUsers)}</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
