import type { CSSProperties } from "react";
import { signIn } from "./authClient.js";
import { env } from "../env.js";

const buttonStyle: CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #d0d0d0",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};

export function OAuthButtons() {
  if (!env.ENABLE_GOOGLE_AUTH && !env.ENABLE_GITHUB_AUTH) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {env.ENABLE_GOOGLE_AUTH && (
        <button type="button" style={buttonStyle} onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })}>
          Continue with Google
        </button>
      )}
      {env.ENABLE_GITHUB_AUTH && (
        <button type="button" style={buttonStyle} onClick={() => signIn.social({ provider: "github", callbackURL: "/dashboard" })}>
          Continue with GitHub
        </button>
      )}
    </div>
  );
}
