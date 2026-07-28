import styles from "./JoinCallButton.module.css";

interface Props {
  isJoined: boolean;
  othersInCallCount: number;
  onJoin: () => void;
  onLeave: () => void;
}

export function JoinCallButton({ isJoined, othersInCallCount, onJoin, onLeave }: Props) {
  if (isJoined) {
    return (
      <button type="button" onClick={onLeave} title="Leave the call" className={`${styles.button} ${styles.inCall}`}>
        <span aria-hidden="true" className={styles.dot} style={{ background: "currentColor" }} />
        In call
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onJoin}
      className={`${styles.button} ${styles.join} ${othersInCallCount > 0 ? styles.joinActive : ""}`}
    >
      <span aria-hidden="true">📹</span>
      Join call
      {othersInCallCount > 0 && <span className={styles.count}>{` · ${othersInCallCount}`}</span>}
    </button>
  );
}
