import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { CallTokenResponse } from "@cursive/shared";
import { api } from "../api/client.js";
import { env } from "../env.js";

export interface CallParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  cameraTrack: Track | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
}

export function useCall(boardId: string, canPublish: boolean) {
  const roomRef = useRef<Room | null>(null);
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
        cameraTrack: local.getTrackPublication(Track.Source.Camera)?.track ?? null,
        micEnabled: local.isMicrophoneEnabled,
        cameraEnabled: local.isCameraEnabled,
      },
      ...Array.from(room.remoteParticipants.values()).map((p) => ({
        identity: p.identity,
        name: p.name ?? p.identity,
        isLocal: false,
        cameraTrack: p.getTrackPublication(Track.Source.Camera)?.track ?? null,
        micEnabled: p.isMicrophoneEnabled,
        cameraEnabled: p.isCameraEnabled,
      })),
    ];
    setParticipants(all);
  }, []);

  const join = useCallback(async () => {
    const { token, url } = await api.get<CallTokenResponse>(`/api/boards/${boardId}/call-token`);
    const room = new Room();
    roomRef.current = room;

    room
      .on(RoomEvent.TrackSubscribed, syncParticipants)
      .on(RoomEvent.TrackUnsubscribed, syncParticipants)
      .on(RoomEvent.ParticipantConnected, syncParticipants)
      .on(RoomEvent.ParticipantDisconnected, syncParticipants)
      .on(RoomEvent.LocalTrackPublished, syncParticipants)
      .on(RoomEvent.LocalTrackUnpublished, syncParticipants)
      .on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setIsJoined(false);
        setParticipants([]);
      });

    await room.connect(url, token);

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
  }, [boardId, canPublish, syncParticipants]);

  const leave = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    setIsJoined(false);
    setParticipants([]);
  }, []);

  const toggleCamera = useCallback(async () => {
    const local = roomRef.current?.localParticipant;
    if (!local) return;
    await local.setCameraEnabled(!local.isCameraEnabled);
    syncParticipants();
  }, [syncParticipants]);

  const toggleMic = useCallback(async () => {
    const local = roomRef.current?.localParticipant;
    if (!local) return;
    await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
    syncParticipants();
  }, [syncParticipants]);

  // Covers navigating away from the board mid-call, not just clicking Leave.
  useEffect(() => {
    return () => {
      roomRef.current?.disconnect();
    };
  }, []);

  return { isJoined, participants, join, leave, toggleCamera, toggleMic };
}
