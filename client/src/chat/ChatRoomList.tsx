import type { ConversationSummary } from "@cursive/shared";

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ChatRoomList({ conversations, activeId, onSelect }: Props) {
  if (conversations.length === 0) {
    return <p style={{ color: "#868e96", padding: 12 }}>No conversations yet — message a friend to start one.</p>;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: 10,
              border: "none",
              borderBottom: "1px solid #f1f3f5",
              background: c.id === activeId ? "#e7f5ff" : "transparent",
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              <strong>{c.displayName}</strong>
              <br />
              <span style={{ fontSize: 12, color: "#868e96" }}>{c.lastMessage ?? "No messages yet"}</span>
            </span>
            {c.unreadCount > 0 && (
              <span
                style={{
                  background: "#e03131",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 20,
                  height: 20,
                  fontSize: 11,
                  textAlign: "center",
                  lineHeight: "20px",
                  flexShrink: 0,
                }}
              >
                {c.unreadCount}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
