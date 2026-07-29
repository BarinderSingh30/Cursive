import { useEffect, useRef, useState } from "react";
import type { CallParticipant } from "./useCall.js";
import styles from "./CallStrip.module.css";

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

// Tiles keep the same 4:3 shape the old hardcoded 84x63 constant had, but
// the actual width/height is now derived per-render from the container size
// and participant count (see computeTileSize) instead of being fixed —
// otherwise resizing the card just added empty space around thumbnails that
// never grew.
const TILE_ASPECT_RATIO = 4 / 3;
// Matches `.tiles`' `gap: var(--space-2)` in CallStrip.module.css — needed
// here so the packing math accounts for the same spacing the flexbox layout
// actually renders with.
const TILE_GAP = 8;
const TILE_MIN_SIZE = { width: 56, height: 42 };

/**
 * Picks a tile width/height that fills the available `.tiles` container as
 * much as possible for `count` participants, wrapping into however many
 * rows/columns make the tiles biggest while still fitting — same idea as a
 * video-call grid (Zoom/Meet) reflowing tile size to participant count and
 * available space, rather than a fixed size that just adds scroll room.
 */
export function computeTileSize(containerWidth: number, containerHeight: number, count: number): { width: number; height: number } {
  if (count <= 0) return TILE_MIN_SIZE;

  let best = { width: TILE_MIN_SIZE.width, height: TILE_MIN_SIZE.height };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const widthByCols = (containerWidth - TILE_GAP * (cols - 1)) / cols;
    const heightByRows = (containerHeight - TILE_GAP * (rows - 1)) / rows;
    if (widthByCols <= 0 || heightByRows <= 0) continue;
    // The binding dimension (whichever is tighter) sets the tile's width,
    // with height derived to keep the fixed aspect ratio.
    const width = Math.min(widthByCols, heightByRows * TILE_ASPECT_RATIO);
    if (width > best.width) {
      best = { width, height: width / TILE_ASPECT_RATIO };
    }
  }

  return {
    width: Math.max(TILE_MIN_SIZE.width, Math.round(best.width)),
    height: Math.max(TILE_MIN_SIZE.height, Math.round(best.height)),
  };
}

function ParticipantTile({ participant, size }: { participant: CallParticipant; size: { width: number; height: number } }) {
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
    <div
      style={{
        width: size.width,
        height: size.height,
        flexShrink: 0,
        background: "#1a1a1a",
        borderRadius: 8,
        overflow: "hidden",
        position: "relative",
        // A thin accent ring on the local user's own tile makes "which one
        // is me" obvious at a glance, same idea as highlighting "(you)" in
        // the presence list.
        border: participant.isLocal ? "2px solid var(--go)" : "1px solid rgba(255,255,255,0.12)",
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
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: avatarColor,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
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
            top: 3,
            right: 3,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "var(--alert)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            boxShadow: "0 0 0 2px rgba(0,0,0,0.25)",
          }}
        >
          🔇
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 2,
          left: 2,
          right: 2,
          fontSize: 9,
          color: "#fff",
          background: "rgba(0,0,0,0.55)",
          padding: "1px 4px",
          borderRadius: 3,
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

  const borderColor = variant === "danger" ? "var(--alert)" : isWarning ? "#f3a89a" : "rgba(255,255,255,0.6)";
  const background =
    variant === "danger"
      ? hover
        ? "#c23b2c"
        : "var(--alert)"
      : isWarning
        ? hover
          ? "#ffe3de"
          : "#fff5f2"
        : hover
          ? "var(--paper)"
          : "rgba(255,255,255,0.7)";
  const color = variant === "danger" ? "#fff" : isWarning ? "var(--alert)" : "var(--ink)";

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
        gap: 5,
        border: `1px solid ${borderColor}`,
        borderRadius: 7,
        padding: "5px 9px",
        background,
        color,
        fontFamily: "var(--font-body)",
        fontSize: 11.5,
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

/** The active-call card: a floating, draggable, resizable widget layered over the board (position/size are client-side-only state, never synced). */
export function CallStrip({ participants, canPublish, micEnabled, cameraEnabled, onToggleMic, onToggleCamera, onLeave }: Props) {
  // Viewers can join to watch/listen but never publish — showing their tile
  // would just be a black box with a name and mute icon, so the strip only
  // surfaces collaborators/owners.
  const visible = participants.filter((p) => p.canPublish);

  const [position, setPosition] = useState({ x: 16, y: 64 });
  // Local-only — each client resizes/repositions their own strip
  // independently, this never gets broadcast to anyone else.
  const [size, setSize] = useState(DEFAULT_SIZE);
  const tileSize = computeTileSize(size.width, size.height, visible.length);
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
  // the default arrow and can start selecting nearby page text.
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
    <div style={{ position: "fixed", left: position.x, top: position.y, zIndex: 20 }}>
      <div
        className={styles.card}
        style={{
          // Lift the strip while it's actively being moved/resized — the
          // same "pick it up" depth cue drag-and-drop UIs (Trello, Figma)
          // use, so the interaction feels physically grabbed rather than
          // static.
          boxShadow: isDragging || isResizing ? "0 10px 28px rgba(0,0,0,0.28)" : undefined,
        }}
      >
        <div
          className={styles.header}
          onMouseDown={(e) => {
            e.preventDefault();
            dragOrigin.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
            setInteractionMode("dragging");
          }}
          style={{ cursor: isDragging ? "grabbing" : "grab" }}
        >
          <span aria-hidden="true">⠿</span>
          📹 Call · {visible.length} on
        </div>
        <div style={{ position: "relative" }}>
          <div className={styles.tiles} style={{ width: size.width, height: size.height, overflow: "auto" }}>
            {visible.map((p) => (
              <ParticipantTile key={p.identity} participant={p} size={tileSize} />
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
              // well beyond it so the corner is actually easy to grab.
              right: -8,
              bottom: -8,
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "nwse-resize",
              borderRadius: 7,
              background: isResizing || resizeHover ? "var(--go)" : "transparent",
              color: isResizing || resizeHover ? "#fff" : "var(--ink)",
              fontSize: 12,
              lineHeight: 1,
              userSelect: "none",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
          >
            <span aria-hidden="true">↘</span>
          </div>
        </div>
        {/* A viewer's watching is fully automatic (BoardExperience auto-joins/
            leaves based on whether a collaborator/owner is actually in the
            call) — no manual controls for them, including Leave, since
            there's nothing for them to start or stop themselves. */}
        {canPublish && (
          <div className={styles.controls}>
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
    </div>
  );
}
