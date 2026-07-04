import { useRef, useState, type FormEvent } from "react";

interface Props {
  onCreate: (name: string) => Promise<unknown>;
}

export function CreateBoardDialog({ onCreate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate(name.trim());
    setName("");
    dialogRef.current?.close();
  };

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        + New board
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
          <h3 style={{ margin: 0 }}>New board</h3>
          <input autoFocus placeholder="Board name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit">Create</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
