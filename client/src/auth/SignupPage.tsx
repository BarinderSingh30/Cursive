import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { signUp } from "./authClient.js";
import { AuthLayout } from "./AuthLayout.js";
import { Input } from "../ui/Input.js";
import { Button } from "../ui/Button.js";
import { Avatar } from "../ui/Avatar.js";
import styles from "./AuthLayout.module.css";

const SAMPLE_AVATAR_COLORS = ["#2f9e44", "#1971c2", "#f08c00"];

export function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: signUpError } = await signUp.email({ name, email, password });
    if (signUpError) {
      setError(signUpError.message ?? "Could not sign up");
      return;
    }
    // See LoginPage's handleSubmit for why this is a full navigation, not react-router's navigate().
    window.location.href = "/dashboard";
  };

  return (
    <AuthLayout
      asidePosition="left"
      asideColor="mint"
      asideRotate={-1.6}
      aside={
        <>
          <h2 className={styles.asideHeading}>Three clicks to your first board</h2>
          <p className={styles.asideBody}>Free while you're figuring it out. Invite friends by email whenever you're ready.</p>
          <div className={styles.avatarStack}>
            {SAMPLE_AVATAR_COLORS.map((color, i) => (
              <Avatar key={color} name={`Person ${i + 1}`} color={color} size={30} surfaceColor="var(--note-mint)" />
            ))}
          </div>
          <p className={styles.asideCount}>2,148 boards this week</p>
        </>
      }
    >
      <h1 className={styles.heading}>Make an account</h1>
      <form onSubmit={handleSubmit} className={styles.form}>
        <Input label="Name" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
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
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p className={styles.formError}>{error}</p>}
        <Button type="submit" fullWidth>
          Create account
        </Button>
      </form>
      <p className={styles.footer}>
        Already pinned up here? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
