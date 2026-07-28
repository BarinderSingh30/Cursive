import { useState, type FormEvent } from "react";
import { Modal } from "../ui/Modal.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import styles from "./CreateBoardDialog.module.css";

interface Props {
  onCreate: (name: string) => Promise<unknown>;
}

export function CreateBoardDialog({ onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName("");
    setOpen(false);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New board</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New board">
        <form onSubmit={handleSubmit} className={styles.form}>
          <Input autoFocus placeholder="Board name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
