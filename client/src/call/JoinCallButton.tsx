interface Props {
  isJoined: boolean;
  othersInCallCount: number;
  onJoin: () => void;
  onLeave: () => void;
}

export function JoinCallButton({ isJoined, othersInCallCount, onJoin, onLeave }: Props) {
  if (isJoined) {
    return (
      <button type="button" onClick={onLeave}>
        In call
      </button>
    );
  }

  return (
    <button type="button" onClick={onJoin}>
      Join call{othersInCallCount > 0 ? ` · ${othersInCallCount}` : ""}
    </button>
  );
}
