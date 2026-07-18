import { useEffect, useRef, useState } from "react";
import type { CallParticipant } from "./useCall.js";

// A small fixed palette (reusing colors already seen elsewhere in the app,
// e.g. the presence dots) so a "camera off" placeholder gets a consistent,
// recognizable color per person instead of every tile looking identical.
const AVATAR_COLORS = ["#4dabf7", "#f76707", "#12b886", "#e64980", "#7048e8", "#f59f00"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

function ParticipantTile({ participant }: { participant: CallParticipant }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = participant.cameraTrack;
    const container = containerRef.current;
    if (!track || !container) return;

    const element = track.attach();
    element.style.width = "100%";
    element.style.height = "100%";
    element.style.objectFit = "cover";
    container.appendChild(element);

    return () => {
      track.detach(element);
      element.remove();
    };
  }, [participant.cameraTrack]);

  useEffect(() => {
    // Skip the local participant's own mic — attaching it would echo the
    // user's own voice back at them.
    const track = participant.audioTrack;
    if (!track || participant.isLocal) return;

    const element = track.attach();
    document.body.appendChild(element);

    return () => {
      track.detach(element);
      element.remove();
    };
  }, [participant.audioTrack, participant.isLocal]);

  const avatarColor = colorForName(participant.name);

  return (
    // Sized off height + aspect-ratio (rather than a fixed width) so
    // resizing the strip's height directly scales every tile.
    <div
      style={{
        height: "100%",
        aspectRatio: "4 / 3",
        flexShrink: 0,
        background: "#1a1a1a",
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
        // A thin accent ring on the local user's own tile makes "which one
        // is me" obvious at a glance, same idea as highlighting "(you)" in
        // the presence list.
        border: participant.isLocal ? "2px solid #4dabf7" : "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {!participant.cameraEnabled && (
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: avatarColor,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {initialsForName(participant.name)}
          </div>
        )}
      </div>
      {!participant.micEnabled && (
        <div
          title="Muted"
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#e03131",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            boxShadow: "0 0 0 2px rgba(0,0,0,0.25)",
          }}
        >
          🔇
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: 4,
          right: 4,
          fontSize: 11,
          color: "#fff",
          background: "rgba(0,0,0,0.55)",
          padding: "2px 6px",
          borderRadius: 4,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {participant.name}
        {participant.isLocal ? " (you)" : ""}
      </div>
    </div>
  );
}

function ControlButton({
  label,
  icon,
  isActive,
  variant = "default",
  onClick,
}: {
  label: string;
  icon: string;
  isActive?: boolean;
  variant?: "default" | "danger";
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  // Explicitly "off" (muted / camera off) gets a warning tint so the
  // control's own look communicates current state, not just its label —
  // matches the "clearly communicate current state" priority used
  // elsewhere (role badges, presence dots).
  const isWarning = isActive === false;

  const borderColor = variant === "danger" ? "#e03131" : isWarning ? "#ffa8a8" : "#e0e0e0";
  const background =
    variant === "danger"
      ? hover
        ? "#c92a2a"
        : "#e03131"
      : isWarning
        ? hover
          ? "#ffe3e3"
          : "#fff5f5"
        : hover
          ? "#e9ecef"
          : "#f8f9fa";
  const color = variant === "danger" ? "#fff" : isWarning ? "#c92a2a" : "#495057";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: "6px 10px",
        background,
        color,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "background 0.12s ease, border-color 0.12s ease",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </button>
  );
}

interface Props {
  participants: CallParticipant[];
  canPublish: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
}

const MIN_SIZE = { width: 180, height: 70 };
const MAX_SIZE = { width: 640, height: 480 };
const DEFAULT_SIZE = { width: 280, height: 106 };

