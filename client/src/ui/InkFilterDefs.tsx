/**
 * Defines the "ink" hand-drawn-wobble SVG filter once, at app root, so any
 * <Logo> anywhere in the tree can reference it via filter="url(#ink)".
 * Rendered off-screen — it contributes no visible pixels of its own.
 */
export function InkFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="ink" x="-12%" y="-12%" width="124%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
