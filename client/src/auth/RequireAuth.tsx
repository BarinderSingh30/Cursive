import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "./authClient.js";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();

  if (isPending) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
