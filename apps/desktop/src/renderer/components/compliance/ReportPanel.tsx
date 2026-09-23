import { Check, CheckCircle2, Download, FileText, FolderOpen, Loader2, RotateCcw } from "lucide-react";
import { useAsyncAction } from "../../hooks/use-async-action";
import { REPORT_STAGES } from "../../lib/compliance-runner";
import { ipc, isMac } from "../../lib/ipc";
import type { ComplianceReportState } from "../../state/types";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";

function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath;
}

// The per framework evidence report: a download card that turns into staged
// progress and then a done state with Open file and Show in folder.
export function ReportPanel({
  frameworkLabel,
  controlCount,
  report,
  blocker,
  onDownload,
  onReset,
}: {
  frameworkLabel: string;
  controlCount: number;
  report: ComplianceReportState;
  blocker: string | null;
  onDownload: () => void;
  onReset: () => void;
}) {
  const fileAction = useAsyncAction();

  if (report.phase === "running") {
    const stage = Math.min(report.stage, REPORT_STAGES.length - 1);
    const percent = REPORT_STAGES[stage]?.percent ?? 0;
    return (
      <section className="border-petrol-950/6 shadow-card animate-fade-in rounded-2xl border bg-white p-5 @xl:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1" role="status" aria-live="polite">
            <p className="text-petrol-950 text-sm font-semibold">Creating the {frameworkLabel} evidence report</p>
            <p className="text-petrol-600 mt-0.5 text-xs">
              Step {stage + 1} of {REPORT_STAGES.length}: {REPORT_STAGES[stage]?.label}
              {stage === REPORT_STAGES.length - 1 ? ", choose where to save the file" : ""}
            </p>
          </div>
          <span className="text-petrol-950 text-2xl font-semibold tracking-[-0.04em] tabular-nums">{percent}%</span>
        </div>
        <ProgressBar value={percent} label="Evidence report progress" className="mt-5" />
        <ol className="mt-4 grid gap-2 @2xl:grid-cols-3">
          {REPORT_STAGES.map((item, index) => {
            const status = index < stage ? "done" : index === stage ? "active" : "pending";
            return (
              <li
                key={item.label}
                className={`flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs ${
                  status === "active" ? "text-petrol-950 bg-teal-50 font-semibold" : status === "done" ? "text-petrol-700" : "text-petrol-600/70"
                }`}
              >
                {status === "done" ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-white">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                ) : status === "active" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-teal-700 motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <span className="border-petrol-950/20 h-3.5 w-3.5 rounded-full border-2" aria-hidden="true" />
                )}
                {item.label}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  if (report.phase === "done" && report.savedPath) {
    const saved = report.savedPath;
    return (
      <section className="animate-fade-in rounded-2xl border border-teal-600/20 bg-teal-50 p-5 @xl:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 basis-64" role="status" aria-live="polite">
            <p className="text-petrol-950 text-sm font-semibold">Evidence report saved</p>
            <p className="text-petrol-700 mt-0.5 truncate text-xs font-medium">{fileName(saved)}</p>
            <p className="text-petrol-600 selectable truncate text-[11px]" title={saved}>
              {saved}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={FileText}
              loading={fileAction.busy === "open"}
              onClick={() => void fileAction.run("open", () => ipc.openLastFile(saved))}
            >
              Open file
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={FolderOpen}
              onClick={() => void fileAction.run("show", () => ipc.showLastFileInFolder(saved))}
            >
              {isMac ? "Show in Finder" : "Show in folder"}
            </Button>
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={onReset}>
              Download again
            </Button>
          </div>
        </div>
        {fileAction.error && (
          <Alert tone="danger" className="mt-4">
            {fileAction.error}
          </Alert>
        )}
      </section>
    );
  }

  return (
    <section className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <FileText className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-petrol-950 text-sm font-semibold">{frameworkLabel} evidence report</p>
          <p className="text-petrol-600 mt-0.5 text-xs leading-5">
            PDF with all {controlCount} mapped {controlCount === 1 ? "control" : "controls"}, their checks and an
            evidence register, bookmarked by control family. Uses the scope selected above.
          </p>
        </div>
        <Button icon={Download} disabled={Boolean(blocker)} disabledReason={blocker} onClick={onDownload}>
          {report.phase === "error" ? "Try again" : "Download evidence report (PDF)"}
        </Button>
      </div>
      {blocker && <p className="mt-3 text-xs text-amber-800">{blocker}</p>}
      {report.phase === "error" && report.error && (
        <Alert tone="danger" title="The evidence report could not be created" className="mt-4">
          {report.error}
        </Alert>
      )}
      {report.notice && (
        <p className="text-petrol-600 mt-3 text-xs" role="status">
          {report.notice}
        </p>
      )}
    </section>
  );
}
