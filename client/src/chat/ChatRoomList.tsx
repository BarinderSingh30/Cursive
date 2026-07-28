import type { ConversationSummary } from "@cursive/shared";
import { Avatar } from "../ui/Avatar.js";
import styles from "./ChatRoomList.module.css";

const AVATAR_COLORS = ["#1971c2", "#2f9e44", "#f08c00", "#9c36b5", "#0c8599", "#e8590c"];

function avatarColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function ChatRoomList({ conversations, activeId, onSelect }: Props) {
  if (conversations.length === 0) {
    return <p className={styles.empty}>No conversations yet — message a friend to start one.</p>;
  }

  return (
    <ul className={styles.list}>
      {conversations.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className={`${styles.row} ${c.id === activeId ? styles.rowActive : ""}`}
          >
            <Avatar name={c.displayName} color={avatarColorFor(c.id)} size={38} />
            <span className={styles.rowInfo}>
              <p className={styles.rowName}>{c.displayName}</p>
              <p className={styles.rowPreview}>{c.lastMessage ?? "No messages yet"}</p>
            </span>
            {c.unreadCount > 0 && <span className={styles.unreadBadge}>{c.unreadCount}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
