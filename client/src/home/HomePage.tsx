import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../auth/authClient.js";
import { useHomeBoards } from "./useHomeBoards.js";
import { BoardListingCard } from "./BoardListingCard.js";
import { PaperBar } from "../ui/PaperBar.js";
import { Wordmark } from "../ui/Wordmark.js";
import { Button } from "../ui/Button.js";
import { Avatar } from "../ui/Avatar.js";
import styles from "./HomePage.module.css";

export function HomePage() {
  const { data: session } = useSession();
  const { boards, hasMore, loading, error, loadMore, retry } = useHomeBoards();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const visibleBoards = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return boards;
    return boards.filter(
      (board) => board.name.toLowerCase().includes(query) || board.ownerName.toLowerCase().includes(query),
    );
  }, [boards, search]);

  return (
    <div className={styles.page}>
      <PaperBar
        left={<Wordmark size={28} />}
        right={
          session ? (
            <>
              <Avatar name={session.user.name} color="#1971c2" size={30} />
              <Button variant="secondary" onClick={() => navigate("/dashboard")}>
                Dashboard
              </Button>
            </>
          ) : (
            <>
              <span className={styles.barText}>Look around without an account</span>
              <Button onClick={() => navigate("/login")}>Log in</Button>
            </>
          )
        }
      />

      <div className={styles.heroRow}>
        <div>
          <h1 className={styles.heading}>Boards anyone can watch</h1>
          <p className={styles.subheading}>Public whiteboards, live as they're drawn.</p>
        </div>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search public boards…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search public boards"
        />
      </div>

      {error && boards.length === 0 ? (
        <div className={styles.statusCard}>
          <p>Couldn't load boards. Please try again.</p>
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className={styles.statusCard}>Loading…</div>
      ) : boards.length === 0 ? (
        <div className={styles.statusCard}>No public boards yet.</div>
      ) : (
        <>
          {error && <p className={styles.staleNotice}>Having trouble updating the list — showing the last known boards.</p>}
          {visibleBoards.length === 0 ? (
            <div className={styles.statusCard}>No boards match "{search}".</div>
          ) : (
            <div className={styles.grid}>
              {visibleBoards.map((board, index) => (
                <BoardListingCard key={board.id} board={board} index={index} />
              ))}
              <div className={styles.moreSlot}>more boards get pinned here</div>
            </div>
          )}
          {hasMore && (
            <div className={styles.loadMoreRow}>
              <Button variant="secondary" onClick={loadMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
