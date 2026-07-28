import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ActiveToolProvider } from "../canvas/tools/useActiveTool.js";
import { BoardExperience } from "../canvas/BoardExperience.js";
import { useSession } from "../auth/authClient.js";
import { useShareLink } from "./useShareLink.js";
import { useAnonIdentity } from "./useAnonIdentity.js";
import { Wordmark } from "../ui/Wordmark.js";
import { Logo } from "../ui/Logo.js";
import { Button } from "../ui/Button.js";
import styles from "./WatchPage.module.css";

const REDIRECT_DELAY_MS = 2500;

function BoardDeletedRedirect() {
  return (
    <div className={styles.centered}>
      <p className={styles.centeredText}>The owner ended this board. Taking you back to Home…</p>
      <a href="/" className={styles.centeredLink}>
        Go to Home now
      </a>
    </div>
  );
}

function LinkNotActive() {
  return (
    <div className={styles.centered}>
      <p className={styles.centeredText}>This link isn't active.</p>
      <a href="/login" className={styles.centeredLink}>
        Log in
      </a>
    </div>
  );
}

function AnonNamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  return (
    <div className={styles.namePrompt}>
      <Wordmark size={32} onDark />
      <p className={styles.namePromptText}>What should we call you in chat?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim();
          if (input) onSubmit(input);
        }}
        className={styles.namePromptForm}
      >
        <input name="name" placeholder="Guest name" required className={styles.namePromptInput} />
        <Button type="submit">Continue</Button>
      </form>
    </div>
  );
}

export function WatchPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const { info, notFound, loading } = useShareLink(shareToken!);
  const { anonId, anonName, setAnonName } = useAnonIdentity(shareToken!);
  const [boardDeleted, setBoardDeleted] = useState(false);

  useEffect(() => {
    if (!boardDeleted) return;
    const timeout = setTimeout(() => navigate("/"), REDIRECT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [boardDeleted, navigate]);

  if (boardDeleted) return <BoardDeletedRedirect />;
  if (isPending || loading) return <div className={styles.centered}>Loading…</div>;
  if (notFound) return <LinkNotActive />;
  if (!info) return null;
  // Already a real member (owner/collaborator/invited viewer) — the share
  // link is only a fallback entry point, not a second way to view a board
  // you already belong to.
  if (info.hasMembership) return <Navigate to={`/board/${info.boardId}`} replace />;

  const userId = session?.user?.id ?? null;
  const userName = userId ? session?.user.name || session?.user.email || "Guest" : anonName;

  if (!userId && !anonName) {
    return <AnonNamePrompt onSubmit={setAnonName} />;
  }

  return (
    <ActiveToolProvider>
      <div className={styles.page}>
        <div className={styles.bar}>
          <div className={styles.titleGroup}>
            <Link to="/" aria-label="Cursive — go to Home">
              <Logo size={28} />
            </Link>
            <span className={styles.title}>{info.boardName}</span>
            <span className={styles.owner}>by {info.ownerName}</span>
          </div>
          <div className={styles.actionGroup}>
            <span className={styles.watchingPill}>👁 watching via public link</span>
            <Button onClick={() => navigate("/login")}>Log in</Button>
          </div>
        </div>
        <BoardExperience
          boardId={info.boardId}
          role="viewer"
          userId={userId}
          userName={userName ?? "Guest"}
          shareContext={{ shareToken: shareToken!, anonId, anonName: anonName ?? undefined }}
          readOnlyBadge
          onBoardDeleted={() => setBoardDeleted(true)}
        />
      </div>
    </ActiveToolProvider>
  );
}
