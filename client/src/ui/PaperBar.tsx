import type { ReactNode } from "react";
import { NavLink, type NavLinkProps } from "react-router-dom";
import styles from "./PaperBar.module.css";

export type PaperBarProps = {
  left?: ReactNode;
  right?: ReactNode;
};

export function PaperBar({ left, right }: PaperBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.left}>{left}</div>
      <div className={styles.right}>{right}</div>
    </div>
  );
}

export function PaperBarNavLink(props: NavLinkProps) {
  return (
    <NavLink
      {...props}
      className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
    />
  );
}
