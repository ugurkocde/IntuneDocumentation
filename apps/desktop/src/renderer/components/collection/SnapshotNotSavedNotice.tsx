import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../state/context";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

// Main reports a snapshot of a manual collection that could not be saved.
// The collection itself is usable, so this is a notice, not an error.
export function SnapshotNotSavedNotice() {
  const { actions } = useApp();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => ipc.onSnapshotNotSaved(setMessage), []);
  if (!message) return null;
  const dismiss = () => setMessage(null);
  return createPortal(
    <div className="animate-fade-in-up fixed top-6 right-6 z-[1000] w-[360px] shadow-[0_12px_48px_-12px_rgba(8,47,54,0.3)]">
      <Alert
        tone="warning"
        title="Snapshot not saved"
        className="bg-white pr-12"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              actions.navigate("history");
              dismiss();
            }}
          >
            Open History
          </Button>
        }
      >
        The collection finished and is ready to use, but it was not saved to history. {message}
      </Alert>
      <button
        type="button"
        aria-label="Dismiss snapshot notice"
        onClick={dismiss}
        className="hover:bg-mint-50 text-petrol-600 absolute top-3 right-3 grid h-9 w-9 cursor-pointer place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>,
    document.body,
  );
}
