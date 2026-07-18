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
  const [viewerPeers, setViewerPeers] = useState<Map<number, PresenceState>>(new Map());
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
      const collaboratorStates = new Map<number, PresenceState>();
      const viewerStates = new Map<number, PresenceState>();
      let othersInCall = 0;
      provider.awareness?.getStates().forEach((state, clientId) => {
        if (clientId === provider.awareness?.clientID) return;
        const presence = state.presence as PresenceState | undefined;
        if (!presence) return;
        // Only collaborators/owners ever broadcast inCall — a viewer's
        // client auto-connects to watch/listen once this count is above
        // zero, but that's not "joining a call" from this count's
        // perspective, so a viewer's own presence never contributes to it.
        if (presence.inCall && presence.role !== "viewer") othersInCall += 1;
        // Collaborators/owners and viewers are tracked as two separate
        // lists rather than one merged "who's online" count — a future
        // broadcast link's audience can number in the dozens or hundreds,
        // so it gets its own count instead of swamping the collaborator
        // list.
        if (presence.role === "viewer") viewerStates.set(clientId, presence);
        else collaboratorStates.set(clientId, presence);
      });
      setPeers(collaboratorStates);
      setViewerPeers(viewerStates);
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

  return { peers, viewerPeers, updateCursor, setInCall, callParticipantCount, localPresence };
}
