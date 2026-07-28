import { useEffect, useState, type FormEvent } from "react";
import type { BoardRole } from "@cursive/shared";
import { useFriends } from "../friends/useFriends.js";
import { useBoardMembers } from "./useBoardMembers.js";
import { usePendingBoardInvites } from "./usePendingBoardInvites.js";
import { api } from "../api/client.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import styles from "./InviteMemberDialog.module.css";

interface Props {
  boardId: string;
  /** Bumped by Board.tsx whenever a "membership-changed" signal arrives over the board's live connection. */
  membershipVersion: number;
}

export function InviteMemberDialog({ boardId, membershipVersion }: Props) {
  const [open, setOpen] = useState(false);
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
      <Button variant="primary" onClick={() => setOpen(true)}>
        Members
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Board members">
        <div className={styles.content}>
          <div>
            <h3 className={styles.sectionHeading}>Current members</h3>
            {membersLoading ? (
              <p className={styles.muted}>Loading…</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {manageableMembers.map((m) => (
                  <li key={m.userId} className={styles.memberRow}>
                    <span>
                      {m.name ?? m.email} <span className={styles.roleTag}>({m.role})</span>
                    </span>
                    {m.role !== "owner" && (
                      <Button variant="ghost" onClick={() => removeMember(m.userId)}>
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!invitesLoading && manageablePendingInvites.length > 0 && (
            <div>
              <h3 className={styles.sectionHeading}>Waiting on a response</h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {manageablePendingInvites.map((i) => (
                  <li key={i.id} className={styles.pendingRow}>
                    {i.inviteeName ?? i.inviteeEmail} <span className={styles.roleTag}>({i.role}, invited)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <h3 className={styles.sectionHeading}>Invite a friend</h3>
            {friends.length === 0 ? (
              <p className={styles.muted}>You don't have any friends yet — add one from the Friends page first.</p>
            ) : (
              <>
                <label className={styles.fieldLabel}>
                  Friend
                  <select value={email} onChange={(e) => setEmail(e.target.value)} required className={styles.select}>
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
                <fieldset className={styles.radioGroup}>
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
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
              {friends.length > 0 && <Button type="submit">Invite</Button>}
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
