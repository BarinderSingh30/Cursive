import { useRef, useState, type FormEvent } from "react";
import { useFriends } from "../friends/useFriends.js";
import { api } from "../api/client.js";
import { FriendSearch } from "./FriendSearch.js";

interface Props {
  onCreated: (conversationId: string) => void;
}

export function CreateGroupDialog({ onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { friends } = useFriends();
  const [name, setName] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const addFriend = (email: string) => {
    setSelectedEmails((current) => (current.includes(email) ? current : [...current, email]));
  };

  const removeFriend = (email: string) => {
    setSelectedEmails((current) => current.filter((e) => e !== email));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { id } = await api.post<{ id: string }>("/api/chat/conversations/group", { name, memberEmails: selectedEmails });
    setName("");
    setSelectedEmails([]);
    dialogRef.current?.close();
    onCreated(id);
  };

  const selectedFriends = selectedEmails.map((email) => friends.find((f) => f.email === email)).filter((f) => f != null);
  const searchableFriends = friends.filter((f) => !selectedEmails.includes(f.email));

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        + New group
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
          <h3 style={{ margin: 0 }}>New group chat</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" required />
          {selectedFriends.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedFriends.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => removeFriend(f.email)}
                  style={{
                    border: "none",
                    borderRadius: 12,
                    padding: "2px 8px",
                    background: "#e7f5ff",
                    cursor: "pointer",
                  }}
                >
                  {f.name ?? f.email} ✕
                </button>
              ))}
            </div>
          )}
          <FriendSearch friends={searchableFriends} onSelect={addFriend} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" disabled={selectedEmails.length === 0}>
              Create
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
