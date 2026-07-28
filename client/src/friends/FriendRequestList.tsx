import type { FriendRequestSummary } from "@cursive/shared";
import { Avatar } from "../ui/Avatar.js";
import { Button } from "../ui/Button.js";
import styles from "./FriendRequestList.module.css";

interface Props {
  requests: FriendRequestSummary[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

export function FriendRequestList({ requests, onAccept, onDecline }: Props) {
  if (requests.length === 0) {
    return <p className={styles.empty}>No requests waiting right now.</p>;
  }

  return (
    <ul className={styles.list} style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {requests.map((r) => {
        const label = r.senderName ?? r.senderEmail;
        return (
          <li key={r.id} className={styles.row}>
            <Avatar name={label} color="#e64980" size={30} surfaceColor="var(--note-pink)" />
            <div className={styles.info}>
              <p className={styles.name}>{r.senderName ?? r.senderEmail}</p>
              {r.senderName && <p className={styles.email}>{r.senderEmail}</p>}
            </div>
            <div className={styles.actions}>
              <Button onClick={() => onAccept(r.id)}>Accept</Button>
              <Button variant="ghost" onClick={() => onDecline(r.id)}>
                Decline
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
