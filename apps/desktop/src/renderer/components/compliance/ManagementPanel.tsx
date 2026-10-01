import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Gauge,
  History,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { measuresWithSafeguards } from "../../../../../../src/lib/compliance/management/management-summary";
import type {
  ManagementLocale,
  NextAction,
  NextActionTier,
} from "../../../../../../src/lib/compliance/management/types";
import type {
  ComplianceFrameworkId,
  ComplianceFrameworkView,
  ComplianceRequest,
  CrosswalkImportResult,
} from "../../../shared/ipc-types";
import { useAsyncAction } from "../../hooks/use-async-action";
import { ipc, isMac } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { DisclosureSummary } from "../ui/DisclosureSummary";

// The control list filters the metric tiles toggle on the Compliance screen.
export type ControlFilter = "all" | "noSafeguards" | "unassigned" | "changed";

export const CONTROL_FILTER_LABELS: Record<ControlFilter, string> = {
  all: "All controls",
  noSafeguards: "Controls with no safeguards in place",
  unassigned: "Controls with safeguards set up but not switched on",
  changed: "Controls changed since the last report",
};

// Ids of the mapped controls without a single safeguard in place.
function controlsWithoutSafeguards(selected: ComplianceFrameworkView): string[] {
  return Object.entries(selected.management.safeguards)
    .filter(([, count]) => count.total > 0 && count.inPlace === 0)
    .map(([id]) => id);
}

// Control ids a filter keeps, or null for every control.
export function controlFilterIds(
  selected: ComplianceFrameworkView,
  filter: ControlFilter,
): Set<string> | null {
  switch (filter) {
    case "all":
      return null;
    case "noSafeguards":
      return new Set(controlsWithoutSafeguards(selected));
    case "unassigned":
      return new Set(selected.unassigned.flatMap((config) => config.controlIds));
    case "changed":
      return new Set(
        selected.delta
          ? [
              ...selected.delta.safeguardChanges.map((change) => change.controlId),
              ...selected.delta.newlyEvidenced,
              ...selected.delta.regressions,
              ...selected.delta.added,
            ]
          : [],
      );
  }
}

const CROSSWALK_FRAMEWORKS = new Set(["iso-27001-2022", "nis2-2022-2555"]);

function actionSentence(tier: NextActionTier, name: string): string {
  switch (tier) {
    case "conflicting":
      return `Resolve conflicting policies for ${name}`;
    case "assignedDeviation":
      return `Review policies that switch off ${name}`;
    case "partial":
      return `Complete the configuration for ${name}`;
    case "unassigned":
      return `Assign the existing policy for ${name}`;
    case "missing":
      return `Configure ${name}`;
  }
}

function portalName(url: string): string {
  try {
    return new URL(url).hostname === "entra.microsoft.com" ? "Entra" : "Intune";
  } catch {
    return "Intune";
  }
}

function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function MetricTile({
  label,
  value,
  hint,
  active,
  disabledReason,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  active: boolean;
  disabledReason?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      onClick={onClick}
      className={`flex min-h-24 w-full cursor-pointer flex-col items-start rounded-2xl border px-4 py-3.5 text-left transition-[background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-petrol-950/5 disabled:bg-slate-50/70 ${
        active
          ? "border-teal-600/40 bg-teal-50 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.35)]"
          : "border-petrol-950/8 enabled:hover:bg-mint-50/60 bg-white enabled:hover:border-teal-700/25"
      }`}
    >
      <span className={`text-xs font-medium ${active ? "text-teal-800" : "text-petrol-600"}`}>{label}</span>
      <span className="text-petrol-950 mt-1 text-xl font-semibold tracking-[-0.03em] tabular-nums">{value}</span>
      <span className="text-petrol-600 mt-0.5 text-[11px] leading-4">{hint}</span>
    </button>
  );
}

