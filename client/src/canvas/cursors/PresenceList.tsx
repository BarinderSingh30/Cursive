import type { PresenceState } from "../yjs/useAwareness.js";
import { Avatar } from "../../ui/Avatar.js";
import styles from "./PresenceList.module.css";

interface Props {
  self: PresenceState;
  peers: Map<number, PresenceState>;
  viewerPeers: Map<number, PresenceState>;
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
      <div className={styles.groupTitle}>
        {title} ({(includeSelf ? 1 : 0) + peers.size})
      </div>
      {includeSelf && (
        <div className={styles.memberRow}>
          <Avatar name={self.name} color={self.color} size={22} />
          {self.name} (you)
        </div>
      )}
      {Array.from(peers.entries()).map(([clientId, peer]) => (
        <div key={clientId} className={styles.memberRow}>
          <Avatar name={peer.name} color={peer.color} size={22} />
          {peer.name}
        </div>
      ))}
    </div>
  );
}

export function PresenceList({ self, peers, viewerPeers }: Props) {
  const isViewerSelf = self.role === "viewer";
  const collaboratorCount = (isViewerSelf ? 0 : 1) + peers.size;
  const viewerCount = (isViewerSelf ? 1 : 0) + viewerPeers.size;

  const avatarPeers = isViewerSelf ? Array.from(peers.values()) : [self, ...Array.from(peers.values())];

  return (
    <details className={styles.wrap}>
      <summary className={styles.chip}>
        <span className={styles.dot} />
        {collaboratorCount} drawing
        {viewerCount > 0 && <span className={styles.viewerCount}>· {viewerCount} watching</span>}
        <span className={styles.avatarStack}>
          {avatarPeers.slice(0, 4).map((p, i) => (
            <Avatar key={i} name={p.name} color={p.color} size={22} />
          ))}
        </span>
      </summary>
      <div className={styles.panel}>
        <PeerGroup title="Collaborators" self={self} includeSelf={!isViewerSelf} peers={peers} />
        <PeerGroup title="Viewers" self={self} includeSelf={isViewerSelf} peers={viewerPeers} />
      </div>
    </details>
  );
}
