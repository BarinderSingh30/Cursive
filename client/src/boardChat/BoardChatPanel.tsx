import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardChatMessage } from "@cursive/shared";

interface Props {
  messages: BoardChatMessage[];
  canPost: boolean;
  onSend: (content: string) => void;
  onReachTop: () => void;
}

export function BoardChatPanel({ messages, canPost, onSend, onReachTop }: Props) {
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current?.scrollTo) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  };

  if (collapsed) {
    return (
      <div
        style={{
          width: 32,
          borderLeft: "1px solid #e0e0e0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show chat"
          title="Show chat"
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, padding: 4 }}
        >
          ◀
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: 300, borderLeft: "1px solid #e0e0e0", display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid #e0e0e0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong>Chat</strong>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Hide chat"
          title="Hide chat"
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, padding: 4 }}
        >
          ▶
        </button>
      </div>
      <div
        ref={listRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop === 0) onReachTop();
        }}
        style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
      >
        {messages.map((m) => (
          <div key={m.id} style={{ fontSize: 13 }}>
            <strong>{m.authorName ?? "Someone"}</strong> <span>{m.content}</span>
          </div>
        ))}
      </div>
      {canPost ? (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e0e0e0" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something…"
            aria-label="Chat message"
            style={{ flex: 1 }}
          />
          <button type="submit">Send</button>
        </form>
      ) : (
        <div style={{ padding: 12, borderTop: "1px solid #e0e0e0", fontSize: 13, color: "#868e96" }}>
          <a href="/login">Log in</a> to chat
        </div>
      )}
    </div>
  );
}
