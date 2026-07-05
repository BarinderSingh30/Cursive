import { useState, type FormEvent } from "react";

interface Props {
  onSend: (content: string) => void;
}

export function MessageInput({ onSend }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e0e0e0" }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Type a message…"
        style={{ flex: 1 }}
      />
      <button type="submit">Send</button>
    </form>
  );
}
