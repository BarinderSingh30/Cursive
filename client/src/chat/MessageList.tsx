import { useEffect, useRef } from "react";
import type { ChatMessage } from "@cursive/shared";
import { useSession } from "../auth/authClient.js";

export interface TypingUser {
  userId: string;
  userName: string | null;
}

interface Props {
  messages: ChatMessage[];
  typingUsers?: TypingUser[];
}

function formatTypingText(users: TypingUser[]): string {
  const names = users.map((u) => u.userName ?? "Someone");
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  const [first, second, ...rest] = names;
  const label = rest.length === 1 ? "other" : "others";
  return `${first}, ${second}, and ${rest.length} ${label} are typing…`;
}

export function MessageList({ messages, typingUsers = [] }: Props) {
  const { data: session } = useSession();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      {messages.map((m) => {
        const isSelf = m.senderId === session?.user.id;
        return (
          <div key={m.id} style={{ alignSelf: isSelf ? "flex-end" : "flex-start", maxWidth: "70%" }}>
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
        );
      })}
      {typingUsers.length > 0 && (
        <div style={{ fontSize: 12, color: "#868e96", fontStyle: "italic" }}>{formatTypingText(typingUsers)}</div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
