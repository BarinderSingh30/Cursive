import { useState } from "react";
import { Link } from "react-router-dom";
import type { BoardSummary } from "@cursive/shared";
import { StickyNote, type StickyNoteColor } from "../ui/StickyNote.js";
import { Modal } from "../ui/Modal.js";
import { Button } from "../ui/Button.js";
import { ShapeThumbnail } from "../ui/ShapeThumbnail.js";
import styles from "./BoardCard.module.css";

const NOTE_COLORS: StickyNoteColor[] = ["yellow", "pink", "mint", "blue"];

function relativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "created today";
  if (days === 1) return "created yesterday";
  return `created ${days}d ago`;
}

interface Props {
  board: BoardSummary;
  /** Position in the list being rendered — cycling colors by position (rather than hashing each board's id independently) guarantees neighbors never repeat a color, however many boards there are. */
  index: number;
  onDelete: (boardId: string) => void;
}

export function BoardCard({ board, index, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = () => {
    onDelete(board.id);
    setConfirmOpen(false);
  };

  return (
    <StickyNote color={NOTE_COLORS[index % NOTE_COLORS.length]} square className={styles.card}>
      <Link to={`/board/${board.id}`} className={styles.link}>
        <div className={styles.thumbnail}>
          <ShapeThumbnail shapes={board.thumbnailShapes} />
        </div>
        <div className={styles.body}>
          <p className={styles.title}>{board.name}</p>
          <p className={styles.meta}>
            {relativeDate(board.createdAt)} · {board.role}
          </p>
        </div>
      </Link>

      {board.role === "owner" && (
        <>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Board options"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className={styles.menu}>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmOpen(true);
                }}
              >
                Delete
              </button>
            </div>
          )}
        </>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete board">
        <p className={styles.confirmText}>Delete "{board.name}"? This can't be undone.</p>
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </StickyNote>
  );
}
