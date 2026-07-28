import { useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFriends } from "./useFriends.js";
import { FriendRequestList } from "./FriendRequestList.js";
import { AddFriendForm } from "./AddFriendForm.js";
import { PaperBar, PaperBarNavLink } from "../ui/PaperBar.js";
import { Wordmark } from "../ui/Wordmark.js";
import { Button } from "../ui/Button.js";
import { Avatar } from "../ui/Avatar.js";
import { StickyNote } from "../ui/StickyNote.js";
import { UnreadDot } from "../dashboard/UnreadDot.js";
import { useHasUnreadMessages } from "../chat/useHasUnreadMessages.js";
import styles from "./FriendsPage.module.css";

const AVATAR_COLORS = ["#1971c2", "#2f9e44", "#f08c00", "#9c36b5", "#0c8599", "#e8590c"];

function avatarColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export function FriendsPage() {
  const { friends, requests, loading, sendRequest, acceptRequest, declineRequest, removeFriend } = useFriends();
  const hasUnreadMessages = useHasUnreadMessages();
  const navigate = useNavigate();
  const addInputRef = useRef<HTMLInputElement>(null);

  const requestCountLabel = useMemo(() => {
    if (requests.length === 0) return "No requests waiting";
    return `${requests.length} request${requests.length === 1 ? "" : "s"} waiting`;
  }, [requests.length]);

  const handleRemove = (friendId: string, label: string) => {
    if (window.confirm(`Remove ${label} as a friend?`)) {
      removeFriend(friendId);
    }
  };

  return (
    <div className={styles.page}>
      <PaperBar
        left={<Wordmark size={28} />}
        right={
          <>
            <PaperBarNavLink to="/dashboard">Boards</PaperBarNavLink>
            <PaperBarNavLink to="/friends">Friends</PaperBarNavLink>
            <div style={{ position: "relative" }}>
              <PaperBarNavLink to="/messages">
                Messages
                <UnreadDot show={hasUnreadMessages} />
              </PaperBarNavLink>
            </div>
            <Button onClick={() => addInputRef.current?.focus()}>+ Add friend</Button>
          </>
        }
      />

      <div className={styles.columns}>
        <div className={styles.leftCol}>
          <div className={styles.panel}>
            <h2 className={styles.panelHeading}>Your friends</h2>
            {loading ? (
              <p className={styles.emptyText}>Loading…</p>
            ) : friends.length === 0 ? (
              <p className={styles.emptyText}>No friends yet — add one by email.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {friends.map((f) => {
                  const label = f.name ?? f.email;
                  return (
                    <li key={f.id} className={styles.row}>
                      <Avatar name={label} color={avatarColorFor(f.id)} size={38} />
                      <span className={styles.rowName}>{label}</span>
                      <div className={styles.rowActions}>
                        <Button
                          className={styles.messageButton}
                          onClick={() => navigate(`/messages?dm=${encodeURIComponent(f.email)}`)}
                        >
                          Message
                        </Button>
                        <Button variant="secondary" onClick={() => handleRemove(f.id, label)}>
                          Remove
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.rightCol}>
          <StickyNote color="pink" rotate={0} className={styles.notePanel}>
            <h2 className={styles.noteHeading}>{requestCountLabel}</h2>
            <FriendRequestList requests={requests} onAccept={acceptRequest} onDecline={declineRequest} />
          </StickyNote>

          <StickyNote color="mint" rotate={1} className={styles.notePanel}>
            <h2 className={styles.noteHeading}>Add someone</h2>
            <AddFriendForm ref={addInputRef} onSend={sendRequest} />
          </StickyNote>
        </div>
      </div>
    </div>
  );
}
