import { useState } from "react";
import { useBoardInvites } from "./useBoardInvites.js";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import styles from "./NotificationsButton.module.css";

interface Props {
  onAccepted?: () => void;
}

export function NotificationsButton({ onAccepted }: Props) {
  const [open, setOpen] = useState(false);
  const { received, declined, accept, decline, dismiss } = useBoardInvites();
  const count = received.length + declined.length;

  const handleAccept = async (id: string) => {
    await accept(id);
    onAccepted?.();
  };

  return (
    <>
      <div className={styles.bellWrap}>
        <button type="button" className={styles.bell} onClick={() => setOpen(true)} aria-label="Notifications">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3a5 5 0 0 0-5 5v3.5c0 .9-.35 1.77-.98 2.4L4.5 15.4a1 1 0 0 0 .7 1.7h13.6a1 1 0 0 0 .7-1.7l-1.52-1.5a3.4 3.4 0 0 1-.98-2.4V8a5 5 0 0 0-5-5Z"
              stroke="#8A7A5E"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="#8A7A5E" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {count > 0 && <span className={styles.badge} aria-hidden="true" />}
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Notifications">
        <div className={styles.list}>
          {count === 0 && <p className={styles.empty}>Nothing new.</p>}

          {received.map((invite) => (
            <div key={invite.id} className={styles.item}>
              <p className={styles.itemText}>
                <strong>{invite.inviterName ?? invite.inviterEmail}</strong> invited you to{" "}
                <strong>{invite.boardName}</strong> as {invite.role}.
              </p>
              <div className={styles.itemActions}>
                <Button onClick={() => handleAccept(invite.id)}>Accept</Button>
                <Button variant="secondary" onClick={() => decline(invite.id)}>
                  Decline
                </Button>
              </div>
            </div>
          ))}

          {declined.map((invite) => (
            <div key={invite.id} className={styles.item}>
              <p className={styles.itemText}>
                <strong>{invite.inviteeName ?? invite.inviteeEmail}</strong> declined your invite to{" "}
                <strong>{invite.boardName}</strong>.
              </p>
              <Button variant="ghost" onClick={() => dismiss(invite.id)}>
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
