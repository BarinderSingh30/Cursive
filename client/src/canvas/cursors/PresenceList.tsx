import type { PresenceState } from "../yjs/useAwareness.js";

interface Props {
  self: PresenceState;
  peers: Map<number, PresenceState>;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

export function PresenceList({ self, peers }: Props) {
  const count = 1 + peers.size;

  return (
    <details style={{ position: "relative" }}>
      <summary
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          border: "1px solid #e0e0e0",
          borderRadius: 6,
        }}
      >
        <Dot color={self.color} />
        {count} online
      </summary>
      <ul
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 4px)",
          minWidth: 160,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 8,
          margin: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          zIndex: 10,
        }}
      >
        <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Dot color={self.color} />
          {self.name} (you)
        </li>
        {Array.from(peers.entries()).map(([clientId, peer]) => (
          <li key={clientId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={peer.color} />
            {peer.name}
          </li>
        ))}
      </ul>
    </details>
  );
}
