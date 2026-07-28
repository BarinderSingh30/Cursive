import styles from "./UnreadDot.module.css";

interface Props {
  show: boolean;
}

export function UnreadDot({ show }: Props) {
  if (!show) return null;

  return <span className={styles.dot} />;
}
