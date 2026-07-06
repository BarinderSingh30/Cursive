import { useEffect, useRef, useState } from "react";

interface Props {
  onRemove: () => void;
}

export function FriendMenu({ onRemove }: Props) {
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

  const handleRemoveClick = () => {
    setOpen(false);
    onRemove();
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Friend options"
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
            minWidth: 140,
          }}
        >
          <button
            type="button"
            onClick={handleRemoveClick}
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
            Remove friend
          </button>
        </div>
      )}
    </div>
  );
}
