import { useEffect, useRef, useState } from "react";

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
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Conversation options"
        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            zIndex: 1,
            minWidth: 160,
          }}
        >
          <button
            type="button"
            onClick={handleClearClick}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Clear chat history
          </button>
        </div>
      )}
    </div>
  );
}
