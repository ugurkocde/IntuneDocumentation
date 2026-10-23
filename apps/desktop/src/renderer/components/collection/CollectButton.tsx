import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAsyncAction } from "../../hooks/use-async-action";
import { useScheduledRun } from "../../hooks/use-scheduled-run";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../state/context";
import { collectBlocker } from "../../state/selectors";
import { formatAgo } from "../layout/Header";
import { Button } from "../ui/Button";

// Collect or refresh, with the reason shown when it cannot run.
export function CollectButton({ showMeta = true }: { showMeta?: boolean }) {
  const { state, actions } = useApp();
  const { collection } = state;
  const blocker = collectBlocker(state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const collectedAt = collection.summary?.collectedAt;
  const scheduled = useScheduledRun();
  const cancel = useAsyncAction();

  // Main refuses a manual collection while a scheduled one runs.
  if (scheduled && !collection.running) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-3">
          {showMeta && (
            <span className="text-petrol-600 text-xs" aria-live="polite">
              Scheduled collection running
            </span>
          )}
          <Button
            variant="secondary"
            icon={X}
            loading={cancel.busy === "cancel"}
            onClick={() => void cancel.run("cancel", () => ipc.collectCancel())}
          >
            Cancel scheduled collection
          </Button>
        </div>
        <p className="max-w-xs text-right text-xs text-petrol-600">
          Collect again when it has finished. The data updates on its own.
        </p>
      </div>
    );
  }

  if (collection.running) {
    return (
      <div className="flex items-center gap-3">
        {showMeta && (
          <span className="text-petrol-600 text-xs tabular-nums" aria-live="polite">
            {collection.loaded.toLocaleString()} items loaded
          </span>
        )}
        <Button
          variant="secondary"
          icon={X}
          loading={collection.cancelling}
          onClick={() => void actions.cancelCollect()}
        >
          {collection.cancelling ? "Cancelling" : "Cancel collection"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        {showMeta && (
          <span
            className="text-petrol-600 text-right text-xs tabular-nums"
            title={collectedAt ? new Date(collectedAt).toLocaleString() : undefined}
          >
            {collectedAt
              ? `Data collected ${formatAgo(collectedAt, now)}`
              : "No collection yet"}
          </span>
        )}
        <Button
          variant={collectedAt ? "secondary" : "primary"}
          icon={RefreshCw}
          disabled={Boolean(blocker)}
          disabledReason={blocker}
          onClick={() => void actions.collect()}
        >
          {collectedAt ? "Refresh data" : "Collect tenant data"}
        </Button>
      </div>
      {blocker && <p className="max-w-xs text-right text-xs text-amber-800">{blocker}</p>}
    </div>
  );
}
