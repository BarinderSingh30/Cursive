import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Board } from "./canvas/Board.js";

function BoardRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  return <Board roomId={boardId ?? "demo"} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/board/demo" replace />} />
        <Route path="/board/:boardId" element={<BoardRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
