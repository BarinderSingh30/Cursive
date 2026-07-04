import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { createHocuspocusProvider } from "./hocuspocusProvider.js";

export function useYjsDocument(roomId: string) {
  const doc = useMemo(() => new Y.Doc(), [roomId]);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);

  useEffect(() => {
    const nextProvider = createHocuspocusProvider(roomId, doc);
    setProvider(nextProvider);

    return () => {
      // Only tear down the socket connection here, not the Y.Doc itself —
      // React 18 StrictMode runs this cleanup and then re-runs the effect
      // once in development, and a destroyed Y.Doc can't be reused.
      nextProvider.destroy();
    };
  }, [roomId, doc]);

  return { doc, provider };
}
