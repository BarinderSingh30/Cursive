export const env = {
  SYNC_URL: (import.meta.env.VITE_SYNC_URL as string | undefined) ?? "ws://localhost:4000/sync",
  CHAT_SOCKET_URL: (import.meta.env.VITE_CHAT_SOCKET_URL as string | undefined) ?? "ws://localhost:4000/chat",
  API_URL: (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000",
  LIVEKIT_URL: (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "ws://localhost:7880",
  BOARD_CHAT_SOCKET_URL: (import.meta.env.VITE_BOARD_CHAT_SOCKET_URL as string | undefined) ?? "ws://localhost:4000/board-chat",
};
