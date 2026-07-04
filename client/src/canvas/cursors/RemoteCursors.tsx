import { Circle, Group, Layer, Text } from "react-konva";
import type { PresenceState } from "../yjs/useAwareness.js";

interface Props {
  peers: Map<number, PresenceState>;
}

export function RemoteCursors({ peers }: Props) {
  return (
    <Layer listening={false}>
      {Array.from(peers.entries()).map(([clientId, peer]) => {
        if (!peer.cursor) return null;
        return (
          <Group key={clientId} x={peer.cursor.x} y={peer.cursor.y}>
            <Circle radius={5} fill={peer.color} />
            <Text text={peer.name} x={10} y={-6} fontSize={12} fill={peer.color} />
          </Group>
        );
      })}
    </Layer>
  );
}
