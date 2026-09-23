import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  File,
  FileText,
  FolderOpen,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAsyncAction } from "../../hooks/use-async-action";
import { EXPORT_STAGES, runExport } from "../../lib/export-runner";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../state/context";
import { initialExportState } from "../../state/reducer";
import { exportBlocker, warningCount } from "../../state/selectors";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Toggle } from "../ui/Toggle";

function FormatOption({
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`h-full w-full cursor-pointer rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none sm:p-5 ${
        selected
          ? "border-teal-600 bg-teal-50"
          : "border-petrol-950/8 hover:border-petrol-950/12 hover:bg-mint-50 bg-white"
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            selected ? "bg-white text-teal-700" : "bg-mint-50 text-petrol-600"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-petrol-950 text-sm font-semibold">{label}</div>
          <div className="text-petrol-600 mt-1 text-[13px] leading-5">{description}</div>
        </div>
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-white ${
            selected ? "border-teal-600" : "border-petrol-950/20"
          }`}
        >
          {selected && <div className="h-2.5 w-2.5 rounded-full bg-teal-600" />}
        </div>
      </div>
    </button>
  );
}

function StageRow({ label, status }: { label: string; status: "pending" | "active" | "completed" }) {
  return (
    <div
      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 ${status === "active" ? "bg-teal-50" : ""}`}
    >
      {status === "completed" ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
          <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : status === "active" ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-teal-700 motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="border-petrol-950/20 h-4 w-4 rounded-full border-2" />
        </span>
      )}
      <span
        className={`text-sm ${
          status === "completed"
            ? "text-petrol-700"
            : status === "active"
              ? "text-petrol-950 font-semibold"
              : "text-petrol-600/70"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath;
}

export function ExportPanel() {
  const { state, dispatch, actions } = useApp();
  const exportState = state.exportState;
  const summary = state.collection.summary;
  const blocker = exportBlocker(state);
  const warnings = warningCount(state);
  const fileAction = useAsyncAction();
  const patch = (value: Partial<typeof exportState>) => dispatch({ type: "export", patch: value });

  const start = () =>
    void runExport(
      dispatch,
      { format: exportState.format, includeEvidence: exportState.includeEvidence },
      () => void actions.refreshLicense(),
    );

  if (exportState.phase === "running") {
    const current = EXPORT_STAGES[exportState.stage];
    return (
      <Card className="animate-fade-in">
        <div className="space-y-7 py-2">
          <div className="text-center" role="status" aria-live="polite">
            <p className="text-petrol-950 text-6xl font-semibold tracking-[-0.05em] tabular-nums">
              {exportState.percent}
              <span className="text-petrol-600 ml-1 align-super text-2xl font-semibold">%</span>
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-teal-700">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span className="text-petrol-950 text-sm font-semibold">{current?.label}</span>
            </div>
            <p className="text-petrol-600 mt-1 text-xs">
              Step {Math.min(exportState.stage + 1, EXPORT_STAGES.length)} of {EXPORT_STAGES.length}
              {exportState.stage === 4 ? ", choose where to save the file" : ""}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={exportState.percent}
            className="bg-mint-100 h-2 w-full overflow-hidden rounded-full"
          >
            <div
              className="h-2 rounded-full bg-teal-600 transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${exportState.percent}%` }}
            />
          </div>
          <div className="border-petrol-950/6 bg-surface space-y-1 rounded-2xl border p-3">
            {EXPORT_STAGES.map((stage, index) => (
              <StageRow
                key={stage.label}
                label={stage.label}
                status={index < exportState.stage ? "completed" : index === exportState.stage ? "active" : "pending"}
              />
            ))}
          </div>
          <p className="text-petrol-600 text-center text-xs">
            You can keep browsing while the document is prepared. Generating a large document can briefly pause the window.
          </p>
        </div>
      </Card>
    );
  }

  if (exportState.phase === "done" && exportState.savedPath) {
    const hasWarnings = exportState.warnings > 0;
    return (
      <Card className="animate-fade-in">
        <div className="py-4 text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${hasWarnings ? "bg-amber-50" : "bg-teal-50"}`}
          >
            {hasWarnings ? (
              <AlertCircle className="h-8 w-8 text-amber-600" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-8 w-8 text-teal-700" aria-hidden="true" />
            )}
          </div>
          <h2 className="text-petrol-950 text-xl font-semibold tracking-[-0.02em]" role="status">
            {hasWarnings ? "Export saved with notes" : "Export complete"}
          </h2>
          <p className="text-petrol-600 mx-auto mt-2 max-w-md text-sm leading-6">
            {hasWarnings
              ? `${exportState.warnings} ${exportState.warnings === 1 ? "item is" : "items are"} marked as partial or unavailable in the document.`
              : "Your documentation was saved."}
          </p>
          <div className="border-petrol-950/8 bg-surface mx-auto mt-5 flex max-w-lg items-center gap-3 rounded-2xl border p-3.5 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
              {exportState.savedFormat === "docx" ? <File className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-petrol-950 truncate text-sm font-semibold">{fileName(exportState.savedPath)}</p>
              <p className="text-petrol-600 selectable truncate text-xs" title={exportState.savedPath}>
                {exportState.savedPath}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button
              icon={FileText}
              loading={fileAction.busy === "open"}
              onClick={() => void fileAction.run("open", () => ipc.openLastFile(exportState.savedPath))}
            >
              Open file
            </Button>
            <Button
              variant="secondary"
              icon={FolderOpen}
              onClick={() => void fileAction.run("show", () => ipc.showLastFileInFolder(exportState.savedPath))}
            >
              {navigator.userAgent.includes("Mac OS X") ? "Show in Finder" : "Show in folder"}
            </Button>
            <Button variant="ghost" icon={RotateCcw} onClick={() => dispatch({ type: "export", patch: { ...initialExportState, format: exportState.format, includeEvidence: exportState.includeEvidence } })}>
              Export again
            </Button>
          </div>
          {fileAction.error && (
            <Alert tone="danger" className="mx-auto mt-4 max-w-lg text-left">
              {fileAction.error}
            </Alert>
          )}
        </div>
      </Card>
    );
  }

  const estimate = summary?.pdfEstimate;
  const pages = estimate
    ? exportState.includeEvidence
      ? estimate.pages
      : estimate.pagesWithoutEvidence
    : null;

  return (
    <Card padded={false} className="animate-fade-in">
      <div className="space-y-6 p-5 sm:p-6">
        {exportState.phase === "error" && exportState.error && (
          <Alert tone="danger" title="Export failed">
            {exportState.error}
          </Alert>
        )}
        {exportState.notice && <Alert tone="info">{exportState.notice}</Alert>}
        {warnings > 0 && (
          <Alert tone="warning">
            This document will include {warnings} collection {warnings === 1 ? "warning" : "warnings"}. Partial or unavailable data is identified in the export.
          </Alert>
        )}
        <div>
          <p className="text-petrol-800 mb-3 text-[13px] font-semibold" id="export-format-label">
            Format
          </p>
          <div role="radiogroup" aria-labelledby="export-format-label" className="grid gap-3 @2xl:grid-cols-2">
            <FormatOption
              label="PDF report"
              description="Complete documentation with every policy and setting, ready to share."
              icon={<FileText className="h-5 w-5" />}
              selected={exportState.format === "pdf"}
              onClick={() => patch({ format: "pdf" })}
            />
            <FormatOption
              label="Word document (.docx)"
              description="Editable document for your own notes and branding."
              icon={<File className="h-5 w-5" />}
              selected={exportState.format === "docx"}
              onClick={() => patch({ format: "docx" })}
            />
          </div>
        </div>
        <div>
          <p className="text-petrol-800 mb-3 text-[13px] font-semibold">Document content</p>
          <Toggle
            checked={exportState.includeEvidence}
            onChange={(checked) => patch({ includeEvidence: checked })}
            label="Include compliance evidence preview"
            description="Adds the framework to control evidence mapping. Turn off to export only the configuration details."
          />
        </div>
        {pages !== null && exportState.format === "pdf" && estimate && (
          estimate.isLarge ? (
            <Alert tone="warning" title={`Large document, about ${pages.toLocaleString()} pages`}>
              Generating can take a few minutes and the window may pause briefly. For very large tenants the Word document is quicker to create and easier to work with.
              {exportState.includeEvidence && estimate.pages - estimate.pagesWithoutEvidence >= 20
                ? ` Turning off compliance evidence saves about ${(estimate.pages - estimate.pagesWithoutEvidence).toLocaleString()} pages.`
                : ""}
            </Alert>
          ) : (
            <p className="text-petrol-600 text-xs">Estimated length: about {pages.toLocaleString()} pages.</p>
          )
        )}
      </div>
      <div className="border-petrol-950/6 bg-surface flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
        <p className={`text-xs ${blocker ? "text-amber-800" : "text-petrol-600"}`}>
          {blocker ??
            `${summary?.totalConfigurations.toLocaleString() ?? 0} configurations from the last collection.`}
        </p>
        <Button icon={Download} disabled={Boolean(blocker)} disabledReason={blocker} onClick={start}>
          {exportState.phase === "error" ? "Try again" : "Start export"}
        </Button>
      </div>
    </Card>
  );
}
