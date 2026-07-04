import { Link } from "react-router-dom";
import { signOut, useSession } from "../auth/authClient.js";
import { useBoards } from "./useBoards.js";
import { BoardCard } from "./BoardCard.js";
import { CreateBoardDialog } from "./CreateBoardDialog.js";

export function DashboardPage() {
  const { data: session } = useSession();
  const { boards, loading, createBoard } = useBoards();

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Your boards</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 14, color: "#868e96" }}>{session?.user.email}</span>
          <Link to="/friends">Friends</Link>
          <button type="button" onClick={() => signOut()}>
            Log out
          </button>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <CreateBoardDialog onCreate={createBoard} />
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : boards.length === 0 ? (
        <p>No boards yet — create your first one above.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      )}
    </div>
  );
}
