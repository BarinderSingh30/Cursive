import { useEffect, useRef, useState, type FormEvent } from "react";
import type { BoardRole } from "@cursive/shared";
import { useFriends } from "../friends/useFriends.js";
import { useBoardMembers } from "./useBoardMembers.js";
import { usePendingBoardInvites } from "./usePendingBoardInvites.js";
import { api } from "../api/client.js";

interface Props {
  boardId: string;
  /** Bumped by Board.tsx whenever a "membership-changed" signal arrives over the board's live connection. */
  membershipVersion: number;
}

export function InviteMemberDialog({ boardId, membershipVersion }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { friends } = useFriends();
  const { members, loading: membersLoading, refresh: refreshMembers, removeMember } = useBoardMembers(boardId);
  const { invites: pendingInvites, loading: invitesLoading, refresh: refreshInvites } = usePendingBoardInvites(boardId);

  // An invite being accepted or declined elsewhere changes both who's a real
  // member and what's still pending — without this, this dialog kept saying
  // "waiting on a response" even after the invite had already been resolved,
  // until the page was refreshed.
  useEffect(() => {
    if (membershipVersion === 0) return;
    refreshMembers();
    refreshInvites();
  }, [membershipVersion, refreshMembers, refreshInvites]);
  // Viewers can pile up in the dozens or hundreds (think a broadcast link's
  // audience later on) — listing every one here would make this dialog
  // useless for its actual job of managing owners/collaborators. Viewers get
  // their own place to show up eventually (e.g. a live viewer list in chat).
  const manageableMembers = members.filter((m) => m.role !== "viewer");
  const manageablePendingInvites = pendingInvites.filter((i) => i.role !== "viewer");

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<BoardRole, "owner">>("collaborator");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/api/boards/${boardId}/invites`, { email, role });
      setEmail("");
      await refreshInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that invite");
    }
  };

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        Members
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 280 }}>
          <div>
            <h3 style={{ margin: "0 0 8px" }}>Current members</h3>
            {membersLoading ? (
              <p style={{ margin: 0, color: "#868e96" }}>Loading…</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {manageableMembers.map((m) => (
                  <li key={m.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>
                      {m.name ?? m.email} <span style={{ fontSize: 12, color: "#868e96" }}>({m.role})</span>
                    </span>
                    {m.role !== "owner" && (
                      <button type="button" onClick={() => removeMember(m.userId)}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!invitesLoading && manageablePendingInvites.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 8px" }}>Waiting on a response</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {manageablePendingInvites.map((i) => (
                  <li key={i.id} style={{ color: "#868e96" }}>
                    {i.inviteeName ?? i.inviteeEmail} <span style={{ fontSize: 12 }}>({i.role}, invited)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Invite a friend</h3>
            {friends.length === 0 ? (
              <p style={{ margin: 0, color: "#868e96" }}>
                You don't have any friends yet — add one from the Friends page first.
              </p>
            ) : (
              <>
                <label>
                  Friend
                  <select
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    style={{ display: "block", width: "100%" }}
                  >
                    <option value="" disabled>
                      Choose a friend…
                    </option>
                    {friends.map((f) => (
                      <option key={f.id} value={f.email}>
                        {f.name ?? f.email}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", gap: 12 }}>
                  <label>
                    <input type="radio" name="role" checked={role === "collaborator"} onChange={() => setRole("collaborator")} />
                    Collaborator (can draw)
                  </label>
                  <label>
                    <input type="radio" name="role" checked={role === "viewer"} onChange={() => setRole("viewer")} />
                    Viewer (read-only)
                  </label>
                </fieldset>
              </>
            )}
            {error && <p style={{ color: "#e03131", margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => dialogRef.current?.close()}>
                Close
              </button>
              {friends.length > 0 && <button type="submit">Invite</button>}
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
