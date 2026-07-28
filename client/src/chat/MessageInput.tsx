import { useState, type FormEvent } from "react";
import styles from "./MessageInput.module.css";

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
      <div className={styles.disabledNote}>
        You&rsquo;re no longer friends with this person — you can still see your message history, but can&rsquo;t
        send new messages.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.composer}>
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type a message…"
        className={styles.input}
      />
      <button type="submit" className={styles.sendButton}>
        Send
      </button>
    </form>
  );
}
