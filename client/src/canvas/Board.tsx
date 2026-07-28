import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Toolbar } from "./tools/Toolbar.js";
import { ActiveToolProvider } from "./tools/useActiveTool.js";
import { InviteMemberDialog } from "./InviteMemberDialog.js";
import { ShareBoardDialog } from "./ShareBoardDialog.js";
import { BoardExperience } from "./BoardExperience.js";
import { useBoard } from "./useBoard.js";
import { useSession } from "../auth/authClient.js";
import { Button } from "../ui/Button.js";
import styles from "./Board.module.css";

function BoardDeletedOverlay() {
  return (
    <div className={styles.deletedOverlay}>
      <p className={styles.deletedText}>The owner deleted this board.</p>
      <Link to="/dashboard">
        <Button variant="secondary">Go back to dashboard</Button>
      </Link>
    </div>
  );
}

function BoardInner({ roomId }: { roomId: string }) {
  const { data: session } = useSession();
  const { board, error: boardError, refresh: refreshBoard } = useBoard(roomId);
  const [boardDeleted, setBoardDeleted] = useState(false);
  const [membershipVersion, setMembershipVersion] = useState(0);
  const [joinCallSlot, setJoinCallSlot] = useState<HTMLDivElement | null>(null);

  const userId = session?.user.id ?? null;
  const userName = session?.user.name || session?.user.email || "Guest";
  const isViewer = board?.role === "viewer";

  // If we no longer have access — e.g. the owner just removed us — bounce
  // back to the dashboard automatically. Board *deletion* is handled
  // separately below with an explicit message instead of a silent redirect.
  useEffect(() => {
    if (boardError && !boardDeleted) {
      window.location.href = "/dashboard";
    }
  }, [boardError, boardDeleted]);

  if (boardDeleted) return <BoardDeletedOverlay />;
  if (!board) return <p className={styles.loading}>Loading…</p>;

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <div className={styles.row1}>
          <div className={styles.titleGroup}>
            <Link to="/dashboard" className={styles.backLink}>
              ← Boards
            </Link>
            <span className={styles.title}>{board.name}</span>
          </div>
          <div className={styles.actionGroup}>
            <div ref={setJoinCallSlot} className={styles.actionGroup} />
            {board.role === "owner" && <ShareBoardDialog boardId={roomId} />}
            {board.role === "owner" && <InviteMemberDialog boardId={roomId} membershipVersion={membershipVersion} />}
          </div>
        </div>
        <div className={styles.row2}>{isViewer ? <span className={styles.viewingBadge}>👀 Viewing only</span> : <Toolbar />}</div>
      </div>
      <BoardExperience
        boardId={roomId}
        role={board.role}
        userId={userId}
        userName={userName}
        joinCallSlot={joinCallSlot}
        onMembershipChanged={() => {
          refreshBoard();
          setMembershipVersion((v) => v + 1);
        }}
        onBoardDeleted={() => setBoardDeleted(true)}
      />
    </div>
  );
}

export function Board({ roomId }: { roomId: string }) {
  return (
    <ActiveToolProvider>
      <BoardInner roomId={roomId} />
    </ActiveToolProvider>
  );
}
