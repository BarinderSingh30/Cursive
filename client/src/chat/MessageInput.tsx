import { useState, type FormEvent } from "react";

interface Props {
  onSend: (content: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, onTyping, disabled = false }: Props) {
  const [value, setValue] = useState("");

  const handleChange = (next: string) => {
    setValue(next);
    if (next.trim().length > 0) onTyping?.();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  if (disabled) {
    return (
      <div style={{ padding: 12, borderTop: "1px solid #e0e0e0", color: "#868e96", fontSize: 14 }}>
        You&rsquo;re no longer friends with this person — you can still see your message history, but can&rsquo;t
        send new messages.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e0e0e0" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type a message…"
        style={{ flex: 1 }}
      />
      <button type="submit">Send</button>
    </form>
  );
}
