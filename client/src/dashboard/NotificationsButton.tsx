import { useRef } from "react";
import { useBoardInvites } from "./useBoardInvites.js";

interface Props {
  onAccepted?: () => void;
}

export function NotificationsButton({ onAccepted }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { received, declined, accept, decline, dismiss } = useBoardInvites();
  const count = received.length + declined.length;

  const handleAccept = async (id: string) => {
    await accept(id);
    onAccepted?.();
  };

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()} style={{ position: "relative" }}>
        🔔 Notifications
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              background: "#e03131",
              color: "#fff",
              borderRadius: "50%",
              width: 18,
              height: 18,
              fontSize: 11,
              lineHeight: "18px",
              textAlign: "center",
            }}
          >
            {count}
          </span>
        )}
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 300 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Notifications</h3>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>

          {count === 0 && <p style={{ margin: 0, color: "#868e96" }}>Nothing new.</p>}

          {received.map((invite) => (
            <div key={invite.id} style={{ borderBottom: "1px solid #f1f3f5", paddingBottom: 8 }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong>{invite.inviterName ?? invite.inviterEmail}</strong> invited you to{" "}
                <strong>{invite.boardName}</strong> as {invite.role}.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => handleAccept(invite.id)}>
                  Accept
                </button>
                <button type="button" onClick={() => decline(invite.id)}>
                  Decline
                </button>
              </div>
            </div>
          ))}

          {declined.map((invite) => (
            <div key={invite.id} style={{ borderBottom: "1px solid #f1f3f5", paddingBottom: 8 }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong>{invite.inviteeName ?? invite.inviteeEmail}</strong> declined your invite to{" "}
                <strong>{invite.boardName}</strong>.
              </p>
              <button type="button" onClick={() => dismiss(invite.id)}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      </dialog>
    </>
  );
}
