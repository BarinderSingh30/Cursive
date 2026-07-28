import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardChatMessage } from "@cursive/shared";
import styles from "./BoardChatPanel.module.css";

interface Props {
  messages: BoardChatMessage[];
  canPost: boolean;
  onSend: (content: string) => void;
  onReachTop: () => void;
}

const PINNED_THRESHOLD = 40;

export function BoardChatPanel({ messages, canPost, onSend, onReachTop }: Props) {
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Only autoscroll to new messages when the user was already at the bottom
  // of the list — someone scrolled up to read history shouldn't get yanked
  // back down every time a new line arrives.
  const chatPinnedToBottom = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list?.scrollTo && chatPinnedToBottom.current) {
      list.scrollTo({ top: list.scrollHeight });
    }
  }, [messages]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    chatPinnedToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight <= PINNED_THRESHOLD;
    if (list.scrollTop === 0) onReachTop();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  };

  if (collapsed) {
    return (
      <div className={styles.collapsedRail}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show chat"
          title="Show chat"
          className={styles.collapseToggle}
        >
          ◀
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Only visible under the ~1100px breakpoint (see .backdrop's media query) — closes the chat slide-over by tapping outside it. */}
      <button
        type="button"
        className={styles.backdrop}
        onClick={() => setCollapsed(true)}
        aria-label="Close chat"
        tabIndex={-1}
      />
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.heading}>Board chat</span>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Hide chat"
            title="Hide chat"
            className={styles.collapseToggle}
          >
            ▶
          </button>
        </div>
        <div ref={listRef} onScroll={handleScroll} className={styles.list}>
          {messages.map((m) => (
            <div key={m.id} className={styles.line}>
              <span className={styles.author}>{m.authorName ?? "Someone"}</span>
              <span className={styles.sep}>·</span>
              <span>{m.content}</span>
            </div>
          ))}
        </div>
        {canPost ? (
          <form onSubmit={handleSubmit} className={styles.composer}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Say something…"
              aria-label="Chat message"
              className={styles.input}
            />
            <button type="submit" className={styles.sendButton}>
              Send
            </button>
          </form>
        ) : (
          <div className={styles.loginPrompt}>
            <p className={styles.loginPromptHeading}>Want to chat along?</p>
            <p className={styles.loginPromptBody}>
              <a href="/login">Log in</a> to chat
            </p>
          </div>
        )}
      </div>
    </>
  );
}
