import styles from "./Avatar.module.css";

export type AvatarSize = 22 | 26 | 30 | 38;

export type AvatarProps = {
  name: string;
  color: string;
  size?: AvatarSize;
  imageUrl?: string;
  /** The surface the avatar sits on, for the inner ring — defaults to paper. */
  surfaceColor?: string;
};

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function Avatar({ name, color, size = 30, imageUrl, surfaceColor = "var(--paper)" }: AvatarProps) {
  const fontSize = Math.round(size * 0.4);
  return (
    <span
      className={styles.avatar}
      style={{
        width: size,
        height: size,
        fontSize,
        background: imageUrl ? undefined : color,
        backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
        boxShadow: `0 0 0 3px ${surfaceColor}, 0 0 0 5px ${color}`,
      }}
      title={name}
    >
      {!imageUrl && initialsFor(name)}
    </span>
  );
}
