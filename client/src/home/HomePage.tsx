import { Link } from "react-router-dom";
import { useSession } from "../auth/authClient.js";
import { useHomeBoards } from "./useHomeBoards.js";
import { BoardListingCard } from "./BoardListingCard.js";

export function HomePage() {
  const { data: session } = useSession();
  const { boards, hasMore, loading, error, loadMore, retry } = useHomeBoards();

  return (
    <div style={{ maxWidth: 960, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Cursive</h1>
        {session ? <Link to="/dashboard">Dashboard</Link> : <Link to="/login">Log in</Link>}
      </div>

      {error ? (
        <div>
          <p>Couldn't load boards. Please try again.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <p>Loading…</p>
      ) : boards.length === 0 ? (
        <p>No public boards yet.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {boards.map((board) => (
              <BoardListingCard key={board.id} board={board} />
            ))}
          </div>
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
              <button type="button" onClick={loadMore}>
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
