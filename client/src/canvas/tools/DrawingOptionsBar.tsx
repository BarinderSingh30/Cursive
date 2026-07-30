import { STROKE_COLORS } from "./useActiveTool.js";
import type { BrushPreset } from "./brushPresets.js";
import styles from "./DrawingOptionsBar.module.css";

interface Props {
  color: string;
  strokeWidth: number;
  opacity: number;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onOpacityChange: (opacity: number) => void;
  onApplyBrushPreset: (preset: BrushPreset) => void;
  isEraserActive: boolean;
  onSelectEraser: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const BRUSH_BUTTONS: { key: BrushPreset; label: string }[] = [
  { key: "pencil", label: "Pencil" },
  { key: "marker", label: "Marker" },
  { key: "highlighter", label: "Highlighter" },
];

export function DrawingOptionsBar({
  color,
  strokeWidth,
  opacity,
  onColorChange,
  onStrokeWidthChange,
  onOpacityChange,
  onApplyBrushPreset,
  isEraserActive,
  onSelectEraser,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  return (
    <div className={styles.row}>
      <div className={styles.colorGroup}>
        <span className={styles.label}>colour</span>
        <div className={styles.swatches}>
          {STROKE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Colour ${swatch}`}
              onClick={() => onColorChange(swatch)}
              className={`${styles.swatch} ${color === swatch ? styles.swatchActive : ""}`}
              style={{ background: swatch, color: swatch }}
            />
          ))}
          <span className={styles.colorInputWrap} title="Custom colour">
            <input
              type="color"
              aria-label="Custom colour"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className={styles.colorInput}
            />
            <span className={styles.colorInputIcon} aria-hidden="true">
              +
            </span>
          </span>
        </div>
      </div>

      <label className={styles.sliderGroup}>
        <span className={styles.label}>width</span>
        <input
          type="range"
          min={1}
          max={24}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
        />
        <span className={styles.sliderValue}>{strokeWidth}px</span>
      </label>

      <label className={styles.sliderGroup}>
        <span className={styles.label}>opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(opacity * 100)}
          onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
        />
        <span className={styles.sliderValue}>{Math.round(opacity * 100)}%</span>
      </label>

      <div className={styles.pill}>
        {BRUSH_BUTTONS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => onApplyBrushPreset(key)} className={styles.tool}>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onSelectEraser}
          className={`${styles.tool} ${isEraserActive ? styles.toolActive : ""}`}
        >
          Eraser
        </button>
      </div>

      <div className={styles.undoGroup}>
        <button type="button" onClick={onUndo} disabled={!canUndo} className={styles.tool} aria-label="Undo">
          ↶ Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} className={styles.tool} aria-label="Redo">
          ↷ Redo
        </button>
      </div>
    </div>
  );
}
