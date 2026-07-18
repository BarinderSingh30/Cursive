import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { roleAtLeast } from "@cursive/shared";
import { useYjsDocument } from "./yjs/useYjsDocument.js";
import { useYShapes } from "./yjs/useYShapes.js";
import { useAwareness } from "./yjs/useAwareness.js";
import { ActiveToolProvider, useActiveTool } from "./tools/useActiveTool.js";
import { Toolbar } from "./tools/Toolbar.js";
import { PresenceList } from "./cursors/PresenceList.js";
import { CanvasStage } from "./Stage.js";
import { InviteMemberDialog } from "./InviteMemberDialog.js";
import { useBoard } from "./useBoard.js";
import { useSession } from "../auth/authClient.js";
import { colorForUser } from "./presenceColors.js";
import { useCall } from "../call/useCall.js";
import { JoinCallButton } from "../call/JoinCallButton.js";
import { CallStrip } from "../call/CallStrip.js";

function BoardDeletedOverlay() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 18, margin: 0 }}>The owner deleted this board.</p>
      <Link to="/dashboard">
        <button type="button">Go back to dashboard</button>
      </Link>
    </div>
  );
}

function BoardInner({ roomId }: { roomId: string }) {
  const { data: session } = useSession();
  const { board, error: boardError, refresh: refreshBoard } = useBoard(roomId);
  const { doc, provider } = useYjsDocument(roomId);
  const { shapes, addShape, updateShape, removeShape } = useYShapes(doc);
  const [boardDeleted, setBoardDeleted] = useState(false);
  const [membershipVersion, setMembershipVersion] = useState(0);

  const userId = session?.user.id;
  const userName = session?.user.name || session?.user.email || "Guest";
  const preferredColor = useMemo(() => colorForUser(userId ?? "guest"), [userId]);

  const isViewer = board?.role === "viewer";
  const { peers, viewerPeers, updateCursor, setInCall, callParticipantCount, localPresence } = useAwareness(
    provider,
    userName,
    preferredColor,
    board?.role ?? "viewer",
  );
  const { tool } = useActiveTool();
  const canPublish = roleAtLeast(board?.role ?? null, "collaborator");
  const { isJoined, participants, join, leave, toggleCamera, toggleMic } = useCall(roomId, canPublish);
  const [callError, setCallError] = useState<string | null>(null);

  // Derived from isJoined (useCall's single source of truth) rather than set
  // imperatively at each call site — a re-entrant join() call that no-ops, or
  // a join() that later fails, must never leave the broadcast inCall state
  // out of sync with whether we actually have a live Room. Viewers never
  // broadcast inCall at all — they auto-watch below, which isn't "joining a
  // call" from other clients' perspective (see useAwareness's count).
  useEffect(() => {
    setInCall(canPublish && isJoined);
    // setInCall is recreated every render (not memoized in useAwareness) —
    // depending only on isJoined/canPublish keeps this from re-broadcasting
    // the same awareness value on every unrelated re-render.
  }, [canPublish, isJoined]);

  const handleJoinCall = async () => {
    setCallError(null);
    try {
      await join();
    } catch {
      // Token fetch (403/network) or room.connect() failure — surface it
      // next to the button instead of an uncaught rejection and a UI stuck
      // showing "Join call" with nothing having happened.
      setCallError("Couldn't join the call. Check your connection and try again.");
    }
  };
  const handleLeaveCall = () => {
    leave();
  };

  // Viewers have no Join Call button — they're always watching/listening
  // whenever a collaborator/owner is actually in a call, and disconnected
  // the moment none are, so they never end up alone in an empty call (the
  // old "ghost participant" bug) or need to manage it themselves. Silent on
  // failure: there's no button/error UI for a passive viewer, and the next
  // callParticipantCount change (e.g. another collaborator joining) retries.
  useEffect(() => {
    if (canPublish) return;
    if (callParticipantCount > 0 && !isJoined) {
      join().catch(() => {});
    } else if (callParticipantCount === 0 && isJoined) {
      leave();
    }
  }, [canPublish, callParticipantCount, isJoined, join, leave]);

  // If we no longer have access — e.g. the owner just removed us — bounce
  // back to the dashboard automatically. Board *deletion* is handled
  // separately below with an explicit message instead of a silent redirect.
  useEffect(() => {
    if (boardError && !boardDeleted) {
      handleLeaveCall();
      window.location.href = "/dashboard";
    }
  }, [boardError, boardDeleted]);

  useEffect(() => {
    if (boardDeleted) handleLeaveCall();
  }, [boardDeleted]);

  // The owner adding/removing a member, or deleting the board outright,
  // broadcasts a lightweight signal over the same connection everyone's
  // already on (see hocuspocus.ts's notify* helpers) — react to it the
  // instant it happens, rather than only finding out on next reload.
  useEffect(() => {
    if (!provider) return;
    const onStateless = ({ payload }: { payload: string }) => {
      try {
        const message = JSON.parse(payload);
        if (message?.type === "membership-changed") {
          refreshBoard();
          setMembershipVersion((v) => v + 1);
        }
        if (message?.type === "board-deleted") setBoardDeleted(true);
      } catch {
        // ignore malformed/unrelated stateless payloads
      }
    };
    provider.on("stateless", onStateless);
    return () => {
      provider.off("stateless", onStateless);
    };
  }, [provider, refreshBoard]);

  if (boardDeleted) return <BoardDeletedOverlay />;

  return (
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
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Link to="/dashboard">← Boards</Link>
          <strong>{board?.name}</strong>
          {isViewer ? <span style={{ fontSize: 12, color: "#868e96" }}>👀 Viewing only</span> : <Toolbar />}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {board?.role === "owner" && <InviteMemberDialog boardId={roomId} membershipVersion={membershipVersion} />}
          {canPublish && (
            <JoinCallButton
              isJoined={isJoined}
              othersInCallCount={callParticipantCount}
              onJoin={handleJoinCall}
              onLeave={handleLeaveCall}
            />
          )}
          {callError && <span style={{ fontSize: 12, color: "#e03131" }}>{callError}</span>}
          <PresenceList self={localPresence} peers={peers} viewerPeers={viewerPeers} />
        </div>
      </div>
      {isJoined && (
        <CallStrip
          participants={participants}
          canPublish={canPublish}
          micEnabled={participants.find((p) => p.isLocal)?.micEnabled ?? false}
          cameraEnabled={participants.find((p) => p.isLocal)?.cameraEnabled ?? false}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onLeave={handleLeaveCall}
        />
      )}
      <div style={{ flex: 1 }}>
        <CanvasStage
          shapes={shapes}
          peers={peers}
          activeTool={tool}
          readOnly={isViewer}
          onAddShape={addShape}
          onUpdateShape={updateShape}
          onRemoveShape={removeShape}
          onCursorMove={updateCursor}
        />
      </div>
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
