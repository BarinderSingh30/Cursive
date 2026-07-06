import { useCallback, useEffect, useState } from "react";
import type { FriendRequestSummary, FriendSummary } from "@cursive/shared";
import { api } from "../api/client.js";

const FRIENDS_POLL_INTERVAL_MS = 5000;

export function useFriends() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [friendsData, requestsData] = await Promise.all([
      api.get<FriendSummary[]>("/api/friends"),
      api.get<FriendRequestSummary[]>("/api/friends/requests"),
    ]);
    setFriends(friendsData);
    setRequests(requestsData);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(refresh, FRIENDS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const sendRequest = useCallback(async (email: string) => {
    await api.post("/api/friends/requests", { email });
  }, []);

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await api.post(`/api/friends/requests/${requestId}/accept`);
      await refresh();
    },
    [refresh],
  );

  const declineRequest = useCallback(
    async (requestId: string) => {
      await api.post(`/api/friends/requests/${requestId}/decline`);
      await refresh();
    },
    [refresh],
  );

  return { friends, requests, loading, sendRequest, acceptRequest, declineRequest };
}
