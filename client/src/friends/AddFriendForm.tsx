import { forwardRef, useState, type FormEvent } from "react";
import { Button } from "../ui/Button.js";
import styles from "./AddFriendForm.module.css";

interface Props {
  onSend: (email: string) => Promise<unknown>;
}

export const AddFriendForm = forwardRef<HTMLInputElement, Props>(function AddFriendForm({ onSend }, ref) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onSend(email);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request");
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input
        ref={ref}
        type="email"
        placeholder="Their email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={styles.input}
        required
      />
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit">Send request</Button>
    </form>
  );
});
