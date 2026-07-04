export const env = {
  SYNC_URL: (import.meta.env.VITE_SYNC_URL as string | undefined) ?? "ws://localhost:4000/sync",
};
