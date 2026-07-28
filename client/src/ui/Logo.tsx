const TWO_HANDS_PATH =
  "M28 112 C16 62 58 24 104 32 C144 40 160 78 142 108 C152 72 126 48 96 46 C58 44 34 70 42 114 Z";

export type LogoProps = {
  /** Rendered width/height in px. The hand-drawn wobble filter is dropped below 40px — it destroys the silhouette at favicon sizes. */
  size?: number;
  /** Use the light-on-dark stroke colors for cork/dark surfaces instead of the default. */
  onDark?: boolean;
};

export function Logo({ size = 32, onDark = false }: LogoProps) {
  const useFilter = size >= 40;
  const indigo = onDark ? "#8AB6FF" : "var(--logo-indigo)";
  const coral = onDark ? "#FF9E80" : "var(--logo-coral)";

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <g filter={useFilter ? "url(#ink)" : undefined}>
        <path d={TWO_HANDS_PATH} fill={indigo} />
        <path d={TWO_HANDS_PATH} fill={coral} transform="rotate(180 80 80)" />
      </g>
    </svg>
  );
}
