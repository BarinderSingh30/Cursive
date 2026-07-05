import { useEffect, useRef } from "react";
import type { ChatMessage } from "@cursive/shared";
import { useSession } from "../auth/authClient.js";

interface Props {
  messages: ChatMessage[];
}

export function MessageList({ messages }: Props) {
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
      <div ref={bottomRef} />
    </div>
  );
}
