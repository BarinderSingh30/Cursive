import type Konva from "konva";

export interface ShapeInteractionProps {
  draggable: boolean;
  isSelected: boolean;
  onDragEnd: (x: number, y: number) => void;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
}

export const SELECTION_HIGHLIGHT = {
  shadowColor: "#1971c2",
  shadowBlur: 12,
  shadowOpacity: 0.6,
};
