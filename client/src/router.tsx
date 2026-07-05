import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Board } from "./canvas/Board.js";
import { LoginPage } from "./auth/LoginPage.js";
import { SignupPage } from "./auth/SignupPage.js";
import { RequireAuth } from "./auth/RequireAuth.js";
import { DashboardPage } from "./dashboard/DashboardPage.js";
import { FriendsPage } from "./friends/FriendsPage.js";
import { ChatPage } from "./chat/ChatPage.js";

function BoardRoute() {
  const { boardId } = useParams<{ boardId: string }>();
  if (!boardId) return <Navigate to="/dashboard" replace />;
  return <Board roomId={boardId} />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/friends"
          element={
            <RequireAuth>
              <FriendsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/board/:boardId"
          element={
            <RequireAuth>
              <BoardRoute />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
