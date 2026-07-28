import type { ReactNode } from "react";
import { StickyNote, type StickyNoteColor } from "../ui/StickyNote.js";
import styles from "./AuthLayout.module.css";

export type AuthLayoutProps = {
  asidePosition: "left" | "right";
  asideColor: StickyNoteColor;
  asideRotate: number;
  aside: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ asidePosition, asideColor, asideRotate, aside, children }: AuthLayoutProps) {
  const asideNode = (
    <StickyNote
      color={asideColor}
      rotate={asideRotate}
      tapeRotate={asideRotate >= 0 ? 2 : -2}
      className={styles.aside}
    >
      {aside}
    </StickyNote>
  );
  const formNode = (
    <StickyNote color="yellow" className={styles.formCard}>
      {children}
    </StickyNote>
  );

  return (
    <div className={styles.page}>
      <div className={styles.row}>
        {asidePosition === "left" ? (
          <>
            {asideNode}
            {formNode}
          </>
        ) : (
          <>
            {formNode}
            {asideNode}
          </>
        )}
      </div>
    </div>
  );
}
