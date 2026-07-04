import { useMemo } from "react";
import { useYjsDocument } from "./yjs/useYjsDocument.js";
import { useYShapes } from "./yjs/useYShapes.js";
import { useAwareness, type PresenceState } from "./yjs/useAwareness.js";
import { ActiveToolProvider, useActiveTool } from "./tools/useActiveTool.js";
import { Toolbar } from "./tools/Toolbar.js";
import { PresenceList } from "./cursors/PresenceList.js";
import { CanvasStage } from "./Stage.js";

const PRESENCE_COLORS = ["#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5"];

function randomPresence(): PresenceState {
  return {
    name: `Guest ${Math.floor(Math.random() * 1000)}`,
    color: PRESENCE_COLORS[Math.floor(Math.random() * PRESENCE_COLORS.length)],
    cursor: null,
  };
}

function BoardInner({ roomId }: { roomId: string }) {
  const { doc, provider } = useYjsDocument(roomId);
  const { shapes, addShape, updateShape, removeShape } = useYShapes(doc);
  const localPresence = useMemo(randomPresence, []);
  const { peers, updateCursor } = useAwareness(provider, localPresence);
  const { tool } = useActiveTool();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: 8,
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <Toolbar />
        <span style={{ fontSize: 12, color: "#868e96" }}>Select tool → click a shape → Delete/Backspace to remove</span>
        <PresenceList self={localPresence} peers={peers} />
      </div>
      <div style={{ flex: 1 }}>
        <CanvasStage
          shapes={shapes}
          peers={peers}
          activeTool={tool}
          onAddShape={addShape}
          onUpdateShape={updateShape}
          onRemoveShape={removeShape}
          onCursorMove={updateCursor}
        />
      </div>
    </div>
  );
}

export function Board({ roomId }: { roomId: string }) {
  return (
    <ActiveToolProvider>
      <BoardInner roomId={roomId} />
    </ActiveToolProvider>
  );
}
