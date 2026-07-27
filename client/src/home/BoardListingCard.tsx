import { Link } from "react-router-dom";
import type { HomeBoard } from "@cursive/shared";

export function BoardListingCard({ board }: { board: HomeBoard }) {
  return (
    <Link
      to={`/watch/${board.shareToken}`}
      style={{
        display: "block",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: 16,
        textDecoration: "none",
        color: "#1e1e1e",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong>{board.name}</strong>
        {board.liveViewerCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: "#fff",
              background: "#e03131",
              borderRadius: 4,
              padding: "2px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {board.liveViewerCount} watching
          </span>
        )}
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#868e96" }}>
        by {board.ownerName} · {board.totalViews} {board.totalViews === 1 ? "view" : "views"}
      </p>
    </Link>
  );
}
