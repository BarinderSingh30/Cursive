import { useEffect, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { BoardRole } from "@cursive/shared";
import { pickAvailableColor } from "../presenceColors.js";

export interface PresenceState {
  name: string;
  color: string;
  role: BoardRole;
  cursor: { x: number; y: number } | null;
}

export function useAwareness(provider: HocuspocusProvider | null, name: string, preferredColor: string, role: BoardRole) {
  const [peers, setPeers] = useState<Map<number, PresenceState>>(new Map());
  const [color, setColor] = useState(preferredColor);

  useEffect(() => {
    if (!provider) return;

    const takenColors = new Set<string>();
    provider.awareness?.getStates().forEach((state, clientId) => {
      if (clientId === provider.awareness?.clientID) return;
      const presence = state.presence as PresenceState | undefined;
      if (presence?.color) takenColors.add(presence.color);
    });
    const resolvedColor = pickAvailableColor(preferredColor, takenColors);
    setColor(resolvedColor);
    provider.setAwarenessField("presence", { name, color: resolvedColor, role, cursor: null });

    const sync = () => {
      const states = new Map<number, PresenceState>();
      provider.awareness?.getStates().forEach((state, clientId) => {
        if (clientId === provider.awareness?.clientID) return;
        const presence = state.presence as PresenceState | undefined;
        // Viewers can number in the dozens or hundreds (a broadcast link's
        // audience later on) — the "who's online" list is for people you're
        // actually collaborating with, not everyone watching.
        if (presence && presence.role !== "viewer") states.set(clientId, presence);
      });
      setPeers(states);
    };

    sync();
    provider.awareness?.on("change", sync);
    return () => provider.awareness?.off("change", sync);
  }, [provider, name, preferredColor, role]);

  const updateCursor = (cursor: { x: number; y: number } | null) => {
    provider?.setAwarenessField("presence", { name, color, role, cursor });
  };

  const localPresence: PresenceState = { name, color, role, cursor: null };

  return { peers, updateCursor, localPresence };
}
