import { useEffect, useRef, useState } from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { BoardRole } from "@cursive/shared";
import { pickAvailableColor } from "../presenceColors.js";

export interface PresenceState {
  name: string;
  color: string;
  role: BoardRole;
  cursor: { x: number; y: number } | null;
  inCall: boolean;
}

export function useAwareness(provider: HocuspocusProvider | null, name: string, preferredColor: string, role: BoardRole) {
  const [peers, setPeers] = useState<Map<number, PresenceState>>(new Map());
  const [color, setColor] = useState(preferredColor);
  const [callParticipantCount, setCallParticipantCount] = useState(0);
  // cursor moves constantly, inCall flips rarely — tracked together so
  // setting one field never clobbers the other in the shared "presence" field.
  const localFieldsRef = useRef<{ cursor: { x: number; y: number } | null; inCall: boolean }>({
    cursor: null,
    inCall: false,
  });

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
    provider.setAwarenessField("presence", { name, color: resolvedColor, role, ...localFieldsRef.current });

    const sync = () => {
      const states = new Map<number, PresenceState>();
      let othersInCall = 0;
      provider.awareness?.getStates().forEach((state, clientId) => {
        if (clientId === provider.awareness?.clientID) return;
        const presence = state.presence as PresenceState | undefined;
        if (presence?.inCall) othersInCall += 1;
        // Viewers can number in the dozens or hundreds (a broadcast link's
        // audience later on) — the "who's online" list is for people you're
        // actually collaborating with, not everyone watching. Call presence
        // is counted separately above, regardless of role, since a viewer
        // can join a call to watch/listen even though they're hidden here.
        if (presence && presence.role !== "viewer") states.set(clientId, presence);
      });
      setPeers(states);
      setCallParticipantCount(othersInCall);
    };

    sync();
    provider.awareness?.on("change", sync);
    return () => provider.awareness?.off("change", sync);
  }, [provider, name, preferredColor, role]);

  const updateCursor = (cursor: { x: number; y: number } | null) => {
    localFieldsRef.current.cursor = cursor;
    provider?.setAwarenessField("presence", { name, color, role, ...localFieldsRef.current });
  };

  const setInCall = (inCall: boolean) => {
    localFieldsRef.current.inCall = inCall;
    provider?.setAwarenessField("presence", { name, color, role, ...localFieldsRef.current });
  };

  const localPresence: PresenceState = { name, color, role, ...localFieldsRef.current };

  return { peers, updateCursor, setInCall, callParticipantCount, localPresence };
}
