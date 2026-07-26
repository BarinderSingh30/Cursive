import { useState } from "react";

function storageKey(shareToken: string, field: "id" | "name"): string {
  return `cursive:anon:${shareToken}:${field}`;
}

/**
 * A not-logged-in share-link visitor's stable per-browser identity: a random
 * id (so their cursor/chat identity is stable across reconnects) and a
 * self-chosen display name (prompted once, see WatchPage.tsx), both kept in
 * localStorage scoped to this specific share link.
 */
export function useAnonIdentity(shareToken: string) {
  const [anonId] = useState<string>(() => {
    const existing = localStorage.getItem(storageKey(shareToken, "id"));
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(storageKey(shareToken, "id"), created);
    return created;
  });
  const [anonName, setAnonNameState] = useState<string | null>(() => localStorage.getItem(storageKey(shareToken, "name")));

  const setAnonName = (name: string) => {
    localStorage.setItem(storageKey(shareToken, "name"), name);
    setAnonNameState(name);
  };

  return { anonId, anonName, setAnonName };
}
