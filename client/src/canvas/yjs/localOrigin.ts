/**
 * A shared tag applied to every locally-initiated Yjs transaction in this
 * tab. Y.UndoManager's trackedOrigins uses it to tell "my own edits" apart
 * from a remote peer's — without it, undo would have no way to distinguish
 * the two and could undo a collaborator's stroke out from under them.
 */
export const LOCAL_ORIGIN = Symbol("cursive-local-origin");
