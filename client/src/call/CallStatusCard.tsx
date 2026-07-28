import type { PresenceState } from "../canvas/yjs/useAwareness.js";
import { Avatar } from "../ui/Avatar.js";
import styles from "./CallStrip.module.css";

interface Props {
  peers: Map<number, PresenceState>;
}

/** Shown in the right rail before the local user has joined — a passive "who's on the call" summary, not an entry point (Join call lives in the top bar). */
export function CallStatusCard({ peers }: Props) {
  const inCall = Array.from(peers.values()).filter((p) => p.inCall);
  if (inCall.length === 0) return null;

  return (
    <div className={styles.statusCard}>
      <span className={styles.statusText}>📹 Call · {inCall.length} on</span>
      <span className={styles.statusAvatars}>
        {inCall.slice(0, 4).map((p, i) => (
          <Avatar key={i} name={p.name} color={p.color} size={26} surfaceColor="var(--note-mint)" />
        ))}
      </span>
    </div>
  );
}
