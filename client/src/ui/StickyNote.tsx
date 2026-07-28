import type { CSSProperties, ReactNode } from "react";
import styles from "./StickyNote.module.css";

export type StickyNoteColor = "yellow" | "pink" | "mint" | "blue";

export type StickyNoteProps = {
  color?: StickyNoteColor;
  /** Board-card variant sits on the canvas and doesn't round its corners. */
  square?: boolean;
  onCanvas?: boolean;
  tape?: boolean;
  tapeRotate?: number;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

export function StickyNote({
  color = "yellow",
  square = false,
  onCanvas = false,
  tape = true,
  tapeRotate = -2,
  rotate,
  className,
  style,
  children,
}: StickyNoteProps) {
  const classes = [
    styles.note,
    styles[color],
    square ? styles.square : "",
    onCanvas ? styles.onCanvas : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ ...(rotate !== undefined ? { transform: `rotate(${rotate}deg)` } : {}), ...style }}
    >
      {tape && (
        <span
          className={styles.tape}
          aria-hidden="true"
          style={{ transform: `rotate(${tapeRotate}deg)` }}
        />
      )}
      {children}
    </div>
  );
}
