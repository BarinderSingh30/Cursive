import { useState } from "react";
import { useBoardShare } from "./useBoardShare.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import styles from "./ShareBoardDialog.module.css";

export function ShareBoardDialog({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const { enabled, token, listed, loading, enable, disable, regenerate, makePublic, makePrivate } =
    useBoardShare(boardId);
  const url = token ? `${window.location.origin}/watch/${token}` : null;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Share
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Public watch link">
        <div className={styles.content}>
          {!loading && (
            <div className={styles.visibilityRow}>
              <span>{listed ? "Listed on the public Home page" : "Private — hidden from Home page"}</span>
              <Button variant="ghost" onClick={listed ? makePrivate : makePublic}>
                {listed ? "Make private" : "Make public"}
              </Button>
            </div>
          )}
          {loading ? (
            <p className={styles.muted}>Loading…</p>
          ) : enabled && url ? (
            <>
              <p className={styles.muted}>
                Anyone with this link can watch this board's canvas and call, and read chat. Logged-in visitors can
                also chat.
              </p>
              <div className={styles.linkRow}>
                <input readOnly value={url} onFocus={(e) => e.target.select()} className={styles.linkInput} />
                <Button onClick={handleCopy}>{copied ? "Copied!" : "Copy"}</Button>
              </div>
              <div className={styles.actionRow}>
                <Button variant="secondary" onClick={regenerate}>
                  Regenerate link
                </Button>
                <Button variant="ghost" onClick={disable}>
                  Turn off
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className={styles.muted}>
                Turn this on to get a public link anyone can use to watch this board, no account required.
              </p>
              <Button onClick={enable}>Enable public link</Button>
            </>
          )}
          <div className={styles.footerRow}>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
