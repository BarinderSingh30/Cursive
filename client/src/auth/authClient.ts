import { createAuthClient } from "better-auth/react";
import { env } from "../env.js";

export const authClient = createAuthClient({
  baseURL: env.API_URL,
});

export const { useSession, signIn, signUp, signOut } = authClient;
