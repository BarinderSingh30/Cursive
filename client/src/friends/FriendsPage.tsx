import { Link } from "react-router-dom";
import { useFriends } from "./useFriends.js";
import { FriendRequestList } from "./FriendRequestList.js";
import { AddFriendDialog } from "./AddFriendDialog.js";

export function FriendsPage() {
  const { friends, requests, loading, sendRequest, acceptRequest, declineRequest } = useFriends();

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Friends</h1>
        <Link to="/dashboard">Back to boards</Link>
      </div>
      <div style={{ marginBottom: 16 }}>
        <AddFriendDialog onSend={sendRequest} />
      </div>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <FriendRequestList requests={requests} onAccept={acceptRequest} onDecline={declineRequest} />
          <h3>Your friends</h3>
          {friends.length === 0 ? (
            <p>No friends yet — add one by email above.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {friends.map((f) => (
                <li key={f.id} style={{ padding: "6px 0" }}>
                  {f.name ?? f.email}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
