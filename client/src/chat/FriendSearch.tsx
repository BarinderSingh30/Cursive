import { useState } from "react";
import type { FriendSummary } from "@cursive/shared";

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
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search friends…"
      />
      {normalizedQuery && (
        <div style={{ display: "flex", flexDirection: "column", maxHeight: 160, overflowY: "auto" }}>
          {matches.length === 0 ? (
            <p style={{ color: "#868e96", fontSize: 12, margin: "4px 0" }}>No friends found</p>
          ) : (
            matches.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSelect(f.email)}
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                {f.name ?? f.email}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
