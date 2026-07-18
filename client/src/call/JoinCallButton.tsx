import { useState } from "react";

interface Props {
  isJoined: boolean;
  othersInCallCount: number;
  onJoin: () => void;
  onLeave: () => void;
}

export function JoinCallButton({ isJoined, othersInCallCount, onJoin, onLeave }: Props) {
  const [hover, setHover] = useState(false);

  if (isJoined) {
    // Green while idle signals "you're live"; on hover it shifts toward the
    // app's existing error/destructive red (#e03131, already used for call
    // errors elsewhere) since clicking this button leaves the call — the
    // color change previews the action without needing the label to change
    // (the accessible name must stay exactly "In call").
    return (
      <button
        type="button"
        onClick={onLeave}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Leave the call"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${hover ? "#e03131" : "#2b8a3e"}`,
          borderRadius: 6,
          padding: "5px 10px",
          background: hover ? "#fff5f5" : "#ebfbee",
          color: hover ? "#e03131" : "#2b8a3e",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background 0.12s ease, border-color 0.12s ease, color 0.12s ease",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: hover ? "#e03131" : "#2b8a3e",
            display: "inline-block",
          }}
        />
        In call
      </button>
    );
  }

  // Others already being in the call is worth surfacing distinctly (a blue
  // accent border + a small count badge) so it reads as "join an active
  // call" rather than "start one" — same live/idle distinction the "In
  // call" state above makes with color.
  return (
    <button
      type="button"
      onClick={onJoin}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${othersInCallCount > 0 ? "#4dabf7" : "#e0e0e0"}`,
        borderRadius: 6,
        padding: "5px 10px",
        background: hover ? "#f1f3f5" : "#fff",
        color: "#212529",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        transition: "background 0.12s ease",
      }}
    >
      <span aria-hidden="true">📹</span>
      Join call{othersInCallCount > 0 && (
        <span
          style={{
            fontWeight: 700,
            color: "#1c7ed6",
          }}
        >{` · ${othersInCallCount}`}</span>
      )}
    </button>
  );
}
