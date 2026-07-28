import { useState } from "react";
import { Link } from "react-router-dom";
import type { BoardRole } from "@cursive/shared";
import { signOut, useSession } from "../auth/authClient.js";
import { useFriends } from "../friends/useFriends.js";
import { useHasUnreadMessages } from "../chat/useHasUnreadMessages.js";
import { useBoards } from "./useBoards.js";
import { BoardCard } from "./BoardCard.js";
import { CreateBoardDialog } from "./CreateBoardDialog.js";
import { NotificationsButton } from "./NotificationsButton.js";
import { UnreadDot } from "./UnreadDot.js";
import { PaperBar, PaperBarNavLink } from "../ui/PaperBar.js";
import { Wordmark } from "../ui/Wordmark.js";
import { Button } from "../ui/Button.js";
import { Avatar } from "../ui/Avatar.js";
import { SegmentedToggle } from "../ui/SegmentedToggle.js";
import styles from "./DashboardPage.module.css";

const TABS: { role: BoardRole; label: string; emptyMessage: string }[] = [
  { role: "owner", label: "Mine", emptyMessage: "nothing pinned yet — start your first board" },
  { role: "collaborator", label: "Collaborating", emptyMessage: "No boards where you're a collaborator yet." },
  { role: "viewer", label: "Watching", emptyMessage: "No boards where you're a viewer yet." },
];

export function DashboardPage() {
  const { data: session } = useSession();
  const { boards, loading, createBoard, deleteBoard, refresh: refreshBoards } = useBoards();
  const { requests } = useFriends();
  const hasUnreadMessages = useHasUnreadMessages();
  const [activeTab, setActiveTab] = useState<BoardRole>("owner");

  const activeBoards = boards.filter((b) => b.role === activeTab);
  const activeTabInfo = TABS.find((t) => t.role === activeTab)!;

  const tabOptions = TABS.map((tab) => {
    const count = boards.filter((b) => b.role === tab.role).length;
    return { value: tab.role, label: count > 0 ? `${tab.label} (${count})` : tab.label };
  });

  return (
    <div className={styles.page}>
      <PaperBar
        left={<Wordmark size={28} />}
        right={
          <div className={styles.navGroup}>
            <PaperBarNavLink to="/dashboard">Boards</PaperBarNavLink>
            <div className={styles.navLinkWrap}>
              <PaperBarNavLink to="/friends">
                Friends
                <UnreadDot show={requests.length > 0} />
              </PaperBarNavLink>
            </div>
            <div className={styles.navLinkWrap}>
              <PaperBarNavLink to="/messages">
                Messages
                <UnreadDot show={hasUnreadMessages} />
              </PaperBarNavLink>
            </div>
            <NotificationsButton onAccepted={refreshBoards} />
            <Avatar name={session?.user.name || session?.user.email || "?"} color="#1971c2" size={30} />
            <span className={styles.userName}>{session?.user.name || session?.user.email}</span>
            <Link to="/" className={styles.navLinkWrap}>
              <Button variant="ghost">Home</Button>
            </Link>
            <Button variant="ghost" onClick={() => signOut().then(() => (window.location.href = "/login"))}>
              Log out
            </Button>
          </div>
        }
      />

      <div className={styles.heroRow}>
        <h1 className={styles.heading}>Your boards</h1>
        <div className={styles.filterChip}>
          <SegmentedToggle options={tabOptions} value={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {activeTab === "owner" && (
        <div className={styles.createRow}>
          <CreateBoardDialog onCreate={createBoard} />
        </div>
      )}

      {loading ? (
        <div className={styles.statusCard}>Loading…</div>
      ) : activeBoards.length === 0 && activeTab !== "owner" ? (
        <div className={styles.statusCard}>{activeTabInfo.emptyMessage}</div>
      ) : activeBoards.length === 0 ? (
        <div className={styles.emptySlot}>
          <p className={styles.emptySlotText}>{activeTabInfo.emptyMessage}</p>
          <CreateBoardDialog onCreate={createBoard} />
        </div>
      ) : (
        <div className={styles.grid}>
          {activeBoards.map((board, index) => (
            <BoardCard key={board.id} board={board} index={index} onDelete={deleteBoard} />
          ))}
        </div>
      )}
    </div>
  );
}
