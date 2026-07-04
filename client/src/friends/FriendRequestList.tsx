import type { FriendRequestSummary } from "@cursive/shared";

interface Props {
  requests: FriendRequestSummary[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

export function FriendRequestList({ requests, onAccept, onDecline }: Props) {
  if (requests.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3>Pending requests</h3>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map((r) => (
          <li key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{r.senderName ?? r.senderEmail}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => onAccept(r.id)}>
                Accept
              </button>
              <button type="button" onClick={() => onDecline(r.id)}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
