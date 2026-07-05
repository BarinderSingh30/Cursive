import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { signIn } from "./authClient.js";
import { OAuthButtons } from "./OAuthButtons.js";

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
    <div style={{ maxWidth: 340, margin: "80px auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: "#e03131", margin: 0 }}>{error}</p>}
        <button type="submit">Log in</button>
      </form>
      <OAuthButtons />
      <p>
        No account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
}
