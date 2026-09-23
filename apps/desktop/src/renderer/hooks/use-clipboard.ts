import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";

// Clipboard writes go through the main process because the renderer's
// permission handler denies clipboard access.
export function useClipboard(resetMs = 1600) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(
    async (text: string) => {
      const ok = await ipc.copyText(text).catch(() => false);
      if (!ok) return false;
      setCopied(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), resetMs);
      return true;
    },
    [resetMs],
  );
  return { copied, copy };
}
