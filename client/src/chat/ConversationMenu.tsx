import { useEffect, useRef, useState } from "react";
import styles from "./ConversationMenu.module.css";

interface Props {
  onClearHistory: () => void;
}

export function ConversationMenu({ onClearHistory }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleDocumentClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [open]);

  const handleClearClick = () => {
    setOpen(false);
    if (window.confirm("Clear this conversation's history? You won't see past messages anymore.")) {
      onClearHistory();
    }
  };

  return (
    <div ref={containerRef} className={styles.wrap}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Conversation options" className={styles.trigger}>
        ⋯
      </button>
      {open && (
        <div className={styles.menu}>
          <button type="button" onClick={handleClearClick} className={styles.menuItem}>
            Clear chat history
          </button>
        </div>
      )}
    </div>
  );
}
