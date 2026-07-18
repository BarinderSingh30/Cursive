import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { CallTokenResponse } from "@cursive/shared";
import { api } from "../api/client.js";

export interface CallParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  // Server-granted permission (from the LiveKit token, ultimately from
  // board role) — the authoritative source for "is this a viewer," rather
  // than plumbing board role through the call layer separately.
  canPublish: boolean;
  cameraTrack: Track | null;
  audioTrack: Track | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
}

export function useCall(boardId: string, canPublish: boolean) {
  const roomRef = useRef<Room | null>(null);
  const isJoiningRef = useRef(false);
  const [isJoined, setIsJoined] = useState(false);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);

  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) {
      setParticipants([]);
      return;
    }
    const local = room.localParticipant;
    const all: CallParticipant[] = [
      {
        identity: local.identity,
        name: local.name ?? local.identity,
        isLocal: true,
        canPublish: local.permissions?.canPublish ?? false,
        cameraTrack: local.getTrackPublication(Track.Source.Camera)?.track ?? null,
        audioTrack: local.getTrackPublication(Track.Source.Microphone)?.track ?? null,
        micEnabled: local.isMicrophoneEnabled,
        cameraEnabled: local.isCameraEnabled,
      },
      ...Array.from(room.remoteParticipants.values()).map((p) => ({
        identity: p.identity,
        name: p.name ?? p.identity,
        isLocal: false,
        canPublish: p.permissions?.canPublish ?? false,
        cameraTrack: p.getTrackPublication(Track.Source.Camera)?.track ?? null,
        audioTrack: p.getTrackPublication(Track.Source.Microphone)?.track ?? null,
        micEnabled: p.isMicrophoneEnabled,
        cameraEnabled: p.isCameraEnabled,
      })),
    ];
    setParticipants(all);
  }, []);

  const join = useCallback(async () => {
    // Guard against re-entrancy: a double-click or a retry fired before the
    // in-flight connect() resolves must be a no-op, otherwise a second Room
    // instance would overwrite roomRef.current and leak the first one.
    if (isJoiningRef.current || isJoined) return;
    isJoiningRef.current = true;

    try {
      const { token, url } = await api.get<CallTokenResponse>(`/api/boards/${boardId}/call-token`);
      const room = new Room();
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, syncParticipants)
        .on(RoomEvent.TrackUnsubscribed, syncParticipants)
        .on(RoomEvent.ParticipantConnected, syncParticipants)
        .on(RoomEvent.ParticipantDisconnected, syncParticipants)
        // A participant's permission grant can arrive slightly after their
        // initial ParticipantConnected event — without this, canPublish
        // could briefly read as false for a genuine collaborator/owner.
        .on(RoomEvent.ParticipantPermissionsChanged, syncParticipants)
        .on(RoomEvent.LocalTrackPublished, syncParticipants)
        .on(RoomEvent.LocalTrackUnpublished, syncParticipants)
        // Toggling mic/camera mid-call mutes the existing track rather than
        // unpublishing it, so it only ever fires Track(Un)Muted — without
        // these, everyone else's tile keeps showing whatever mic/camera
        // state a participant had at the moment they joined.
        .on(RoomEvent.TrackMuted, syncParticipants)
        .on(RoomEvent.TrackUnmuted, syncParticipants)
        .on(RoomEvent.Disconnected, () => {
          // Only clear the ref if it still points at *this* room — an older,
          // already-replaced room's late Disconnected event must not wipe
          // out a newer, legitimate room reference.
          if (roomRef.current === room) {
            roomRef.current = null;
          }
          setIsJoined(false);
          setParticipants([]);
        });

      try {
        await room.connect(url, token);
      } catch (err) {
        // connect() failed — leave no dead Room behind, otherwise the
        // re-entrancy guard above would permanently block future joins.
        if (roomRef.current === room) {
          roomRef.current = null;
        }
        room.disconnect();
        throw err;
      }

      if (canPublish) {
        try {
          await room.localParticipant.enableCameraAndMicrophone();
        } catch {
          // Browser denied camera/mic permission — join listen/watch-only
          // instead of failing the whole call.
        }
      }

      setIsJoined(true);
      syncParticipants();
    } finally {
      isJoiningRef.current = false;
    }
  }, [boardId, canPublish, isJoined, syncParticipants]);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setIsJoined(false);
    setParticipants([]);
  }, []);

  const toggleCamera = useCallback(async () => {
    // Defense in depth: a viewer must never trigger a camera permission
    // prompt, even if a future consumer renders this control unconditionally.
    if (!canPublish) return;
    const local = roomRef.current?.localParticipant;
    if (!local) return;
    await local.setCameraEnabled(!local.isCameraEnabled);
    syncParticipants();
  }, [canPublish, syncParticipants]);

  const toggleMic = useCallback(async () => {
    // Defense in depth: a viewer must never trigger a mic permission
    // prompt, even if a future consumer renders this control unconditionally.
    if (!canPublish) return;
    const local = roomRef.current?.localParticipant;
    if (!local) return;
    await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
    syncParticipants();
  }, [canPublish, syncParticipants]);

  // Covers navigating away from the board mid-call, not just clicking Leave.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  return { isJoined, participants, join, leave, toggleCamera, toggleMic };
}
