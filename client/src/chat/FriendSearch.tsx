import { useState } from "react";
import type { FriendSummary } from "@cursive/shared";
import styles from "./FriendSearch.module.css";

interface Props {
  friends: FriendSummary[];
  onSelect: (email: string) => void;
}

export function FriendSearch({ friends, onSelect }: Props) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? friends.filter((f) => {
        const label = f.name ?? f.email;
        return label.toLowerCase().includes(normalizedQuery) || f.email.toLowerCase().includes(normalizedQuery);
      })
    : [];

  const handleSelect = (email: string) => {
    onSelect(email);
    setQuery("");
  };

  return (
    <div className={styles.wrap}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search friends…"
        className={styles.input}
      />
      {normalizedQuery && (
        <div className={styles.results}>
          {matches.length === 0 ? (
            <p className={styles.empty}>No friends found</p>
          ) : (
            matches.map((f) => (
              <button key={f.id} type="button" onClick={() => handleSelect(f.email)} className={styles.resultButton}>
                {f.name ?? f.email}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
