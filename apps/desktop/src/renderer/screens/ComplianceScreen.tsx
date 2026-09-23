import { ExternalLink, KeyRound, LayoutGrid, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FrameworkBadge } from "../../../../../src/components/dashboard/framework-badge";
import { compareControlIds } from "../../../../../src/lib/compliance/engine";
import type { AssessmentScope } from "../../../../../src/lib/compliance/types";
import type { ComplianceFrameworkId, ComplianceView } from "../../shared/ipc-types";
import { ControlRow, CONTROL_STATUS_ORDER } from "../components/compliance/ControlRow";
import { FrameworkMenu } from "../components/compliance/FrameworkMenu";
import { ReportPanel } from "../components/compliance/ReportPanel";
import { ScopePanel } from "../components/compliance/ScopePanel";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useAsyncAction } from "../hooks/use-async-action";
import {
  FRAMEWORK_OPTIONS,
  frameworkOption,
  loadFrameworkSelection,
  storeFrameworkSelection,
} from "../lib/compliance-frameworks";
import { runComplianceReport } from "../lib/compliance-runner";
import { errorMessage, ipc } from "../lib/ipc";
import { useApp } from "../state/context";
import { initialComplianceReport } from "../state/reducer";
import type { AppState } from "../state/types";

// Why the assessment cannot run, or null. Mirrors exportBlocker because the
// assessment feeds the evidence report.
function assessBlocker(state: AppState): string | null {
  if (state.collection.running) return "Available when the collection finishes.";
  if (!state.collection.summary) return "Collect tenant data first.";
  if (!state.auth?.signedIn) return "Sign in again to review compliance evidence.";
  if (!state.license?.entitled) return "An active license is required for compliance evidence.";
  return null;
}

function SummaryCard({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "green" | "amber" | "slate";
}) {
  const toneClassName =
    tone === "green"
      ? "border-l-emerald-600 bg-emerald-50/35"
      : tone === "amber"
        ? "border-l-amber-600 bg-amber-50/35"
        : "border-l-slate-500 bg-slate-50";
  return (
    <div className={`border-petrol-950/6 shadow-card rounded-2xl border border-l-4 px-5 py-4 ${toneClassName}`}>
      <p className="text-petrol-600 text-xs font-medium">{label}</p>
      <p className="text-petrol-950 mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums">
        {count.toLocaleString()}
      </p>
      <p className="text-petrol-600 mt-1 text-[11px] tabular-nums">
        of {total.toLocaleString()} technical check results in scope
      </p>
    </div>
  );
}