function NextActionItem({
  action,
  onOpen,
  busy,
}: {
  action: NextAction;
  onOpen: () => void;
  busy: boolean;
}) {
  const portal = portalName(action.url);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-petrol-950 text-[13px] leading-5 font-semibold">{actionSentence(action.tier, action.name)}</p>
        {action.controlIds.length > 0 && (
          <p className="text-petrol-600 mt-0.5 text-[11px]">
            Affects{" "}
            <span className="font-mono text-teal-700">{action.controlIds.join(", ")}</span>
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="secondary"
        icon={ExternalLink}
        loading={busy}
        aria-label={`Open in ${portal}: ${action.name}`}
        onClick={onOpen}
      >
        Open in {portal}
      </Button>
    </li>
  );
}

// Management view of the selected framework: safeguards in place, the tiles that
// filter the control list, next actions, baseline, crosswalk and the one-page
// management report.
export function ManagementPanel({
  selected,
  request,
  blocker,
  filter,
  onFilterChange,
  onRefresh,
}: {
  selected: ComplianceFrameworkView;
  request: ComplianceRequest & { frameworkId: ComplianceFrameworkId };
  // Why the actions that read the assessment cannot run, or null.
  blocker: string | null;
  filter: ControlFilter;
  onFilterChange: (filter: ControlFilter) => void;
  // Reloads the compliance view after the baseline or crosswalk changed.
  onRefresh: () => void;
}) {
  const { metrics, nextActions, outsideScope } = selected.management;
  const { delta, baseline, crosswalk } = selected;
  const { frameworkId } = request;
  const action = useAsyncAction();
  const fileAction = useAsyncAction();
  const link = useAsyncAction();
  const [locale, setLocale] = useState<ManagementLocale>("en");
  const [reportPath, setReportPath] = useState<string | null>(null);
  const [baselinePath, setBaselinePath] = useState<string | null>(null);
  const [baselineMessage, setBaselineMessage] = useState<string | null>(null);
  const [templatePath, setTemplatePath] = useState<string | null>(null);
  const [imported, setImported] = useState<Extract<CrosswalkImportResult, { ok: true }> | null>(null);
  const [crosswalkMessage, setCrosswalkMessage] = useState<string | null>(null);

  const actionBlocker = blocker ?? (action.busy ? "Available when the current action finishes." : null);
  const headline = metrics.safeguardPct === null ? "Not available" : `${metrics.safeguardPct}%`;
  const measureCoverage = measuresWithSafeguards(selected.management);
  const noSafeguards = controlsWithoutSafeguards(selected).length;
  const unassignedControls = new Set(selected.unassigned.flatMap((config) => config.controlIds)).size;
  const toggle = (next: ControlFilter) => onFilterChange(filter === next ? "all" : next);
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  let changeValue = "No baseline";
  let changeHint = "No baseline loaded";
  let changeDisabledReason = "Load a baseline to compare.";
  let changedCount = 0;
  if (delta) {
    changedCount = controlFilterIds(selected, "changed")?.size ?? 0;
    const points = delta.safeguardDeltaPoints;
    if (points === null) {
      changeValue = "No figure";
      changeHint = "Not in the earlier report. Save a new baseline.";
    } else {
      changeValue = points === 0 ? "No change" : `${points > 0 ? "+" : "-"}${Math.abs(points)} pts`;
      changeHint = `${plural(changedCount, "measure", "measures")} changed`;
    }
    changeDisabledReason = "No measure changed since the last report.";
  } else if (baseline) {
    changeValue = "Not comparable";
    changeHint = "Baseline cannot be compared";
    changeDisabledReason = baseline.mismatch ?? changeHint;
  }

  return (
    <section
      aria-labelledby="management-title"
      className="border-petrol-950/6 shadow-card space-y-5 rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Gauge className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Management summary</p>
          <h2 id="management-title" className="text-petrol-950 mt-1 text-lg font-semibold tracking-[-0.02em]">
            Safeguards in place <span className="tabular-nums">{headline}</span>
          </h2>
          <p className="text-petrol-600 mt-1 max-w-2xl text-xs leading-5">
            {metrics.safeguardsInPlace} of {metrics.safeguardsTotal} technical safeguards are set up and switched on
            in Intune. A coverage figure, not an audit result.
          </p>
          <p className="text-petrol-700 mt-1 text-xs font-medium">
            Measures with at least one safeguard:{" "}
            <span className="tabular-nums">
              {measureCoverage.withSafeguard} of {measureCoverage.total}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Report language" className="bg-mint-100 inline-flex rounded-xl p-1">
            {(["en", "de"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={locale === item}
                aria-label={item === "en" ? "English" : "German"}
                onClick={() => setLocale(item)}
                className={`min-h-7 min-w-9 cursor-pointer rounded-lg px-2 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                  locale === item ? "text-petrol-950 bg-white shadow-sm" : "text-petrol-600 hover:text-petrol-950"
                }`}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <Button
            icon={Download}
            loading={action.busy === "report"}
            disabled={Boolean(actionBlocker)}
            disabledReason={actionBlocker}
            onClick={() =>
              void action.run("report", async () => {
                setReportPath(null);
                const saved = await ipc.complianceSaveManagementReport(request, locale);
                if (saved) setReportPath(saved);
                else action.setMessage("Save cancelled. Nothing was saved.");
              })
            }
          >
            {action.busy === "report" ? "Creating management report" : "Export management report"}
          </Button>
        </div>
      </div>

      {blocker && <p className="text-xs text-amber-800">{blocker}</p>}
      {reportPath && (
        <div
          className="animate-fade-in flex flex-wrap items-center gap-3 rounded-xl border border-teal-600/20 bg-teal-50 p-3"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-petrol-950 text-xs font-semibold">Management report saved: {fileName(reportPath)}</p>
            <p className="text-petrol-600 selectable truncate text-[11px]" title={reportPath}>
              {reportPath}
            </p>
          </div>
          <Button
            size="sm"
            icon={FileText}
            loading={fileAction.busy === "open"}
            onClick={() => void fileAction.run("open", () => ipc.openLastFile(reportPath))}
          >
            Open file
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={FolderOpen}
            onClick={() => void fileAction.run("show", () => ipc.showLastFileInFolder(reportPath))}
          >
            {isMac ? "Show in Finder" : "Show in folder"}
          </Button>
        </div>
      )}
      {(action.error || fileAction.error) && (
        <Alert tone="danger">{[action.error, fileAction.error].filter(Boolean).join(" ")}</Alert>
      )}
      {action.message && (
        <p className="text-petrol-600 text-xs" role="status">
          {action.message}
        </p>
      )}

      <div>
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4" role="group" aria-label="Filter the mapped controls">
          <MetricTile
            label="Safeguards in place"
            value={`${metrics.safeguardsInPlace} of ${metrics.safeguardsTotal}`}
            hint="Set up and switched on in Intune"
            active={filter === "all"}
            onClick={() => onFilterChange("all")}
          />
          <MetricTile
            label="Measures with no safeguards"
            value={noSafeguards.toLocaleString()}
            hint="No safeguard set up and switched on"
            active={filter === "noSafeguards"}
            disabledReason={noSafeguards === 0 ? "Every measure has at least one safeguard in place." : null}
            onClick={() => toggle("noSafeguards")}
          />
          <MetricTile
            label="Set up but not switched on"
            value={metrics.unassignedConfigs.toLocaleString()}
            hint={`Safeguards on ${plural(unassignedControls, "measure", "measures")} not assigned to anyone`}
            active={filter === "unassigned"}
            disabledReason={selected.unassigned.length === 0 ? "No safeguard is set up without being switched on." : null}
            onClick={() => toggle("unassigned")}
          />
          <MetricTile
            label="Change since last report"
            value={changeValue}
            hint={changeHint}
            active={filter === "changed"}
            disabledReason={changedCount === 0 ? changeDisabledReason : null}
            onClick={() => toggle("changed")}
          />
        </div>
      </div>

      {(metrics.outsideIntuneScope ?? 0) > 0 && (
        <details className="text-xs text-slate-700">
          <DisclosureSummary className="font-semibold hover:text-teal-700">
            {metrics.outsideIntuneScope} {metrics.outsideIntuneScope === 1 ? "measure is" : "measures are"} outside
            Intune scope and need separate assessment.
          </DisclosureSummary>
          {outsideScope.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-9">
              {outsideScope.map((measure) => (
                <li key={measure.id}>
                  <span className="mr-1.5 font-mono text-teal-700">{measure.id}</span>
                  {measure.title.en}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {metrics.dataGaps > 0 && (
        <p role="status" className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900">
          Evidence for {metrics.dataGaps} mapped {metrics.dataGaps === 1 ? "capability" : "capabilities"} could not be
          read. Collect the tenant again to complete the picture.
        </p>
      )}

      <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="border-petrol-950/6 rounded-xl border p-4">
          <h3 className="text-petrol-950 text-sm font-semibold">Next actions</h3>
          {nextActions.length === 0 ? (
            <p className="text-petrol-600 mt-2 text-xs">No configuration action is suggested for the mapped controls.</p>
          ) : (
            <ol className="divide-petrol-950/6 mt-3 divide-y">
              {nextActions.slice(0, 5).map((item) => (
                <NextActionItem
                  key={`${item.capabilityId}-${item.tier}`}
                  action={item}
                  busy={link.busy === item.capabilityId}
                  onOpen={() =>
                    void link.run(item.capabilityId, async () => {
                      if (!(await ipc.openPortalLink(item.url))) {
                        throw new Error("The admin center link could not be opened.");
                      }
                    })
                  }
                />
              ))}
            </ol>
          )}
          {link.error && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              The admin center could not be opened: {link.error}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="border-petrol-950/6 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <h3 className="text-petrol-950 text-sm font-semibold">Baseline</h3>
            </div>
            {baseline?.mismatch && !baselineMessage ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {baseline.mismatch}
              </p>
            ) : (
              <p className="text-petrol-600 mt-1 text-xs leading-5">
                {baseline
                  ? `Compared with baseline from ${formatDate(baseline.generatedAt)}.`
                  : "Save a baseline now and load it later to see what changed."}
              </p>
            )}
            {!baseline?.mismatch && (baseline?.rulesetChanged || delta?.rulesetChanged) && (
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Rules changed since the baseline; some movement may come from mapping updates.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={Download}
                loading={action.busy === "saveBaseline"}
                disabled={Boolean(actionBlocker)}
                disabledReason={actionBlocker}
                onClick={() =>
                  void action.run("saveBaseline", async () => {
                    setBaselineMessage(null);
                    setBaselinePath(await ipc.complianceSaveBaseline(request));
                  })
                }
              >
                Save baseline
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={Upload}
                loading={action.busy === "loadBaseline"}
                disabled={Boolean(actionBlocker)}
                disabledReason={actionBlocker}
                onClick={() =>
                  void action.run("loadBaseline", async () => {
                    setBaselineMessage(null);
                    setBaselinePath(null);
                    const result = await ipc.complianceLoadBaseline(request);
                    if ("canceled" in result) return;
                    if (result.ok) onRefresh();
                    else setBaselineMessage(result.message);
                  })
                }
              >
                Load baseline
              </Button>
              {baseline && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  loading={action.busy === "clearBaseline"}
                  disabled={Boolean(actionBlocker)}
                  disabledReason={actionBlocker}
                  onClick={() =>
                    void action.run("clearBaseline", async () => {
                      setBaselineMessage(null);
                      await ipc.complianceClearBaseline(frameworkId);
                      onRefresh();
                    })
                  }
                >
                  Clear
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs" role="status" aria-live="polite">
              {baselineMessage ? (
                <span className="text-red-700">{baselineMessage}</span>
              ) : baselinePath ? (
                <span className="text-petrol-600 selectable" title={baselinePath}>
                  Baseline saved to {baselinePath}
                </span>
              ) : null}
            </p>
          </div>

          <div className="border-petrol-950/6 rounded-xl border p-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <h3 className="text-petrol-950 text-sm font-semibold">Crosswalk</h3>
            </div>
            {!CROSSWALK_FRAMEWORKS.has(frameworkId) ? (
              <p className="text-petrol-600 mt-1 text-xs leading-5">
                Crosswalk ids show on ISO 27001 and NIS2.
              </p>
            ) : (
              <>
                <p className="text-petrol-600 mt-1 text-xs leading-5">
                  Your own ISO 27001, NIS2 and CIS mapping. Kept in memory for this session only.
                </p>
                {crosswalk && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-petrol-700 min-w-0 text-xs break-words">
                      <span className="font-semibold">{crosswalk.fileName}</span>: {crosswalk.rows}{" "}
                      {crosswalk.rows === 1 ? "row" : "rows"}, {crosswalk.issues}{" "}
                      {crosswalk.issues === 1 ? "issue" : "issues"}.
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={Trash2}
                      loading={action.busy === "clearCrosswalk"}
                      disabled={Boolean(actionBlocker)}
                      disabledReason={actionBlocker}
                      onClick={() =>
                        void action.run("clearCrosswalk", async () => {
                          setCrosswalkMessage(null);
                          setImported(null);
                          await ipc.complianceClearCrosswalk();
                          onRefresh();
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Upload}
                    loading={action.busy === "importCrosswalk"}
                    disabled={Boolean(actionBlocker)}
                    disabledReason={actionBlocker}
                    onClick={() =>
                      void action.run("importCrosswalk", async () => {
                        setCrosswalkMessage(null);
                        setTemplatePath(null);
                        const result = await ipc.complianceImportCrosswalk();
                        if ("canceled" in result) return;
                        if (result.ok) {
                          setImported(result);
                          onRefresh();
                        } else {
                          setImported(null);
                          setCrosswalkMessage(result.message);
                        }
                      })
                    }
                  >
                    Import crosswalk
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Download}
                    loading={action.busy === "template"}
                    disabled={Boolean(actionBlocker)}
                    disabledReason={actionBlocker}
                    onClick={() =>
                      void action.run("template", async () => {
                        setCrosswalkMessage(null);
                        setTemplatePath(await ipc.complianceSaveCrosswalkTemplate());
                      })
                    }
                  >
                    Download template
                  </Button>
                </div>
                <div className="mt-2 text-xs" role="status" aria-live="polite">
                  {crosswalkMessage ? (
                    <p className="text-red-700">{crosswalkMessage}</p>
                  ) : imported ? (
                    <>
                      <p className="text-petrol-700">
                        Imported {imported.rows} {imported.rows === 1 ? "row" : "rows"} with {imported.issues.length}{" "}
                        {imported.issues.length === 1 ? "issue" : "issues"}.
                      </p>
                      {imported.issues.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-amber-800">
                          {imported.issues.slice(0, 5).map((issue, index) => (
                            <li key={`${issue.line}-${index}`}>
                              Line {issue.line}: {issue.message}
                            </li>
                          ))}
                          {imported.issues.length > 5 && <li>{imported.issues.length - 5} more not shown.</li>}
                        </ul>
                      )}
                    </>
                  ) : templatePath ? (
                    <p className="text-petrol-600 selectable" title={templatePath}>
                      Template saved to {templatePath}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
