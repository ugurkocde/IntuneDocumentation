import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";

// Whether main is running a scheduled collection right now. A manual
// collection is refused meanwhile, so Collect explains it instead.
export function useScheduledRun(): boolean {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let current = true;
    // Unlicensed or signed out: no schedule runs, so nothing to show.
    void ipc
      .historyScheduleStatus?.()
      .then((status) => {
        if (current) setRunning(status.state === "running");
      })
      .catch(() => undefined);
    const unsubscribe = ipc.onScheduleStatus?.((status) => {
      if (current) setRunning(status.state === "running");
    });
    return () => {
      current = false;
      unsubscribe?.();
    };
  }, []);
  return running;
}
