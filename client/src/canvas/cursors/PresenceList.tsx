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
      }}
    />
  );
}

export function PresenceList({ self, peers }: Props) {
  return (
    <ul style={{ display: "flex", gap: 12, listStyle: "none", padding: 0, margin: 0 }}>
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
  );
}
