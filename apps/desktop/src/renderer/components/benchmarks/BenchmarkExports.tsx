import { CheckCircle2, FileArchive, FileJson, FileSpreadsheet, FileText, FolderOpen } from "lucide-react";
import { useCallback, useState } from "react";
import type { BenchmarkDraftsPreview, BenchmarkExportFormat } from "../../../shared/ipc-types";
import { useAsyncAction } from "../../hooks/use-async-action";
import { ipc, isMac } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DisclosureSummary } from "../ui/DisclosureSummary";

const FORMAT_LABELS: Record<BenchmarkExportFormat, string> = {
  pdf: "Readiness PDF",
  csv: "CSV",
  json: "JSON",
  drafts: "Draft policies",
};

// The points the user accepts before draft policies are saved, as for the
// draft fix pack of Compliance Evidence.
export const DRAFT_WARNINGS = [
  "Every policy is a draft and unassigned. It has no effect on any device or user until you assign it.",
  "Drafts cover settings the complete collection shows as missing. A setting can still be delivered by Group Policy, a security baseline or another profile, and a duplicate can cause conflicts.",
  "Settings that differ get no draft: change the existing policy named in the review instead.",
  "Review every setting before you import a policy, and do not import blindly. Assign it to a pilot group first and widen the assignment after testing.",
] as const;

function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

// Saves one export of the last comparison held in main and remembers where.
export function useBenchmarkExport() {
  const action = useAsyncAction();
  const [saved, setSaved] = useState<{ format: BenchmarkExportFormat; path: string } | null>(null);
  const run = (format: BenchmarkExportFormat, before?: () => void) =>
    void action.run(format, async () => {
      setSaved(null);
      before?.();
      const path = await ipc.benchmarksExport(format === "drafts" ? { format, confirmed: true } : { format });
      if (path) setSaved({ format, path });
      else action.setMessage("Save cancelled. Nothing was saved.");
    });
  return { ...action, saved, setSaved, run };
}

// Where an export was saved, with Open file and Show in folder.
export function SavedFile({ saved }: { saved: { format: BenchmarkExportFormat; path: string } }) {
  const fileAction = useAsyncAction();
  return (
    <div className="animate-fade-in mt-4" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-teal-600/20 bg-teal-50 p-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-petrol-950 truncate text-xs font-semibold">
            {FORMAT_LABELS[saved.format]} saved: {fileName(saved.path)}
          </p>
          <p className="text-petrol-600 selectable truncate text-[11px]" title={saved.path}>
            {saved.path}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={FileText}
          loading={fileAction.busy === "open"}
          onClick={() => void fileAction.run("open", () => ipc.openLastFile(saved.path))}
        >
          Open file
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={FolderOpen}
          onClick={() => void fileAction.run("show", () => ipc.showLastFileInFolder(saved.path))}
        >
          {isMac ? "Show in Finder" : "Show in folder"}
        </Button>
      </div>
      {fileAction.error && (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {fileAction.error}
        </p>
      )}
    </div>
  );
}

