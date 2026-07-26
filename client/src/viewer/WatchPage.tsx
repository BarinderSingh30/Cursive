import { Navigate, useParams } from "react-router-dom";
import { ActiveToolProvider } from "../canvas/tools/useActiveTool.js";
import { BoardExperience } from "../canvas/BoardExperience.js";
import { useSession } from "../auth/authClient.js";
import { useShareLink } from "./useShareLink.js";
import { useAnonIdentity } from "./useAnonIdentity.js";

function LinkNotActive() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <p style={{ fontSize: 18, margin: 0 }}>This link isn't active.</p>
      <a href="/login">Log in</a>
    </div>
  );
}

function AnonNamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <p style={{ margin: 0 }}>What should we call you in chat?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = (e.currentTarget.elements.namedItem("name") as HTMLInputElement).value.trim();
          if (input) onSubmit(input);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input name="name" placeholder="Guest name" required />
        <button type="submit">Continue</button>
      </form>
    </div>
  );
}

export function WatchPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const { data: session, isPending } = useSession();
  const { info, notFound, loading } = useShareLink(shareToken!);
  const { anonId, anonName, setAnonName } = useAnonIdentity(shareToken!);

  if (isPending || loading) return <p style={{ padding: 24 }}>Loading…</p>;
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
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 8,
            borderBottom: "1px solid #e0e0e0",
          }}
        >
          <strong>{info.boardName}</strong>
          <span style={{ fontSize: 12, color: "#868e96" }}>👀 Watching via public link</span>
        </div>
        <BoardExperience
          boardId={info.boardId}
          role="viewer"
          userId={userId}
          userName={userName ?? "Guest"}
          shareContext={{ shareToken: shareToken!, anonId, anonName: anonName ?? undefined }}
        />
      </div>
    </ActiveToolProvider>
  );
}
