import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "./authClient.js";
import { OAuthButtons } from "./OAuthButtons.js";

export function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { error: signUpError } = await signUp.email({ name, email, password });
    if (signUpError) {
      setError(signUpError.message ?? "Could not sign up");
      return;
    }
    navigate("/dashboard");
  };

  return (
    <div style={{ maxWidth: 340, margin: "80px auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <p style={{ color: "#e03131", margin: 0 }}>{error}</p>}
        <button type="submit">Sign up</button>
      </form>
      <OAuthButtons />
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
