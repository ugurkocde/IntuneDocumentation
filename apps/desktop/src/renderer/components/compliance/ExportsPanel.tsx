import { CheckCircle2, Download, FileArchive, FileSpreadsheet, FileText, FolderOpen, RefreshCw, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ComplianceFrameworkId,
  ComplianceRegisterFormat,
  ComplianceReportProgress,
  ComplianceRequest,
  FixPackPreview,
} from "../../../shared/ipc-types";
import { useAsyncAction } from "../../hooks/use-async-action";
import { errorMessage, ipc, isMac } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DisclosureSummary } from "../ui/DisclosureSummary";
import { Spinner } from "../ui/Spinner";

type ExportKind = "csv" | "xlsx" | "pack" | "fixPack";

const EXPORT_LABELS: Record<ExportKind, string> = {
  csv: "Evidence register (CSV)",
  xlsx: "Evidence register (Excel)",
  pack: "Purview evidence pack",
  fixPack: "Draft fix pack",
};

const STAGE_LABELS: Record<ComplianceReportProgress["stage"], string> = {
  groups: "Resolving group names",
  generating: "Generating the file",
  saving: "Choose where to save the file",
};

// The warnings the user accepts before a fix pack is saved. The README and
// every policy description in the pack repeat them.
export const FIX_PACK_WARNINGS = [
  "Every policy is a draft and unassigned. It has no effect on any device or user until you assign it.",
  "A setting can be missing from the evidence and still be delivered by Group Policy, a security baseline or another profile. A duplicate can cause conflicts.",
  "Review every setting before you import a policy, and do not import blindly. The values follow the evidence rules, not your exceptions or change process.",
  "Assign each policy to a pilot group first and widen the assignment after testing.",
] as const;

