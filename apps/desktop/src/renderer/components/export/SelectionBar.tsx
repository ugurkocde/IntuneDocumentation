import { File, FileText, X } from "lucide-react";
import { MAX_SCOPE_ITEMS } from "../../../shared/export-scope";
import { useStartExport } from "../../hooks/use-start-export";
import { selectionTarget } from "../../lib/export-targets";
import { useApp } from "../../state/context";
import { quickExportBlocker } from "../../state/selectors";
import { Button } from "../ui/Button";

// Floats at the bottom of a section screen while configurations are
// selected, in any section.
export function SelectionBar() {
  const { state, dispatch } = useApp();
  const startExport = useStartExport();
  const selected = Object.values(state.selection);
  if (selected.length === 0) return null;
  const sections = new Set(selected.map((item) => item.sectionKey)).size;
  const blocker =
    quickExportBlocker(state) ??
    (selected.length > MAX_SCOPE_ITEMS
      ? `Select up to ${MAX_SCOPE_ITEMS.toLocaleString()} configurations, or export the whole tenant.`
      : null);
  const spoken = `${selected.length} selected ${selected.length === 1 ? "configuration" : "configurations"}`;

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center pt-1" role="region" aria-label="Selection">
      <div className="border-petrol-950/10 animate-dialog-in pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border bg-white/95 p-2 pl-4 shadow-[0_16px_48px_-14px_rgba(8,47,54,0.38)] backdrop-blur">
        <p className="text-petrol-950 mr-1 text-sm font-semibold tabular-nums" aria-live="polite">
          {selected.length.toLocaleString()} selected
          {sections > 1 && (
            <span className="text-petrol-600 ml-1.5 text-xs font-medium">in {sections} sections</span>
          )}
        </p>
        <span className="bg-petrol-950/10 mx-1 hidden h-6 w-px @2xl:block" aria-hidden="true" />
        <Button
          size="sm"
          icon={FileText}
          disabled={Boolean(blocker)}
          disabledReason={blocker}
          aria-label={`Export ${spoken} as PDF`}
          onClick={() => startExport(selectionTarget(selected), "pdf")}
        >
          Export PDF
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={File}
          disabled={Boolean(blocker)}
          disabledReason={blocker}
          aria-label={`Export ${spoken} as Word document`}
          onClick={() => startExport(selectionTarget(selected), "docx")}
        >
          Export Word
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={X}
          aria-label="Clear the selection"
          onClick={() => dispatch({ type: "clearSelection" })}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
