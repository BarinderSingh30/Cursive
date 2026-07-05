import { useState } from "react";
import { Link } from "react-router-dom";
import type { BoardRole } from "@cursive/shared";
import { signOut, useSession } from "../auth/authClient.js";
import { useBoards } from "./useBoards.js";
import { BoardCard } from "./BoardCard.js";
import { CreateBoardDialog } from "./CreateBoardDialog.js";
import { NotificationsButton } from "./NotificationsButton.js";

const TABS: { role: BoardRole; label: string; emptyMessage: string }[] = [
  { role: "owner", label: "My boards", emptyMessage: "No boards yet — create your first one below." },
  { role: "collaborator", label: "Collaborating on", emptyMessage: "No boards where you're a collaborator yet." },
  { role: "viewer", label: "Viewing", emptyMessage: "No boards where you're a viewer yet." },
];

export function DashboardPage() {
  const { data: session } = useSession();
  const { boards, loading, createBoard, deleteBoard, refresh: refreshBoards } = useBoards();
  const [activeTab, setActiveTab] = useState<BoardRole>("owner");

  const activeBoards = boards.filter((b) => b.role === activeTab);
  const activeTabInfo = TABS.find((t) => t.role === activeTab)!;

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Your boards</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#868e96" }}>{session?.user.name || session?.user.email}</span>
          <NotificationsButton onAccepted={refreshBoards} />
          <Link to="/friends">Friends</Link>
          <Link to="/messages">Messages</Link>
          <button type="button" onClick={() => signOut().then(() => (window.location.href = "/login"))}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e0e0e0", marginBottom: 16 }}>
        {TABS.map((tab) => {
          const count = boards.filter((b) => b.role === tab.role).length;
          const isActive = tab.role === activeTab;
          return (
            <button
              key={tab.role}
              type="button"
              onClick={() => setActiveTab(tab.role)}
              style={{
                padding: "8px 14px",
                border: "none",
                borderBottom: isActive ? "2px solid #1971c2" : "2px solid transparent",
                background: "transparent",
                color: isActive ? "#1971c2" : "#495057",
                fontWeight: isActive ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {tab.label} {count > 0 && `(${count})`}
            </button>
          );
        })}
      </div>

      {activeTab === "owner" && (
        <div style={{ marginBottom: 16 }}>
          <CreateBoardDialog onCreate={createBoard} />
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : activeBoards.length === 0 ? (
        <p>{activeTabInfo.emptyMessage}</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {activeBoards.map((board) => (
            <BoardCard key={board.id} board={board} onDelete={deleteBoard} />
          ))}
        </div>
      )}
    </div>
  );
}
