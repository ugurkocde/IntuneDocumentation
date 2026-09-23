import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Download,
  File,
  FileText,
  FolderOpen,
  ListChecks,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MAX_SCOPE_ITEMS } from "../../../shared/export-scope";
import type { PdfEstimate } from "../../../shared/ipc-types";
import { useAsyncAction } from "../../hooks/use-async-action";
import { EXPORT_STAGES, runExport } from "../../lib/export-runner";
import { selectionTarget, TENANT_TARGET } from "../../lib/export-targets";
import { ipc } from "../../lib/ipc";
import { familyMeta } from "../../lib/section-catalog";
import { useApp } from "../../state/context";
import { initialExportState } from "../../state/reducer";
import { exportBlocker, warningCount } from "../../state/selectors";
import type { SelectedItem } from "../../state/types";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

// "Ring 1, Ring 2 and 3 more"
function namesPreview(items: SelectedItem[]): string {
  const names = items.slice(0, 2).map((item) => item.name);
  const rest = items.length - names.length;
  if (rest <= 0) return names.join(" and ");
  return `${names.join(", ")} and ${rest.toLocaleString()} more`;
}

// The PDF length of the selected items, estimated in main without Graph
// calls. Null while loading or when no selection is exported.
function useSelectionEstimate(items: SelectedItem[] | null): PdfEstimate | null {
  const [estimate, setEstimate] = useState<PdfEstimate | null>(null);
  const key = items?.map((item) => `${item.sectionKey}\n${item.itemId}`).join("\n") ?? "";
  useEffect(() => {
    setEstimate(null);
    if (!items?.length || items.length > MAX_SCOPE_ITEMS) return;
    let cancelled = false;
    ipc
      .estimateExport({ items: items.map(({ sectionKey, itemId }) => ({ sectionKey, itemId })) })
      .then((result) => {
        if (!cancelled) setEstimate(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // The key stands for the items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return estimate;
}

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
  const selected = useMemo(() => Object.values(state.selection), [state.selection]);
  const exportsSelection = selected.length > 0 && exportState.scope === "selection";
  const selectionEstimate = useSelectionEstimate(
    exportsSelection && exportState.phase !== "running" ? selected : null,
  );
  const blocker =
    exportBlocker(state) ??
    (exportsSelection && selected.length > MAX_SCOPE_ITEMS
      ? `Select up to ${MAX_SCOPE_ITEMS.toLocaleString()} configurations, or export the whole tenant.`
      : null);
  const warnings = warningCount(state);
  const fileAction = useAsyncAction();
  const patch = (value: Partial<typeof exportState>) => dispatch({ type: "export", patch: value });

  const start = () =>
    void runExport(
      dispatch,
      {
        format: exportState.format,
        target: exportsSelection ? selectionTarget(selected) : TENANT_TARGET,
      },
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
    const returnFamily = familyMeta(exportState.returnFamilyKey);
    const resetPatch = {
      ...initialExportState,
      format: exportState.format,
      scope: selected.length > 0 ? ("selection" as const) : ("tenant" as const),
    };
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
              : exportState.label
                ? `The documentation for ${exportState.label} was saved.`
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
            {returnFamily ? (
              <Button
                variant="ghost"
                icon={ArrowLeft}
                onClick={() => {
                  dispatch({ type: "export", patch: resetPatch });
                  actions.navigate("section", exportState.returnFamilyKey);
                }}
              >
                Back to {returnFamily.label}
              </Button>
            ) : (
              <Button variant="ghost" icon={RotateCcw} onClick={() => dispatch({ type: "export", patch: resetPatch })}>
                Export again
              </Button>
            )}
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

  const estimate = exportsSelection ? selectionEstimate : (summary?.pdfEstimate ?? null);
  const total = summary?.totalConfigurations ?? 0;

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
        {selected.length > 0 && (
          <div>
            <p className="text-petrol-800 mb-3 text-[13px] font-semibold" id="export-scope-label">
              What to export
            </p>
            <div role="radiogroup" aria-labelledby="export-scope-label" className="grid gap-3 @2xl:grid-cols-2">
              <FormatOption
                label="Whole tenant"
                description={`All ${total.toLocaleString()} configurations from the last collection.`}
                icon={<Building2 className="h-5 w-5" />}
                selected={!exportsSelection}
                onClick={() => patch({ scope: "tenant" })}
              />
              <FormatOption
                label={`Only selected items (${selected.length.toLocaleString()})`}
                description={namesPreview(selected)}
                icon={<ListChecks className="h-5 w-5" />}
                selected={exportsSelection}
                onClick={() => patch({ scope: "selection" })}
              />
            </div>
          </div>
        )}
        <div>
          <p className="text-petrol-800 mb-3 text-[13px] font-semibold" id="export-format-label">
            Format
          </p>
          <div role="radiogroup" aria-labelledby="export-format-label" className="grid gap-3 @2xl:grid-cols-2">
            <FormatOption
              label="PDF report"
              description={
                exportsSelection
                  ? "Every setting and assignment of the selected configurations, ready to share."
                  : "Complete documentation with every policy and setting, ready to share."
              }
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
        <div className="border-petrol-950/8 bg-surface flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-petrol-950 text-sm font-semibold">Configuration details and assignments only</p>
            <p className="text-petrol-600 mt-0.5 text-[13px] leading-5">
              Compliance evidence is not part of this document. For audit evidence per framework, use the Compliance Evidence screen.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => actions.navigate("compliance")}>
            Open Compliance Evidence
          </Button>
        </div>
        {estimate && exportState.format === "pdf" && (
          estimate.isLarge ? (
            <Alert tone="warning" title={`Large document, about ${estimate.pages.toLocaleString()} pages`}>
              Generating can take a few minutes and the window may pause briefly. For very large tenants the Word document is quicker to create and easier to work with.
            </Alert>
          ) : (
            <p className="text-petrol-600 text-xs">
              Estimated length: about {estimate.pages.toLocaleString()} {estimate.pages === 1 ? "page" : "pages"}.
            </p>
          )
        )}
      </div>
      <div className="border-petrol-950/6 bg-surface flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
        <p className={`text-xs ${blocker ? "text-amber-800" : "text-petrol-600"}`}>
          {blocker ??
            (exportsSelection
              ? `${selected.length.toLocaleString()} selected ${selected.length === 1 ? "configuration" : "configurations"}.`
              : `${total.toLocaleString()} configurations from the last collection.`)}
        </p>
        <Button icon={Download} disabled={Boolean(blocker)} disabledReason={blocker} onClick={start}>
          {exportState.phase === "error" ? "Try again" : "Start export"}
        </Button>
      </div>
    </Card>
  );
}
