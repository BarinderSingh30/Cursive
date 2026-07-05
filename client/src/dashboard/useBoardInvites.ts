import { useCallback, useEffect, useState } from "react";
import type { ReceivedBoardInvite, DeclinedBoardInvite } from "@cursive/shared";
import { api } from "../api/client.js";

const BACKGROUND_REFRESH_MS = 3_000;

export function useBoardInvites() {
  const [received, setReceived] = useState<ReceivedBoardInvite[]>([]);
  const [declined, setDeclined] = useState<DeclinedBoardInvite[]>([]);

  const load = useCallback(async () => {
    const [receivedData, declinedData] = await Promise.all([
      api.get<ReceivedBoardInvite[]>("/api/board-invites/received"),
      api.get<DeclinedBoardInvite[]>("/api/board-invites/sent-declined"),
    ]);
    setReceived(receivedData);
    setDeclined(declinedData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(load, BACKGROUND_REFRESH_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, [load]);

  const accept = useCallback(async (inviteId: string) => {
    await api.post(`/api/board-invites/${inviteId}/accept`);
    setReceived((current) => current.filter((i) => i.id !== inviteId));
  }, []);

  const decline = useCallback(async (inviteId: string) => {
    await api.post(`/api/board-invites/${inviteId}/decline`);
    setReceived((current) => current.filter((i) => i.id !== inviteId));
  }, []);

  const dismiss = useCallback(async (inviteId: string) => {
    await api.post(`/api/board-invites/${inviteId}/dismiss`);
    setDeclined((current) => current.filter((i) => i.id !== inviteId));
  }, []);

  return { received, declined, accept, decline, dismiss };
}
