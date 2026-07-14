export const env = {
  SYNC_URL: (import.meta.env.VITE_SYNC_URL as string | undefined) ?? "ws://localhost:4000/sync",
  CHAT_SOCKET_URL: (import.meta.env.VITE_CHAT_SOCKET_URL as string | undefined) ?? "ws://localhost:4000/chat",
  API_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000",
  ENABLE_GOOGLE_AUTH: import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true",
  ENABLE_GITHUB_AUTH: import.meta.env.VITE_ENABLE_GITHUB_AUTH === "true",
  LIVEKIT_URL: (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "ws://localhost:7880",
};