function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function ExportRow({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof FileText;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4 py-4 first:pt-0 last:pb-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="text-petrol-950 text-sm font-semibold">{title}</h3>
        <div className="text-petrol-600 mt-0.5 max-w-2xl text-xs leading-5">{description}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// Evidence register, Purview evidence pack and draft fix pack of the selected
// framework and scope. Saved files offer Open file and Show in folder.
export function ExportsPanel({
  request,
  frameworkLabel,
  ready,
  blocker,
  onBusyChange,
}: {
  request: ComplianceRequest & { frameworkId: ComplianceFrameworkId };
  frameworkLabel: string;
  // True when the assessment is current, so the fix pack preview can load.
  ready: boolean;
  // Why the exports cannot run, or null.
  blocker: string | null;
  // Lets the screen block other reports while an export runs.
  onBusyChange: (busy: boolean) => void;
}) {
  const action = useAsyncAction();
  const fileAction = useAsyncAction();
  const [saved, setSaved] = useState<{ kind: ExportKind; path: string } | null>(null);
  const [stage, setStage] = useState<ComplianceReportProgress["stage"] | null>(null);
  const [preview, setPreview] = useState<FixPackPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const previewId = useRef(0);
  const closeConfirm = useCallback(() => setConfirming(false), []);

  const busy = action.busy as ExportKind | null;
  useEffect(() => onBusyChange(busy !== null), [busy, onBusyChange]);

  const requestKey = JSON.stringify(request);
  useEffect(() => {
    if (!ready) return;
    const id = ++previewId.current;
    setPreview(null);
    setPreviewError(null);
    ipc
      .compliancePreviewFixPack(request)
      .then((result) => {
        if (id === previewId.current) setPreview(result);
      })
      .catch((caught) => {
        if (id === previewId.current) setPreviewError(errorMessage(caught));
      });
    // request is represented by requestKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, ready, previewToken]);

  // A new framework or scope makes the last saved file stale.
  useEffect(() => {
    setSaved(null);
    action.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const actionBlocker = blocker ?? (busy ? "Available when the current export finishes." : null);

  const run = (kind: ExportKind, save: () => Promise<string | null>) =>
    action.run(kind, async () => {
      setSaved(null);
      setStage(null);
      const unsubscribe = ipc.onComplianceProgress((progress) => setStage(progress.stage));
      try {
        const path = await save();
        if (path) setSaved({ kind, path });
        else action.setMessage("Save cancelled. Nothing was saved.");
      } finally {
        unsubscribe();
        setStage(null);
      }
    });

  const saveRegister = (format: ComplianceRegisterFormat) =>
    void run(format, () => ipc.complianceSaveRegister(request, format));

  const drafts = preview?.summary.draftPolicies ?? 0;
  const fixPackBlocker =
    actionBlocker ??
    (previewError
      ? "The fix pack preview could not be loaded."
      : !preview
        ? "Available when the preview is ready."
        : drafts === 0
          ? "No draft policy can be generated for this framework and scope."
          : null);

  const status = (kind: ExportKind) =>
    busy === kind ? (
      <p className="text-petrol-600 mt-1 text-[11px]" role="status" aria-live="polite">
        {stage ? STAGE_LABELS[stage] : "Starting"}
      </p>
    ) : null;

  return (
    <section
      aria-labelledby="compliance-exports-title"
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="mb-4">
        <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Exports</p>
        <h2 id="compliance-exports-title" className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
          Registers and packs for {frameworkLabel}
        </h2>
        <p className="text-petrol-600 mt-0.5 text-xs">Uses the scope selected above.</p>
      </div>

      {blocker && <p className="mb-3 text-xs text-amber-800">{blocker}</p>}

      <div className="divide-petrol-950/6 divide-y">
        <ExportRow
          icon={FileSpreadsheet}
          title="Evidence register"
          description={
            <>
              Every mapped control and technical check as a table. Excel adds an About sheet with the status
              definitions and Intune&apos;s device status per policy; CSV holds the checks.
              {status("xlsx")}
              {status("csv")}
            </>
          }
        >
          <Button
            size="sm"
            icon={FileSpreadsheet}
            loading={busy === "xlsx"}
            disabled={Boolean(actionBlocker)}
            disabledReason={busy === "xlsx" ? null : actionBlocker}
            onClick={() => saveRegister("xlsx")}
          >
            Excel (.xlsx)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={FileText}
            loading={busy === "csv"}
            disabled={Boolean(actionBlocker)}
            disabledReason={busy === "csv" ? null : actionBlocker}
            onClick={() => saveRegister("csv")}
          >
            CSV (.csv)
          </Button>
        </ExportRow>

        <ExportRow
          icon={FileArchive}
          title="Purview evidence pack"
          description={
            <>
              A ZIP to attach in Microsoft Purview Compliance Manager, with the evidence PDF, the JSON evidence
              record, an index of every control and upload steps. Control IDs follow the regulation, so check them
              against your tenant&apos;s template before you attach the pack.
              {status("pack")}
            </>
          }
        >
          <Button
            size="sm"
            icon={Download}
            loading={busy === "pack"}
            disabled={Boolean(actionBlocker)}
            disabledReason={busy === "pack" ? null : actionBlocker}
            onClick={() => void run("pack", () => ipc.complianceSaveEvidencePack(request))}
          >
            Evidence pack (.zip)
          </Button>
        </ExportRow>

        <ExportRow
          icon={Wrench}
          title="Draft fix pack"
          description={
            <>
              Draft, unassigned Windows Settings Catalog policies for settings with no evidence, to review and import
              in Intune. Intune Documentation never writes to your tenant.
              <span className="mt-1.5 block">
                {previewError ? (
                  <span className="inline-flex flex-wrap items-center gap-2 text-red-800" role="alert">
                    The preview could not be loaded: {previewError}
                    <button
                      type="button"
                      onClick={() => setPreviewToken((value) => value + 1)}
                      className="inline-flex cursor-pointer items-center gap-1 rounded font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      Try again
                    </button>
                  </span>
                ) : preview ? (
                  <span className="text-petrol-800 font-semibold tabular-nums" role="status">
                    {plural(preview.summary.draftPolicies, "draft policy", "draft policies")},{" "}
                    {preview.summary.notGeneratable.toLocaleString()} not generatable
                  </span>
                ) : (
                  <span className="text-petrol-600 inline-flex items-center gap-2" role="status">
                    <Spinner className="h-3 w-3" /> Checking which drafts can be generated
                  </span>
                )}
              </span>
              {status("fixPack")}
            </>
          }
        >
          <Button
            size="sm"
            icon={Download}
            loading={busy === "fixPack"}
            disabled={Boolean(fixPackBlocker)}
            disabledReason={busy === "fixPack" ? null : fixPackBlocker}
            onClick={() => setConfirming(true)}
          >
            Fix pack (.zip)
          </Button>
        </ExportRow>
      </div>

      {preview && preview.notGeneratable.length > 0 && (
        <details className="border-petrol-950/6 mt-3 rounded-xl border bg-slate-50/60 px-3 py-2.5 text-xs text-slate-700">
          <DisclosureSummary className="font-semibold hover:text-teal-700">
            Not generatable ({preview.notGeneratable.length.toLocaleString()})
          </DisclosureSummary>
          <ul
            className="divide-petrol-950/6 mt-2 max-h-80 divide-y overflow-y-auto pr-1"
            aria-label="Not generatable capabilities"
          >
            {preview.notGeneratable.map((gap) => (
              <li key={gap.capabilityId} className="py-2 leading-5 first:pt-0 last:pb-0">
                <p className="text-petrol-950 font-semibold">{gap.name}</p>
                <p className="text-petrol-600 mt-0.5 break-words">{gap.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {saved && (
        <div
          className="animate-fade-in mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-teal-600/20 bg-teal-50 p-3"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-petrol-950 truncate text-xs font-semibold">
              {EXPORT_LABELS[saved.kind]} saved: {fileName(saved.path)}
            </p>
            <p className="text-petrol-600 selectable truncate text-[11px]" title={saved.path}>
              {saved.path}
            </p>
          </div>
          <Button
            size="sm"
            icon={FileText}
            loading={fileAction.busy === "open"}
            onClick={() => void fileAction.run("open", () => ipc.openLastFile(saved.path))}
          >
            Open file
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={FolderOpen}
            onClick={() => void fileAction.run("show", () => ipc.showLastFileInFolder(saved.path))}
          >
            {isMac ? "Show in Finder" : "Show in folder"}
          </Button>
        </div>
      )}
      {(action.error || fileAction.error) && (
        <Alert tone="danger" title={action.error ? "The export could not be saved" : undefined} className="mt-4">
          {[action.error, fileAction.error].filter(Boolean).join(" ")}
        </Alert>
      )}
      {action.message && (
        <p className="text-petrol-600 mt-3 text-xs" role="status">
          {action.message}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title="Save the draft fix pack?"
        description={`${plural(drafts, "draft policy", "draft policies")} for ${frameworkLabel}. Read these points before you import any of them.`}
        confirmLabel="Save fix pack"
        onCancel={closeConfirm}
        onConfirm={() => {
          setConfirming(false);
          void run("fixPack", () => ipc.complianceSaveFixPack(request, true));
        }}
      >
        <ul className="text-petrol-700 mt-3 list-disc space-y-1.5 pl-4 text-xs leading-5">
          {FIX_PACK_WARNINGS.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </section>
  );
}