function FrameworkPicker({
  view,
  onSelect,
}: {
  view: ComplianceView | null;
  onSelect: (id: ComplianceFrameworkId) => void;
}) {
  return (
    <div role="list" aria-label="Compliance frameworks" className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
      {FRAMEWORK_OPTIONS.map((framework) => {
        const summary = view?.frameworks.find((item) => item.id === framework.id);
        return (
          <div role="listitem" key={framework.id} className="flex">
            <button
              type="button"
              aria-label={framework.label}
              onClick={() => onSelect(framework.id)}
              className="border-petrol-950/8 shadow-card hover:bg-mint-50/35 group flex w-full cursor-pointer flex-col rounded-2xl border bg-white p-6 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-teal-700/25 hover:shadow-[0_16px_40px_-30px_rgba(8,47,54,0.55)] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <FrameworkBadge frameworkId={framework.id} />
              <span className="text-petrol-950 mt-5 block text-base font-semibold">{framework.label}</span>
              <span className="mt-1 block min-h-4 text-xs font-semibold text-teal-700">{summary?.version}</span>
              <span className="text-petrol-600 mt-3 block text-sm leading-6">{framework.description}</span>
              {summary?.totalRequirements !== undefined && (
                <span className="mt-auto block pt-3 text-xs font-semibold text-teal-700">
                  {framework.id === "essential-eight"
                    ? summary.coverageLabel
                    : `${summary.totalControls} of ${summary.totalRequirements} requirements mapped; supporting evidence only.`}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function scopeKey(scope: AssessmentScope): string {
  return JSON.stringify([scope.platforms ?? null, scope.essentialEightMaturityLevel ?? 1, scope.defStanRiskLevel ?? null]);
}

export function ComplianceScreen() {
  const { state, dispatch, actions } = useApp();
  const { scope, report } = state.compliance;
  const blocker = assessBlocker(state);
  const collectedAt = state.collection.summary?.collectedAt ?? null;
  const [frameworkId, setFrameworkId] = useState<ComplianceFrameworkId | null>(loadFrameworkSelection);
  const [view, setView] = useState<ComplianceView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recordPath, setRecordPath] = useState<string | null>(null);
  const record = useAsyncAction();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const focusTrigger = useRef(false);
  const requestId = useRef(0);

  const key = scopeKey(scope);
  useEffect(() => {
    if (blocker) return;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    ipc
      .complianceAssess({ frameworkId, scope })
      .then((result) => {
        if (id === requestId.current) setView(result);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(errorMessage(caught));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // scope is represented by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameworkId, key, collectedAt, blocker, reloadToken]);

  useEffect(() => {
    if (frameworkId && focusTrigger.current && view?.selected) {
      focusTrigger.current = false;
      triggerRef.current?.focus();
    }
  }, [frameworkId, view]);

  const selected = view?.selected && view.selected.framework.id === frameworkId ? view.selected : null;
  const option = frameworkOption(frameworkId);

  const capabilitiesById = useMemo(
    () => new Map((selected?.capabilities ?? []).map((capability) => [capability.capability.id, capability])),
    [selected],
  );
  const sortedControls = useMemo(
    () =>
      [...(selected?.controls ?? [])].sort(
        (left, right) =>
          CONTROL_STATUS_ORDER[left.status] - CONTROL_STATUS_ORDER[right.status] ||
          compareControlIds(left.control.id, right.control.id),
      ),
    [selected],
  );
  const checks = useMemo(
    () =>
      [...new Set(selected?.controls.flatMap((control) => control.capabilityIds) ?? [])]
        .flatMap((id) => capabilitiesById.get(id)?.checks ?? [])
        .filter((check) => check.assessmentStatus !== "outsideScope"),
    [selected, capabilitiesById],
  );

  const choose = (id: ComplianceFrameworkId | null, fromPicker = false) => {
    focusTrigger.current = fromPicker;
    storeFrameworkSelection(id);
    setFrameworkId(id);
    if (report.phase !== "running") {
      dispatch({ type: "complianceReport", patch: { notice: null, error: null } });
    }
  };
  const setScope = (next: AssessmentScope) => dispatch({ type: "complianceScope", scope: next });

  const reportBlocker =
    blocker ??
    (report.phase === "running"
      ? "A report is already being created."
      : loading
        ? "Available when the assessment is up to date."
        : null);

  if (blocker) {
    const needsCollection = !state.collection.summary || state.collection.running;
    const needsLicense = !needsCollection && state.auth?.signedIn && !state.license?.entitled;
    return (
      <div className="space-y-5">
        <Header
          title="Compliance Evidence"
          description="Review the technical evidence found in your Intune policies and assignments for ten supported frameworks."
        />
        <EmptyState
          icon={ShieldCheck}
          title={
            state.collection.running
              ? "Collecting your tenant"
              : needsCollection
                ? "Collect your tenant first"
                : needsLicense
                  ? "An active license is required"
                  : "Sign in to review compliance evidence"
          }
          description={
            state.collection.running
              ? "Compliance evidence is assessed from the collected configuration. It appears here as soon as the collection finishes."
              : needsCollection
                ? "Compliance evidence is assessed from your collected Intune configuration and assignments. Collect your tenant on the Overview, then come back to choose a framework."
                : blocker
          }
          action={
            needsLicense ? (
              <Button icon={KeyRound} onClick={() => actions.navigate("license")}>
                Open License and account
              </Button>
            ) : (
              <Button icon={LayoutGrid} onClick={() => actions.navigate("overview")}>
                Go to Overview
              </Button>
            )
          }
        />
      </div>
    );
  }

  if (!frameworkId) {
    return (
      <div className="space-y-6">
        <Header
          eyebrow="Compliance Evidence"
          title="Choose a compliance framework"
          description="Select a framework to review the configuration evidence found in your Intune policies and assignments."
        />
        {error && (
          <Alert
            tone="danger"
            title="The assessment could not be loaded"
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setReloadToken((value) => value + 1)}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        )}
        <FrameworkPicker view={view} onSelect={(id) => choose(id, true)} />
      </div>
    );
  }

  const label = option?.label ?? frameworkId;
  return (
    <div className="space-y-5">
      <Header
        eyebrow="Compliance Evidence"
        title={label}
        description={selected?.framework.version ?? view?.frameworks.find((item) => item.id === frameworkId)?.version}
        actions={
          <FrameworkMenu
            selectedId={frameworkId}
            summaries={view?.frameworks ?? []}
            onSelect={(id) => choose(id)}
            onShowAll={() => choose(null)}
            triggerRef={triggerRef}
          />
        }
      />

      {error && (
        <Alert
          tone="danger"
          title="The assessment could not be loaded"
          action={
            <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setReloadToken((value) => value + 1)}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!selected || !view ? (
        !error && (
          <div className="border-petrol-950/6 shadow-card flex min-h-64 items-center justify-center rounded-2xl border bg-white" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="h-6 w-6" />
              <p className="text-petrol-600 text-sm">Assessing configuration evidence</p>
            </div>
          </div>
        )
      ) : (
        <div key={frameworkId} className="animate-fade-in-up space-y-5">
          <section className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-petrol-950 text-sm leading-6">
                  Review the technical evidence found in your collected Intune policies and assignments for {label}.
                </p>
                <p className="text-petrol-600/80 mt-2 max-w-4xl text-[11px] leading-5">{view.disclaimer}</p>
              </div>
            </div>
          </section>

          <ScopePanel
            view={view}
            scope={scope}
            onScopeChange={setScope}
            updating={loading}
            showEssentialEightLevel={frameworkId === "essential-eight"}
            showRiskLevel={frameworkId === "def-stan-05-138-i4"}
            record={{
              busy: record.busy === "record",
              disabledReason: loading ? "Available when the assessment is up to date." : null,
              error: record.error,
              savedPath: recordPath,
              onSave: () =>
                void record.run("record", async () => {
                  const saved = await ipc.complianceSaveRecord({ frameworkId, scope });
                  if (saved) setRecordPath(saved);
                }),
            }}
          />

          <div className="grid gap-3 @2xl:grid-cols-3" aria-label={`${selected.framework.name} summary`}>
            <SummaryCard
              label="Matches expected value"
              count={checks.filter((check) => check.result === "matches").length}
              total={checks.length}
              tone="green"
            />
            <SummaryCard
              label="Different value"
              count={checks.filter((check) => check.result === "different").length}
              total={checks.length}
              tone="amber"
            />
            <SummaryCard
              label="Missing"
              count={checks.filter((check) => check.result === "missing").length}
              total={checks.length}
              tone="slate"
            />
          </div>

          <p className="text-xs leading-5 text-slate-600">
            {checks.filter((check) => check.assessmentStatus === "checked").length} checked;{" "}
            {checks.filter((check) => check.assessmentStatus === "unableToCheck").length} unable to check. Only Intune
            and Conditional Access policy checks are shown. Counts describe setting comparisons, not passed framework
            requirements. Assignment is shown separately.
          </p>
          {selected.framework.totalRequirements !== undefined && selected.coverageLabel && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              {selected.coverageLabel}
            </p>
          )}

          <ReportPanel
            frameworkLabel={
              report.phase === "running" ? (frameworkOption(report.frameworkId)?.label ?? label) : label
            }
            controlCount={selected.controls.length}
            report={report.frameworkId === frameworkId || report.phase === "running" ? report : initialComplianceReport}
            blocker={reportBlocker}
            onDownload={() =>
              void runComplianceReport(dispatch, frameworkId, scope, () => void actions.refreshLicense())
            }
            onReset={() => dispatch({ type: "complianceReport", patch: initialComplianceReport })}
          />

          {(selected.framework.note || selected.framework.source) && (
            <div className="space-y-2">
              {selected.framework.note && (
                <p className="text-petrol-600 text-xs leading-5">{selected.framework.note}</p>
              )}
              {selected.framework.source && (
                <p className="text-petrol-600 text-xs">
                  <button
                    type="button"
                    onClick={() => void ipc.complianceOpenSource(frameworkId).catch(() => undefined)}
                    className="inline-flex cursor-pointer items-center gap-1 font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-600"
                  >
                    Official publisher reference
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </button>{" "}
                  (reference reviewed {selected.framework.source.verifiedAt})
                </p>
              )}
            </div>
          )}

          <section aria-labelledby="compliance-controls-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <h2 id="compliance-controls-title" className="text-petrol-950 text-base font-semibold tracking-[-0.01em]">
                Mapped controls
                <span className="bg-mint-100 text-petrol-700 ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-bold tabular-nums">
                  {sortedControls.length}
                </span>
              </h2>
              {sortedControls.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) => {
                      const keys = sortedControls.map((control) => `${frameworkId}:${control.control.id}`);
                      const allOpen = keys.every((item) => current.has(item));
                      const next = new Set(current);
                      keys.forEach((item) => (allOpen ? next.delete(item) : next.add(item)));
                      return next;
                    })
                  }
                  className="text-petrol-700 hover:bg-mint-50 hover:text-petrol-950 min-h-9 cursor-pointer rounded-xl px-3 text-xs font-semibold transition-colors"
                >
                  {sortedControls.every((control) => expanded.has(`${frameworkId}:${control.control.id}`))
                    ? "Collapse all"
                    : "Expand all"}
                </button>
              )}
            </div>
            {sortedControls.map((control) => {
              const expansionKey = `${frameworkId}:${control.control.id}`;
              return (
                <ControlRow
                  key={control.control.id}
                  control={control}
                  capabilitiesById={capabilitiesById}
                  expanded={expanded.has(expansionKey)}
                  onToggle={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(expansionKey)) next.delete(expansionKey);
                      else next.add(expansionKey);
                      return next;
                    })
                  }
                />
              );
            })}
          </section>
        </div>
      )}
    </div>
  );
}
