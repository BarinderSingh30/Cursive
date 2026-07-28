import { Link } from "react-router-dom";
import type { HomeBoard } from "@cursive/shared";
import { StickyNote, type StickyNoteColor } from "../ui/StickyNote.js";
import { ShapeThumbnail } from "../ui/ShapeThumbnail.js";
import styles from "./BoardListingCard.module.css";

const NOTE_COLORS: StickyNoteColor[] = ["yellow", "pink", "mint", "blue"];

interface Props {
  board: HomeBoard;
  /** Position in the list being rendered — cycling colors by position (rather than hashing each board's id independently) guarantees neighbors never repeat a color, however many boards there are. */
  index: number;
}

export function BoardListingCard({ board, index }: Props) {
  return (
    <StickyNote color={NOTE_COLORS[index % NOTE_COLORS.length]} square>
      <Link to={`/watch/${board.shareToken}`} className={styles.card}>
        <div className={styles.thumbnail}>
          <ShapeThumbnail shapes={board.thumbnailShapes} />
        </div>
        <div className={styles.body}>
          <div className={styles.titleRow}>
            <p className={styles.title}>{board.name}</p>
            {board.liveViewerCount > 0 && <span className={styles.liveBadge}>{board.liveViewerCount} watching</span>}
          </div>
          <p className={styles.meta}>
            by {board.ownerName} · {board.totalViews} {board.totalViews === 1 ? "view" : "views"}
          </p>
        </div>
      </Link>
    </StickyNote>
  );
}
