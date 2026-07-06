interface Props {
  show: boolean;
}

export function UnreadDot({ show }: Props) {
  if (!show) return null;

  return (
    <span
      style={{
        position: "absolute",
        top: -2,
        right: -8,
        background: "#e03131",
        borderRadius: "50%",
        width: 8,
        height: 8,
      }}
    />
  );
}
