import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { BoardSummary } from "@cursive/shared";

interface Props {
  board: BoardSummary;
  onDelete: (boardId: string) => void;
}

export function BoardCard({ board, onDelete }: Props) {
  const handleDelete = (e: MouseEvent) => {
    e.preventDefault();
    if (window.confirm(`Delete "${board.name}"? This can't be undone.`)) {
      onDelete(board.id);
    }
  };

  return (
    <div style={{ position: "relative", border: "1px solid #e0e0e0", borderRadius: 8 }}>
      <Link
        to={`/board/${board.id}`}
        style={{
          display: "block",
          padding: 16,
          textDecoration: "none",
          color: "#1e1e1e",
        }}
      >
        <strong>{board.name}</strong>
      </Link>
      {board.role === "owner" && (
        <button
          type="button"
          onClick={handleDelete}
          title="Delete board"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            border: "none",
            background: "transparent",
            color: "#e03131",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
