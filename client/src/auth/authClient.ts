import { createAuthClient } from "better-auth/react";
import { env } from "../env.js";

export const authClient = createAuthClient({
  // Better Auth treats baseURL as optional when client and server share a
  // domain, falling back to a relative default itself — so when API_URL is
  // "" (same-origin Docker build, see client build args in docker-compose.yml)
  // we omit the key entirely rather than pass an empty string.
  ...(env.API_URL ? { baseURL: env.API_URL } : {}),
});

export const { useSession, signIn, signUp, signOut } = authClient;
