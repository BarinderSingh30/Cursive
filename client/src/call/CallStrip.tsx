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

const TILE_SIZE = { width: 84, height: 63 };

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
    <div
      style={{
        width: TILE_SIZE.width,
        height: TILE_SIZE.height,
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

/** The active-call card, docked at the top of the board's right rail (not a floating/draggable widget). */
export function CallStrip({ participants, canPublish, micEnabled, cameraEnabled, onToggleMic, onToggleCamera, onLeave }: Props) {
  // Viewers can join to watch/listen but never publish — showing their tile
  // would just be a black box with a name and mute icon, so the strip only
  // surfaces collaborators/owners.
  const visible = participants.filter((p) => p.canPublish);

  return (
    <div className={styles.card}>
      <div className={styles.header}>📹 Call · {visible.length} on</div>
      <div className={styles.tiles}>
        {visible.map((p) => (
          <ParticipantTile key={p.identity} participant={p} />
        ))}
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
  );
}
