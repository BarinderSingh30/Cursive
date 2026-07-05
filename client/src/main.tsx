import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root element in index.html");
}

// Deliberately not wrapped in <StrictMode>: in dev, StrictMode mounts every
// component twice (mount → cleanup → mount again) to catch impure effects.
// For a WebSocket-based collaboration provider, that means two real
// connections briefly open to the same room, sharing the same Y.Doc
// clientID — the second connection's "I'm here" and the first connection's
// "I'm leaving" broadcasts can arrive out of order, which is exactly what
// caused live cursors/presence to flicker or go missing until a refresh
// (the Yjs document itself was never affected — CRDT merges don't care about
// connection order — only the awareness/presence layer, which does).
createRoot(container).render(<App />);
