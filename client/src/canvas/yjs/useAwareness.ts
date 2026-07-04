import { useEffect, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";

export interface PresenceState {
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
}

export function useAwareness(provider: HocuspocusProvider | null, localState: PresenceState) {
  const [peers, setPeers] = useState<Map<number, PresenceState>>(new Map());

  useEffect(() => {
    if (!provider) return;

    provider.setAwarenessField("presence", localState);

    const sync = () => {
      const states = new Map<number, PresenceState>();
      provider.awareness?.getStates().forEach((state, clientId) => {
        if (clientId === provider.awareness?.clientID) return;
        if (state.presence) states.set(clientId, state.presence as PresenceState);
      });
      setPeers(states);
    };

    sync();
    provider.awareness?.on("change", sync);
    return () => provider.awareness?.off("change", sync);
  }, [provider, localState]);

  const updateCursor = (cursor: { x: number; y: number } | null) => {
    provider?.setAwarenessField("presence", { ...localState, cursor });
  };

  return { peers, updateCursor };
}
