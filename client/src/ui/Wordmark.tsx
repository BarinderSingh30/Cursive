import { Link } from "react-router-dom";
import { Logo } from "./Logo.js";
import styles from "./Wordmark.module.css";

export type WordmarkProps = {
  /** Mark height in px; wordmark font-size matches it so mark and text line up. */
  size?: number;
  onDark?: boolean;
};

/** The "Cursive" logo + name lockup — always links back to Home, same as any site's header logo. */
export function Wordmark({ size = 32, onDark = false }: WordmarkProps) {
  return (
    <Link to="/" className={styles.lockup}>
      <Logo size={size} onDark={onDark} />
      <span className={`${styles.word} ${onDark ? styles.wordOnDark : ""}`} style={{ fontSize: size }}>
        Cursive
      </span>
    </Link>
  );
}
