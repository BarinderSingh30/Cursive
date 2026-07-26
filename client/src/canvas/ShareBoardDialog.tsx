import { useRef } from "react";
import { useBoardShare } from "./useBoardShare.js";

export function ShareBoardDialog({ boardId }: { boardId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { enabled, token, loading, enable, disable, regenerate } = useBoardShare(boardId);
  const url = token ? `${window.location.origin}/watch/${token}` : null;

  return (
    <>
      <button type="button" onClick={() => dialogRef.current?.showModal()}>
        Share
      </button>
      <dialog ref={dialogRef} style={{ borderRadius: 8, border: "1px solid #e0e0e0", padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 320 }}>
          <h3 style={{ margin: 0 }}>Public watch link</h3>
          {loading ? (
            <p style={{ margin: 0, color: "#868e96" }}>Loading…</p>
          ) : enabled && url ? (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#868e96" }}>
                Anyone with this link can watch this board's canvas and call, and read chat. Logged-in visitors can
                also chat.
              </p>
              <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ width: "100%" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={regenerate}>
                  Regenerate link
                </button>
                <button type="button" onClick={disable}>
                  Turn off
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: "#868e96" }}>
                Turn this on to get a public link anyone can use to watch this board, no account required.
              </p>
              <button type="button" onClick={enable}>
                Enable public link
              </button>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => dialogRef.current?.close()}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
