import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { roleAtLeast, type BoardRole } from "@cursive/shared";
import { useYjsDocument } from "./yjs/useYjsDocument.js";
import { useYShapes } from "./yjs/useYShapes.js";
import { useAwareness } from "./yjs/useAwareness.js";
import { useActiveTool } from "./tools/useActiveTool.js";
import { PresenceList } from "./cursors/PresenceList.js";
import { CanvasStage } from "./Stage.js";
import { colorForUser } from "./presenceColors.js";
import { useCall } from "../call/useCall.js";
import { JoinCallButton } from "../call/JoinCallButton.js";
import { CallStrip } from "../call/CallStrip.js";
import { CallStatusCard } from "../call/CallStatusCard.js";
import { useBoardChatSocket } from "../boardChat/useBoardChatSocket.js";
import { BoardChatPanel } from "../boardChat/BoardChatPanel.js";
import type { ShareRequestContext } from "../viewer/shareContext.js";
import styles from "./BoardExperience.module.css";

interface Props {
  boardId: string;
  role: BoardRole;
  /** The real session user id, or null for a fully anonymous share-link visitor. */
  userId: string | null;
  userName: string;
  /** Present only when reached via a public /watch/:shareToken link. */
  shareContext?: ShareRequestContext;
  /** When provided, the Join Call button renders here (e.g. the owner page's top nav bar) instead of in the row above the canvas. */
  joinCallSlot?: HTMLElement | null;
  /** The public /watch page's canvas renders dimmed with a "read-only view" pill — a regular invited viewer on /board/:id does not. */
  readOnlyBadge?: boolean;
  onMembershipChanged?: () => void;
  onBoardDeleted?: () => void;
}

/**
 * The canvas + live presence + call + chat experience shared by the
 * authenticated editing page (Board.tsx) and the public watch page
 * (viewer/WatchPage.tsx) — everything except each page's own top-bar chrome
 * (owner controls vs. a plain "watching via public link" banner).
 */
export function BoardExperience({
  boardId,
  role,
  userId,
  userName,
  shareContext,
  joinCallSlot,
  readOnlyBadge = false,
  onMembershipChanged,
  onBoardDeleted,
}: Props) {
  const { doc, provider } = useYjsDocument(boardId, shareContext);
  const { shapes, addShape, updateShape, removeShape } = useYShapes(doc);
  const preferredColor = useMemo(() => colorForUser(userId ?? "guest"), [userId]);
  const isViewer = role === "viewer";

  const { peers, viewerPeers, updateCursor, setInCall, callParticipantCount, localPresence } = useAwareness(
    provider,
    userName,
    preferredColor,
    role,
  );
  const { tool, penColor } = useActiveTool();
  const canPublish = roleAtLeast(role, "collaborator");
  const { isJoined, participants, join, leave, toggleCamera, toggleMic } = useCall(boardId, canPublish, shareContext);
  const [callError, setCallError] = useState<string | null>(null);

  useEffect(() => {
    setInCall(canPublish && isJoined);
  }, [canPublish, isJoined]);

  const handleJoinCall = async () => {
    setCallError(null);
    try {
      await join();
    } catch {
      setCallError("Couldn't join the call. Check your connection and try again.");
    }
  };
  const handleLeaveCall = () => leave();

  const handleToggleMic = async () => {
    setCallError(null);
    try {
      await toggleMic();
    } catch {
      setCallError("Couldn't access the microphone. Check your device/permissions and try again.");
    }
  };
  const handleToggleCamera = async () => {
    setCallError(null);
    try {
      await toggleCamera();
    } catch {
      setCallError("Couldn't access the camera. Check your device/permissions and try again.");
    }
  };

  // Viewers (invited or share-link, logged in or anonymous) have no Join
  // Call button — they auto-watch/listen whenever a collaborator/owner is
  // actually in a call, and auto-disconnect the moment none are.
  useEffect(() => {
    if (canPublish) return;
    if (callParticipantCount > 0 && !isJoined) {
      join().catch(() => {});
    } else if (callParticipantCount === 0 && isJoined) {
      leave();
    }
  }, [canPublish, callParticipantCount, isJoined, join, leave]);

  useEffect(() => {
    if (!provider) return;
    const onStateless = ({ payload }: { payload: string }) => {
      try {
        const message = JSON.parse(payload);
        if (message?.type === "membership-changed") onMembershipChanged?.();
        if (message?.type === "board-deleted") onBoardDeleted?.();
      } catch {
        // ignore malformed/unrelated stateless payloads
      }
    };
    provider.on("stateless", onStateless);
    return () => {
      provider.off("stateless", onStateless);
    };
  }, [provider, onMembershipChanged, onBoardDeleted]);

  const { messages: chatMessages, loadMore: loadMoreChat, sendMessage: sendChatMessage } = useBoardChatSocket(
    boardId,
    shareContext,
  );
  useEffect(() => {
    loadMoreChat();
    // Only ever load the initial page once per board — pagination past that
    // is user-triggered via BoardChatPanel's onReachTop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const joinCallControls = canPublish ? (
    <>
      <JoinCallButton
        isJoined={isJoined}
        othersInCallCount={callParticipantCount}
        onJoin={handleJoinCall}
        onLeave={handleLeaveCall}
      />
      {callError && <span style={{ fontSize: 12, color: "var(--alert)" }}>{callError}</span>}
    </>
  ) : null;

  return (
    <div className={styles.body}>
      {joinCallSlot && joinCallControls ? createPortal(joinCallControls, joinCallSlot) : null}
      <div className={styles.canvasCol}>
        <div className={styles.presenceRow}>
          {!joinCallSlot && joinCallControls}
          <PresenceList self={localPresence} peers={peers} viewerPeers={viewerPeers} />
        </div>
        <div className={`${styles.canvasArea} ${readOnlyBadge ? styles.dimmed : ""}`}>
          <CanvasStage
            shapes={shapes}
            peers={peers}
            activeTool={tool}
            strokeColor={penColor}
            readOnly={isViewer}
            onAddShape={addShape}
            onUpdateShape={updateShape}
            onRemoveShape={removeShape}
            onCursorMove={updateCursor}
          />
          {readOnlyBadge && <span className={styles.readOnlyPill}>read-only view</span>}
        </div>
      </div>
      <div className={styles.rail}>
        {isJoined ? (
          <CallStrip
            participants={participants}
            canPublish={canPublish}
            micEnabled={participants.find((p) => p.isLocal)?.micEnabled ?? false}
            cameraEnabled={participants.find((p) => p.isLocal)?.cameraEnabled ?? false}
            onToggleMic={handleToggleMic}
            onToggleCamera={handleToggleCamera}
            onLeave={handleLeaveCall}
          />
        ) : (
          <CallStatusCard peers={peers} />
        )}
        <BoardChatPanel
          messages={chatMessages}
          canPost={userId !== null}
          onSend={sendChatMessage}
          onReachTop={loadMoreChat}
        />
      </div>
    </div>
  );
}
