import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signIn } from "./authClient.js";
import { OAuthButtons } from "./OAuthButtons.js";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: signInError } = await signIn.email({ email, password });
    if (signInError) {
      setError(signInError.message ?? "Could not log in");
      return;
    }
    navigate("/dashboard");
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
