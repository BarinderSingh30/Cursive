import { useEffect, useRef, useState } from "react";
import type { CallParticipant } from "./useCall.js";

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

  return (
    <div style={{ width: 120, background: "#1a1a1a", borderRadius: 8, overflow: "hidden", position: "relative" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {!participant.cameraEnabled && <span style={{ color: "#fff", fontSize: 12 }}>{participant.name}</span>}
      </div>
      <div style={{ position: "absolute", bottom: 4, left: 4, fontSize: 11, color: "#fff", textShadow: "0 0 2px #000" }}>
        {participant.name}
        {participant.isLocal ? " (you)" : ""}
        {!participant.micEnabled ? " 🔇" : ""}
      </div>
    </div>
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

export function CallStrip({ participants, canPublish, micEnabled, cameraEnabled, onToggleMic, onToggleCamera, onLeave }: Props) {
  const [position, setPosition] = useState({ x: 16, y: 64 });
  const dragOrigin = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragOrigin.current) return;
      const { startX, startY, originX, originY } = dragOrigin.current;
      setPosition({ x: originX + (e.clientX - startX), y: originY + (e.clientY - startY) });
    };
    const onUp = () => {
      dragOrigin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 20,
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderRadius: 10,
        padding: 8,
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div
        onMouseDown={(e) => {
          dragOrigin.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
        }}
        style={{ cursor: "grab", fontSize: 11, color: "#868e96", marginBottom: 6, userSelect: "none" }}
      >
        ⠿ Call
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {participants.map((p) => (
          <ParticipantTile key={p.identity} participant={p} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center" }}>
        {canPublish && (
          <>
            <button type="button" onClick={onToggleMic}>
              {micEnabled ? "Mute" : "Unmute"}
            </button>
            <button type="button" onClick={onToggleCamera}>
              {cameraEnabled ? "Camera off" : "Camera on"}
            </button>
          </>
        )}
        <button type="button" onClick={onLeave}>
          Leave call
        </button>
      </div>
    </div>
  );
}
