import { useRef, useState, type FormEvent } from "react";
import { useFriends } from "../friends/useFriends.js";
import { api } from "../api/client.js";

interface Props {
  onCreated: (conversationId: string) => void;
}

export function CreateGroupDialog({ onCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { friends } = useFriends();
  const [name, setName] = useState("");
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const toggleFriend = (email: string) => {
    setSelectedEmails((current) => (current.includes(email) ? current.filter((e) => e !== email) : [...current, email]));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const { id } = await api.post<{ id: string }>("/api/chat/conversations/group", { name, memberEmails: selectedEmails });
    setName("");
    setSelectedEmails([]);
    dialogRef.current?.close();
    onCreated(id);
  };

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        + New group
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 260 }}>
          <h3 style={{ margin: 0 }}>New group chat</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" required />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
            {friends.map((f) => (
              <label key={f.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={selectedEmails.includes(f.email)} onChange={() => toggleFriend(f.email)} />
                {f.name ?? f.email}
              </label>
            ))}
          </div>
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
