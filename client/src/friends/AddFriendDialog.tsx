import { useRef, useState, type FormEvent } from "react";

interface Props {
  onSend: (email: string) => Promise<unknown>;
}

export function AddFriendDialog({ onSend }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onSend(email);
      setEmail("");
      dialogRef.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request");
    }
  };

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        + Add friend
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
          <h3 style={{ margin: 0 }}>Add a friend</h3>
          <input
            autoFocus
            type="email"
            placeholder="Their email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <p style={{ color: "#e03131", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit">Send request</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
