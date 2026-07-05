export const PRESENCE_COLORS = [
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
  "#0c8599",
  "#e8590c",
  "#5c940d",
  "#1864ab",
  "#a61e4d",
];

/** A stable starting point so the same user tends to get the same color across sessions. */
export function colorForUser(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

/**
 * The hash above only has 10 buckets, so two people in the same room can
 * easily land on the same preferred color. This resolves that by checking
 * who's already connected and picking the next free color in the palette
 * instead, so two people never look identical on the same board.
 */
export function pickAvailableColor(preferred: string, takenColors: Set<string>): string {
  if (!takenColors.has(preferred)) return preferred;

  const startIndex = PRESENCE_COLORS.indexOf(preferred);
  for (let i = 1; i <= PRESENCE_COLORS.length; i++) {
    const candidate = PRESENCE_COLORS[(startIndex + i) % PRESENCE_COLORS.length];
    if (!takenColors.has(candidate)) return candidate;
  }
  return preferred; // every color is taken — fall back to the collision rather than crash
}
