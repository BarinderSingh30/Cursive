import { Link } from "react-router-dom";
import type { BoardSummary } from "@cursive/shared";

export function BoardCard({ board }: { board: BoardSummary }) {
  return (
    <Link
      to={`/board/${board.id}`}
      style={{
        display: "block",
        padding: 16,
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        textDecoration: "none",
        color: "#1e1e1e",
      }}
    >
      <strong>{board.name}</strong>
      <div style={{ fontSize: 12, color: "#868e96", marginTop: 4 }}>{board.role}</div>
    </Link>
  );
}
