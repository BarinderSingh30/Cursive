import { useState, type FormEvent } from "react";
import { useFriends } from "../friends/useFriends.js";
import { api } from "../api/client.js";
import { FriendSearch } from "./FriendSearch.js";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import styles from "./CreateGroupDialog.module.css";

interface Props {
  onCreated: (conversationId: string) => void;
}

export function CreateGroupDialog({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
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
    setOpen(false);
    onCreated(id);
  };

  const selectedFriends = selectedEmails.map((email) => friends.find((f) => f.email === email)).filter((f) => f != null);
  const searchableFriends = friends.filter((f) => !selectedEmails.includes(f.email));

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + New group
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New group chat">
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            className={styles.input}
            required
          />
          {selectedFriends.length > 0 && (
            <div className={styles.chips}>
              {selectedFriends.map((f) => (
                <button key={f.id} type="button" onClick={() => removeFriend(f.email)} className={styles.chip}>
                  {f.name ?? f.email} ✕
                </button>
              ))}
            </div>
          )}
          <FriendSearch friends={searchableFriends} onSelect={addFriend} />
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={selectedEmails.length === 0}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
