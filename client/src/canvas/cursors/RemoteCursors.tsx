import { Group, Layer, Line, Rect, Text } from "react-konva";
import type { PresenceState } from "../yjs/useAwareness.js";

interface Props {
  peers: Map<number, PresenceState>;
}

// A simple hand-drawn-style arrow, tip at the origin (0,0) — matches the
// pointer position exactly, same as the plain dot cursor it replaces.
const ARROW_POINTS = [0, 0, 0, 14, 3.5, 11, 6, 17, 8, 16, 5.5, 10, 10, 10];

export function RemoteCursors({ peers }: Props) {
  return (
    <Layer listening={false}>
      {Array.from(peers.entries()).map(([clientId, peer]) => {
        if (!peer.cursor) return null;
        const nameWidth = Math.max(24, peer.name.length * 7 + 18);
        return (
          <Group key={clientId} x={peer.cursor.x} y={peer.cursor.y}>
            <Line points={ARROW_POINTS} closed fill={peer.color} stroke="#fffdf6" strokeWidth={1} />
            <Rect x={10} y={16} width={nameWidth} height={20} cornerRadius={5} fill={peer.color} />
            <Text
              text={peer.name}
              x={10}
              y={16}
              width={nameWidth}
              height={20}
              align="center"
              verticalAlign="middle"
              fontFamily="Patrick Hand"
              fontSize={14}
              fill="#fffdf6"
            />
          </Group>
        );
      })}
    </Layer>
  );
}
