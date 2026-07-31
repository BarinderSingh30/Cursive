import { useState } from "react";
import type { Shape } from "@cursive/shared";
import { buildLayerRows, labelForShape } from "./layerRows.js";
import styles from "./LayersPanel.module.css";

interface Props {
  shapes: Shape[];
  selectedIds: string[];
  hiddenIds: ReadonlySet<string>;
  onSelectRow: (shapeIds: string[], shiftKey: boolean) => void;
  onToggleLocked: (shapeIds: string[], locked: boolean) => void;
  onToggleHidden: (shapeIds: string[]) => void;
  onReorder: (rowKey: string, targetIndex: number) => void;
  onGroup: () => void;
  onUngroup: () => void;
  canGroup: boolean;
  canUngroup: boolean;
}

export function LayersPanel({
  shapes,
  selectedIds,
  hiddenIds,
  onSelectRow,
  onToggleLocked,
  onToggleHidden,
  onReorder,
  onGroup,
  onUngroup,
  canGroup,
  canUngroup,
}: Props) {
  const rows = buildLayerRows(shapes);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleExpanded = (rowKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Layers</span>
        <div className={styles.actions}>
          <button type="button" disabled={!canGroup} onClick={onGroup} className={styles.actionButton}>
            Group
          </button>
          <button type="button" disabled={!canUngroup} onClick={onUngroup} className={styles.actionButton}>
            Ungroup
          </button>
        </div>
      </div>
      <ul className={styles.list}>
        {rows.map((row, index) => {
          const isSelected = row.shapeIds.some((id) => selectedIds.includes(id));
          const isHidden = row.shapeIds.every((id) => hiddenIds.has(id));
          const isExpanded = row.kind === "group" && expandedGroups.has(row.key);
          return (
            <li key={row.key}>
              <div
                className={`${styles.row} ${isSelected ? styles.rowSelected : ""} ${isHidden ? styles.rowHidden : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", row.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromKey = e.dataTransfer.getData("text/plain");
                  if (fromKey && fromKey !== row.key) onReorder(fromKey, index);
                }}
                onClick={(e) => onSelectRow(row.shapeIds, e.shiftKey)}
              >
                {row.kind === "group" && (
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={isExpanded ? "Collapse group" : "Expand group"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(row.key);
                    }}
                  >
                    {isExpanded ? "▾" : "▸"}
                  </button>
                )}
                <span className={styles.label}>{row.label}</span>
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Move backward"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorder(row.key, index + 1);
                    }}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Move forward"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReorder(row.key, index - 1);
                    }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={row.locked ? "Unlock" : "Lock"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLocked(row.shapeIds, !row.locked);
                    }}
                  >
                    {row.locked ? "🔒" : "🔓"}
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={isHidden ? "Show" : "Hide"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHidden(row.shapeIds);
                    }}
                  >
                    {isHidden ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <ul className={styles.memberList}>
                  {row.shapeIds.map((memberId) => {
                    const member = shapes.find((s) => s.id === memberId);
                    if (!member) return null;
                    const memberSelected = selectedIds.includes(memberId);
                    const memberHidden = hiddenIds.has(memberId);
                    return (
                      <li
                        key={memberId}
                        className={`${styles.memberRow} ${memberSelected ? styles.rowSelected : ""} ${memberHidden ? styles.rowHidden : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRow([memberId], e.shiftKey);
                        }}
                      >
                        <span className={styles.label}>{labelForShape(member)}</span>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={member.locked ? "Unlock" : "Lock"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleLocked([memberId], !member.locked);
                            }}
                          >
                            {member.locked ? "🔒" : "🔓"}
                          </button>
                          <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={memberHidden ? "Show" : "Hide"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleHidden([memberId]);
                            }}
                          >
                            {memberHidden ? "🙈" : "👁"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