export function CallStrip({ participants, canPublish, micEnabled, cameraEnabled, onToggleMic, onToggleCamera, onLeave }: Props) {
  const [position, setPosition] = useState({ x: 16, y: 64 });
  // Local-only — each client resizes their own strip independently, this
  // never gets broadcast to anyone else (same as position, above).
  const [size, setSize] = useState(DEFAULT_SIZE);
  const dragOrigin = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const resizeOrigin = useRef<{ startX: number; startY: number; originWidth: number; originHeight: number } | null>(null);
  // Drives cursor/shadow feedback during an active drag or resize. Kept
  // separate from the refs above (which exist purely to avoid re-renders on
  // every mousemove) — this only changes twice per gesture (start/end).
  const [interactionMode, setInteractionMode] = useState<"idle" | "dragging" | "resizing">("idle");
  const [resizeHover, setResizeHover] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragOrigin.current) {
        const { startX, startY, originX, originY } = dragOrigin.current;
        setPosition({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
      }
      if (resizeOrigin.current) {
        const { startX, startY, originWidth, originHeight } = resizeOrigin.current;
        setSize({
          width: Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, originWidth + (e.clientX - startX))),
          height: Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, originHeight + (e.clientY - startY))),
        });
      }
    };
    const onUp = () => {
      dragOrigin.current = null;
      resizeOrigin.current = null;
      setInteractionMode("idle");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // While actively dragging or resizing, pin the cursor and disable text
  // selection at the document level. Without this, moving the mouse faster
  // than it stays over the (small) handle makes the cursor flicker back to
  // the default arrow and can start selecting nearby page text — which is
  // exactly what made the resize feel "laggy"/unpolished even though the
  // underlying width/height math was already correct.
  useEffect(() => {
    if (interactionMode === "idle") return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = interactionMode === "resizing" ? "nwse-resize" : "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [interactionMode]);

  const isDragging = interactionMode === "dragging";
  const isResizing = interactionMode === "resizing";

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 20,
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 12,
        padding: 10,
        // Lift the strip while it's actively being moved/resized — the same
        // "pick it up" depth cue drag-and-drop UIs (Trello, Figma) use, so
        // the interaction feels physically grabbed rather than static.
        boxShadow: isDragging || isResizing ? "0 10px 28px rgba(0,0,0,0.24)" : "0 2px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          dragOrigin.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
          setInteractionMode("dragging");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: isDragging ? "grabbing" : "grab",
          fontSize: 11,
          fontWeight: 600,
          color: "#868e96",
          marginBottom: 8,
          userSelect: "none",
        }}
      >
        <span aria-hidden="true">⠿</span>
        Call
      </div>
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 8, width: size.width, height: size.height, overflow: "auto" }}>
          {/* Viewers can join to watch/listen but never publish — showing
              their tile would just be a black box with a name and mute
              icon, so the strip only surfaces collaborators/owners. */}
          {participants
            .filter((p) => p.canPublish)
            .map((p) => (
              <ParticipantTile key={p.identity} participant={p} />
            ))}
        </div>
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            resizeOrigin.current = { startX: e.clientX, startY: e.clientY, originWidth: size.width, originHeight: size.height };
            setInteractionMode("resizing");
          }}
          onMouseEnter={() => setResizeHover(true)}
          onMouseLeave={() => setResizeHover(false)}
          title="Drag to resize"
          style={{
            position: "absolute",
            // The visible grip is small, but the hit target is padded out
            // well beyond it so the corner is actually easy to grab —
            // matching the "interactive target obvious and reachable"
            // priority rather than a bare 14px CSS-border corner.
            right: -8,
            bottom: -8,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "nwse-resize",
            borderRadius: 7,
            background: isResizing || resizeHover ? "#4dabf7" : "transparent",
            color: isResizing || resizeHover ? "#fff" : "#adb5bd",
            fontSize: 12,
            lineHeight: 1,
            userSelect: "none",
            transition: "background 0.12s ease, color 0.12s ease",
          }}
        >
          <span aria-hidden="true">↘</span>
        </div>
      </div>
      {/* A viewer's watching is fully automatic (Board.tsx auto-joins/leaves
          based on whether a collaborator/owner is actually in the call) —
          no manual controls for them, including Leave, since there's
          nothing for them to start or stop themselves. */}
      {canPublish && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "center" }}>
          <ControlButton
            label={micEnabled ? "Mute" : "Unmute"}
            icon={micEnabled ? "🎤" : "🔇"}
            isActive={micEnabled}
            onClick={onToggleMic}
          />
          <ControlButton
            label={cameraEnabled ? "Camera off" : "Camera on"}
            icon={cameraEnabled ? "📷" : "🚫"}
            isActive={cameraEnabled}
            onClick={onToggleCamera}
          />
          <ControlButton label="Leave call" icon="📞" variant="danger" onClick={onLeave} />
        </div>
      )}
    </div>
  );
}