// Readiness PDF, CSV and JSON of ids and statuses, and draft policies for
// missing settings, all from the last comparison held in main.
export function BenchmarkExports({
  blocker,
  missing,
  complete,
}: {
  // Why no export can run, or null.
  blocker: string | null;
  // Missing settings in the comparison; drafts need at least one.
  missing: number;
  // Whether the compared collection was complete.
  complete: boolean;
}) {
  const action = useBenchmarkExport();
  const { saved, setSaved } = action;
  const previewAction = useAsyncAction();
  // The drafts the ZIP would hold, read from main when Drafts is chosen.
  const [preview, setPreview] = useState<BenchmarkDraftsPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const closeConfirm = useCallback(() => setConfirming(false), []);
  const busy = (action.busy ?? previewAction.busy) as BenchmarkExportFormat | "preview" | null;
  const actionBlocker = blocker ?? (busy ? "Available when the current export finishes." : null);
  const draftsBlocker =
    actionBlocker ??
    (!complete
      ? "Drafts need a complete collection. Collect again when every Settings Catalog policy was read."
      : missing === 0
        ? "No setting is missing, so there is nothing to draft."
        : null);

  const previewDrafts = () =>
    void previewAction.run("preview", async () => {
      setSaved(null);
      setPreview(null);
      action.reset();
      const result = await ipc.benchmarksPreviewDrafts();
      setPreview(result);
      if (result.draftPolicies > 0) setConfirming(true);
      else previewAction.setMessage("No draft policy can be generated for the missing settings. Nothing was saved.");
    });

  const notGenerated = preview && preview.notGenerated.length > 0 && (
    <details className="border-petrol-950/6 mt-3 rounded-xl border bg-slate-50/60 px-3 py-2.5 text-xs text-slate-700">
      <DisclosureSummary className="font-semibold hover:text-teal-700">
        Not generated ({preview.notGenerated.length.toLocaleString()})
      </DisclosureSummary>
      <ul
        className="divide-petrol-950/6 mt-2 max-h-60 divide-y overflow-y-auto pr-1"
        aria-label="Settings without a draft"
      >
        {preview.notGenerated.map((gap, index) => (
          <li key={`${gap.settingId}|${index}`} className="py-2 leading-5 first:pt-0 last:pb-0">
            <p className="text-petrol-950 font-mono text-[11px] font-semibold break-all">{gap.settingId}</p>
            <p className="text-petrol-600 mt-0.5 break-words">{gap.reason}</p>
          </li>
        ))}
      </ul>
    </details>
  );

  const run = (format: BenchmarkExportFormat) => action.run(format, previewAction.reset);

  const button = (
    format: Exclude<BenchmarkExportFormat, "drafts">,
    icon: typeof FileText,
    label: string,
    primary = false,
  ) => (
    <Button
      size="sm"
      variant={primary ? "primary" : "secondary"}
      icon={icon}
      loading={busy === format}
      disabled={Boolean(actionBlocker)}
      disabledReason={busy === format ? null : actionBlocker}
      onClick={() => run(format)}
    >
      {label}
    </Button>
  );

  return (
    <section
      aria-labelledby="benchmark-exports-title"
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <p className="text-petrol-600 text-[11px] font-bold tracking-[0.14em] uppercase">Exports</p>
      <h2 id="benchmark-exports-title" className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
        Readiness files and draft policies
      </h2>
      <p className="text-petrol-600 mt-0.5 text-xs">Uses the last comparison shown above.</p>
      {blocker && <p className="text-petrol-700 mt-3 text-xs">{blocker}</p>}

      <div className="divide-petrol-950/6 mt-4 divide-y">
        <div className="flex flex-wrap items-start gap-4 pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <FileText className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h3 className="text-petrol-950 text-sm font-semibold">Readiness comparison</h3>
            <p className="text-petrol-600 mt-0.5 max-w-2xl text-xs leading-5">
              The PDF carries the readiness line and the manual notice on every page. CSV and JSON hold the ids,
              results and counts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {button("pdf", FileText, "PDF (.pdf)", true)}
            {button("csv", FileSpreadsheet, "CSV (.csv)")}
            {button("json", FileJson, "JSON (.json)")}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-4 pt-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <FileArchive className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h3 className="text-petrol-950 text-sm font-semibold">Draft policies</h3>
            <p className="text-petrol-600 mt-0.5 max-w-2xl text-xs leading-5">
              Draft, unassigned Settings Catalog policies for missing settings, to review and import in Intune.
              Intune Documentation never writes to your tenant.
            </p>
            <p className="text-petrol-800 mt-1 text-xs font-semibold tabular-nums">
              {complete
                ? plural(missing, "missing setting", "missing settings")
                : "Not available while the collection is incomplete"}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={FileArchive}
            loading={busy === "drafts" || busy === "preview"}
            disabled={Boolean(draftsBlocker)}
            disabledReason={busy === "drafts" || busy === "preview" ? null : draftsBlocker}
            onClick={previewDrafts}
          >
            Drafts (.zip)
          </Button>
        </div>
      </div>

      {saved && <SavedFile saved={saved} />}
      {action.error && (
        <Alert tone="danger" title="The export could not be saved" className="mt-4">
          {action.error}
        </Alert>
      )}
      {action.message && (
        <p className="text-petrol-600 mt-3 text-xs" role="status">
          {action.message}
        </p>
      )}
      {previewAction.error && (
        <Alert tone="danger" title="The draft policies could not be prepared" className="mt-4">
          {previewAction.error}
        </Alert>
      )}
      {previewAction.message && (
        <p className="text-petrol-600 mt-3 text-xs" role="status">
          {previewAction.message}
        </p>
      )}
      {previewAction.message && notGenerated}

      <ConfirmDialog
        open={confirming}
        title="Save the draft policies?"
        description={
          preview
            ? `${plural(preview.draftPolicies, "draft policy", "draft policies")} for ` +
              `${plural(preview.draftSettings, "missing setting", "missing settings")}. ` +
              "Read these points before you import any of them."
            : ""
        }
        confirmLabel="Save drafts"
        onCancel={closeConfirm}
        onConfirm={() => {
          setConfirming(false);
          run("drafts");
        }}
      >
        <ul className="text-petrol-700 mt-3 list-disc space-y-1.5 pl-4 text-xs leading-5">
          {DRAFT_WARNINGS.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
        {notGenerated}
      </ConfirmDialog>
    </section>
  );
}
