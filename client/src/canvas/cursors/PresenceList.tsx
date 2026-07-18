import type { PresenceState } from "../yjs/useAwareness.js";

interface Props {
  self: PresenceState;
  peers: Map<number, PresenceState>;
  viewerPeers: Map<number, PresenceState>;
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

function PeerGroup({
  title,
  self,
  includeSelf,
  peers,
}: {
  title: string;
  self: PresenceState;
  includeSelf: boolean;
  peers: Map<number, PresenceState>;
}) {
  if (!includeSelf && peers.size === 0) return null;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#868e96", marginBottom: 4 }}>
        {title} ({(includeSelf ? 1 : 0) + peers.size})
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {includeSelf && (
          <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={self.color} />
            {self.name} (you)
          </li>
        )}
        {Array.from(peers.entries()).map(([clientId, peer]) => (
          <li key={clientId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={peer.color} />
            {peer.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PresenceList({ self, peers, viewerPeers }: Props) {
  const isViewerSelf = self.role === "viewer";
  const collaboratorCount = (isViewerSelf ? 0 : 1) + peers.size;
  const viewerCount = (isViewerSelf ? 1 : 0) + viewerPeers.size;

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
        {collaboratorCount} online
        {viewerCount > 0 && <span style={{ color: "#868e96" }}>· {viewerCount} watching</span>}
      </summary>
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "calc(100% + 4px)",
          minWidth: 160,
          background: "#fff",
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 10,
        }}
      >
        <PeerGroup title="Collaborators" self={self} includeSelf={!isViewerSelf} peers={peers} />
        <PeerGroup title="Viewers" self={self} includeSelf={isViewerSelf} peers={viewerPeers} />
      </div>
    </details>
  );
}
