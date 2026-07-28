import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { signIn } from "./authClient.js";
import { AuthLayout } from "./AuthLayout.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { Wordmark } from "../ui/Wordmark.js";
import styles from "./AuthLayout.module.css";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: signInError } = await signIn.email({ email, password });
    if (signInError) {
      setError(signInError.message ?? "Could not log in");
      return;
    }
    // A full page navigation (not react-router's navigate) on purpose: it
    // guarantees the dashboard's first render does a fresh session fetch
    // with the cookie the browser just received, instead of racing
    // useSession()'s client-side cache, which sometimes hadn't caught up
    // yet and bounced back to a blank login page.
    window.location.href = "/dashboard";
  };

  return (
    <AuthLayout
      asidePosition="right"
      asideColor="blue"
      asideRotate={1.5}
      aside={
        <>
          <div className={styles.asideLockup}>
            <Wordmark size={28} />
          </div>
          <h2 className={styles.asideHeading}>Live cursors, board chat, calls — one pinboard.</h2>
          <p className={styles.asideBody}>Everyone draws on the same board, in real time, from anywhere.</p>
        </>
      }
    >
      <h1 className={styles.heading}>Welcome back</h1>
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className={styles.formError}>{error}</p>}
        <Button type="submit" fullWidth>
          Log in
        </Button>
      </form>
      <p className={styles.footer}>
        No account? <Link to="/signup">Sign up</Link>
      </p>
    </AuthLayout>
  );
}
