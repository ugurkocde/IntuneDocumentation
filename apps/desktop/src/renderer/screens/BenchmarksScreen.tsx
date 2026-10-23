import { Check, Info, KeyRound, LayoutGrid, ListChecks, Play, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { benchmarkDisplayName, READINESS_DISCLAIMER } from "../../../../../src/lib/benchmarks/display";
import { flowStage, flowSteps, type FlowStep } from "../../../../../src/lib/benchmarks/flow";
import type {
  BenchmarkAssessmentView,
  BenchmarkCatalog,
  BenchmarkIdentity,
  BenchmarkLevel,
} from "../../shared/ipc-types";
import { BenchmarkExports } from "../components/benchmarks/BenchmarkExports";
import { BenchmarkHistoryPanel } from "../components/benchmarks/BenchmarkHistoryPanel";
import { BenchmarkPortfolioPanel } from "../components/benchmarks/BenchmarkPortfolioPanel";
import { ExceptionsPanel } from "../components/benchmarks/ExceptionsPanel";
import { LevelHeadlines } from "../components/benchmarks/LevelHeadlines";
import { ManualSection } from "../components/benchmarks/ManualSection";
import { RecommendationList } from "../components/benchmarks/RecommendationList";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import {
  catalogChoices,
  differingSettingIds,
  levelsLabel,
  missingSettings,
  resolveSelection,
  reviewRows,
  toAssessment,
} from "../lib/benchmarks-view";
import { errorMessage, ipc } from "../lib/ipc";
import { useApp } from "../state/context";
import type { AppState } from "../state/types";

// Shown on the cards and in the setup card. The content never leaves main's
// memory except as the view below.
const DELIVERED = "Delivered from the licensed content service";
const GAPS_SHOWN = 5;

// Why the catalog cannot load, or null. Main also refuses without the claim.
function catalogBlocker(state: AppState): string | null {
  if (!state.auth?.signedIn) return "Sign in to compare your tenant with a benchmark.";
  if (!state.license?.entitled) return "An active license is required for benchmark comparisons.";
  return null;
}

// Why a comparison cannot run, or null.
function compareBlocker(state: AppState): string | null {
  if (state.collection.running) return "Available when the collection finishes.";
  if (!state.collection.summary) return "Collect tenant data first.";
  return null;
}

function formatDateTime(value: string | null): string {
  if (!value) return "an unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Stepper({ steps }: { steps: FlowStep[] }) {
  return (
    <ol aria-label="Steps" className="grid grid-cols-3 gap-2">
      {steps.map((step) => (
        <li
          key={step.step}
          aria-current={step.state === "current" ? "step" : undefined}
          className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 @2xl:px-4 ${
            step.state === "current"
              ? "border-teal-600/40 bg-teal-50"
              : step.state === "complete"
                ? "border-petrol-950/6 bg-white"
                : "border-petrol-950/6 bg-slate-50/70"
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              step.state === "complete"
                ? "bg-teal-600 text-white"
                : step.state === "current"
                  ? "bg-petrol-950 text-white"
                  : "bg-mint-100 text-petrol-600"
            }`}
          >
            {step.state === "complete" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : step.step}
          </span>
          <span className="min-w-0">
            <span className="text-petrol-600 block text-[10px] font-bold tracking-[0.14em] uppercase">
              Step {step.step}
              <span className="sr-only">
                {step.state === "complete" ? ", done" : step.state === "current" ? ", current" : ""}
              </span>
            </span>
            <span
              className={`block text-[13px] leading-4 font-semibold ${
                step.state === "upcoming" ? "text-petrol-600" : "text-petrol-950"
              }`}
            >
              {step.label}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const SELECT =
  "border-petrol-950/12 text-petrol-950 min-h-10 w-full min-w-0 cursor-pointer rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-60";

type CatalogState =
  | { phase: "loading" }
  | { phase: "ready"; catalog: BenchmarkCatalog }
  | { phase: "error"; error: string };

export function BenchmarksScreen() {
  const { state, actions } = useApp();
  const available = state.benchmarks === "internal";
  const blocker = catalogBlocker(state);
  const collectBlocker = compareBlocker(state);
  const collectedAt = state.collection.summary?.collectedAt ?? null;
  const [catalog, setCatalog] = useState<CatalogState>({ phase: "loading" });
  const [catalogToken, setCatalogToken] = useState(0);
  const [wanted, setWanted] = useState<Partial<BenchmarkIdentity>>({});
  const [assessment, setAssessment] = useState<BenchmarkAssessmentView | null>(null);
  const [running, setRunning] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ settingId: string; nonce: number } | null>(null);
  const catalogId = useRef(0);
  const assessId = useRef(0);

  useEffect(() => {
    if (!available || blocker) return;
    const id = ++catalogId.current;
    setCatalog({ phase: "loading" });
    ipc
      .benchmarksCatalog()
      .then((result) => {
        if (id === catalogId.current) setCatalog({ phase: "ready", catalog: result });
      })
      .catch((caught) => {
        if (id === catalogId.current) setCatalog({ phase: "error", error: errorMessage(caught) });
      });
  }, [available, blocker, catalogToken]);

  const reloadCatalog = () => setCatalogToken((value) => value + 1);
  const choices = useMemo(() => (catalog.phase === "ready" ? catalogChoices(catalog.catalog) : []), [catalog]);
  const selection = useMemo(() => resolveSelection(choices, wanted), [choices, wanted]);
  const choice = choices.find((item) => item.id === selection?.benchmark);
  const version = choice?.versions.find((item) => item.version === selection?.version);
  const nameOf = (id: string) => choices.find((item) => item.id === id)?.name ?? benchmarkDisplayName(id);

  const rows = useMemo(() => (assessment ? reviewRows(assessment) : []), [assessment]);
  const differing = useMemo(() => (assessment ? differingSettingIds(assessment) : []), [assessment]);

  // Compares the selection, or again the assessed benchmark, for example
  // after an exception changed the adjusted headline. Main keeps the pack.
  const run = (identity: BenchmarkIdentity | null) => {
    if (!identity || collectBlocker) return;
    const id = ++assessId.current;
    setRunning(true);
    setAssessError(null);
    ipc
      .benchmarksAssess(identity)
      .then((view) => {
        if (id !== assessId.current) return;
        setAssessment(toAssessment(view));
        setSetupOpen(false);
      })
      .catch((caught) => {
        if (id === assessId.current) setAssessError(errorMessage(caught));
      })
      .finally(() => {
        if (id === assessId.current) setRunning(false);
      });
  };
  const compare = () => run(selection);
  const assessed: BenchmarkIdentity | null = assessment
    ? { benchmark: assessment.benchmark, version: assessment.version, level: assessment.level }
    : null;
  const msp = state.license?.plan === "msp";

  // Without the claim nothing names CIS Benchmarks (the reducer also leaves
  // this screen when the claim is gone).
  if (!available) {
    return (
      <div className="space-y-5">
        <Header eyebrow="Compliance Evidence" title="Not available" />
        <EmptyState
          icon={ListChecks}
          title="This view is not available"
          description="It is not part of this licence."
          action={
            <Button icon={ShieldCheck} onClick={() => actions.navigate("compliance")}>
              Open Compliance Evidence
            </Button>
          }
        />
      </div>
    );
  }

  const header = (
    <Header
      eyebrow="CIS Benchmarks"
      title="Benchmark readiness"
      description="Compare the Settings Catalog policies of your last collection with a benchmark, then review what matches, what differs and what needs a manual check."
    />
  );

  if (blocker) {
    return (
      <div className="space-y-5">
        {header}
        <EmptyState
          icon={ListChecks}
          title={state.auth?.signedIn ? "An active license is required" : "Sign in to compare with a benchmark"}
          description={blocker}
          action={
            state.auth?.signedIn ? (
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

  const stage = flowStage({ hasRun: running, hasAssessment: assessment !== null, setupRequested: setupOpen });
  const steps = flowSteps(Boolean(selection) || assessment !== null, assessment !== null, running);
  const stale = Boolean(
    assessment && collectedAt && assessment.collection.collectedAt && assessment.collection.collectedAt !== collectedAt,
  );
  const assessFailed = assessError && (
    <Alert
      tone="danger"
      title="The comparison could not run"
      action={
        <Button
          size="sm"
          variant="secondary"
          icon={RefreshCw}
          disabled={!selection || Boolean(collectBlocker)}
          onClick={compare}
        >
          Try again
        </Button>
      }
    >
      {assessError}
    </Alert>
  );

  const setup = (
    <section
      aria-labelledby="benchmark-setup-title"
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Load benchmark</p>
          <h2 id="benchmark-setup-title" className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
            Choose a benchmark, version and Level
          </h2>
          <p className="text-petrol-600 mt-1 flex items-center gap-1.5 text-xs">
            <Info className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
            {DELIVERED}
          </p>
        </div>
        {assessment && (
          <Button size="sm" variant="ghost" onClick={() => setSetupOpen(false)}>
            Back to results
          </Button>
        )}
      </div>

      <div className="mt-5">
        {catalog.phase === "loading" ? (
          <p className="text-petrol-600 flex items-center gap-2 text-sm" role="status">
            <Spinner /> Loading the benchmark catalog
          </p>
        ) : catalog.phase === "error" ? (
          <Alert
            tone="danger"
            title="The benchmark catalog could not be loaded"
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={reloadCatalog}>
                Try again
              </Button>
            }
          >
            {catalog.error}
          </Alert>
        ) : choices.length === 0 || !selection ? (
          <EmptyState
            compact
            icon={ListChecks}
            title="No benchmark is available yet"
            description="The licensed content service delivered an empty catalog for this licence."
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={reloadCatalog}>
                Check again
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] @3xl:items-end">
            <div className="min-w-0">
              <label htmlFor="benchmark-choice" className="text-petrol-800 mb-1.5 block text-[12px] font-semibold">
                Benchmark
              </label>
              <select
                id="benchmark-choice"
                value={selection.benchmark}
                disabled={running}
                onChange={(event) => setWanted({ ...wanted, benchmark: event.target.value })}
                className={SELECT}
              >
                {choices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="benchmark-version" className="text-petrol-800 mb-1.5 block text-[12px] font-semibold">
                Version
              </label>
              <select
                id="benchmark-version"
                value={selection.version}
                disabled={running}
                onChange={(event) =>
                  setWanted({ ...wanted, benchmark: selection.benchmark, version: event.target.value })
                }
                className={SELECT}
              >
                {choice?.versions.map((item) => (
                  <option key={item.version} value={item.version}>
                    {item.version}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="min-w-0">
              <legend className="text-petrol-800 mb-1.5 block text-[12px] font-semibold">Level</legend>
              <div className="flex gap-1.5">
                {version?.levels.map((level: BenchmarkLevel) => (
                  <label
                    key={level}
                    className={`inline-flex min-h-10 cursor-pointer items-center rounded-xl border px-3.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600 ${
                      selection.level === level
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-petrol-950/12 text-petrol-800 hover:bg-mint-50 bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="benchmark-level"
                      className="sr-only"
                      checked={selection.level === level}
                      disabled={running}
                      onChange={() => setWanted({ ...selection, level })}
                    />
                    Level {level}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </div>

      <div className="border-petrol-950/6 mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-5">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Compare with tenant</p>
          <p className="text-petrol-800 mt-1 text-xs leading-5">
            {collectBlocker ??
              `Uses the collection from ${formatDateTime(collectedAt)}. No new permissions, nothing is written to the tenant.`}
          </p>
        </div>
        {collectBlocker && !state.collection.running ? (
          <Button size="sm" variant="secondary" icon={LayoutGrid} onClick={() => actions.navigate("overview")}>
            Go to Overview
          </Button>
        ) : (
          <Button
            size="sm"
            icon={Play}
            loading={running}
            disabled={!selection || Boolean(collectBlocker)}
            disabledReason={collectBlocker ?? (!selection ? "Choose a benchmark first." : null)}
            onClick={compare}
          >
            Compare with tenant
          </Button>
        )}
      </div>
    </section>
  );

  return (
    <div className="space-y-5">
      {header}
      <Stepper steps={steps} />

      {stage === "setup" && (
        <>
          {assessFailed}
          {setup}
        </>
      )}

      {stage === "running" && (
        <div
          className="border-petrol-950/6 shadow-card flex min-h-64 items-center justify-center rounded-2xl border bg-white"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <Spinner className="h-6 w-6" />
            <p className="text-petrol-600 text-sm">Comparing the benchmark with the last collection</p>
          </div>
        </div>
      )}

      {stage === "results" && assessment && (
        <div className="animate-fade-in-up space-y-5">
          <section className="border-petrol-950/6 shadow-card flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-5 @xl:p-6">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <ListChecks className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 basis-64">
              <h2 className="text-petrol-950 text-base font-semibold tracking-[-0.01em] break-words">
                {nameOf(assessment.benchmark)}
              </h2>
              <p className="text-petrol-600 mt-0.5 text-xs leading-5">
                Version {assessment.version}, {levelsLabel(assessment)}. Compared{" "}
                {formatDateTime(assessment.assessedAt)} with the collection from{" "}
                {formatDateTime(assessment.collection.collectedAt)}. {DELIVERED}.
              </p>
              <p className="mt-1 text-xs font-semibold text-teal-700">{READINESS_DISCLAIMER}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={Settings2}
                disabled={running}
                onClick={() => setSetupOpen(true)}
              >
                Change benchmark
              </Button>
              <Button
                size="sm"
                icon={RefreshCw}
                loading={running}
                disabled={!selection || Boolean(collectBlocker)}
                disabledReason={collectBlocker}
                onClick={compare}
              >
                Compare again
              </Button>
            </div>
          </section>

          {running && (
            <p className="text-petrol-600 flex items-center gap-2 text-xs" role="status">
              <Spinner className="h-3.5 w-3.5" /> Comparing again. The results below are from the previous comparison.
            </p>
          )}
          {assessFailed}
          {stale && (
            <Alert tone="info" title="A newer collection is available">
              These results use an earlier collection. Compare again to use the latest one.
            </Alert>
          )}
          {!assessment.collection.complete && (
            <Alert tone="warning" title="The collection is incomplete">
              Results that depend on data that was not read are Needs review, never Differs or Missing, and no
              drafts are offered.
              {assessment.collection.gaps.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">
                  {assessment.collection.gaps.slice(0, GAPS_SHOWN).map((gap) => (
                    <li key={gap} className="break-words">
                      {gap}
                    </li>
                  ))}
                  {assessment.collection.gaps.length > GAPS_SHOWN && (
                    <li>and {(assessment.collection.gaps.length - GAPS_SHOWN).toLocaleString()} more</li>
                  )}
                </ul>
              )}
            </Alert>
          )}

          <LevelHeadlines levels={assessment.levels} rows={rows} />

          <BenchmarkHistoryPanel
            identity={assessed!}
            levels={assessment.levels.map((item) => item.level)}
            assessedAt={assessment.assessedAt}
            record={assessment.history}
            onOpenHistory={() => actions.navigate("history")}
          />

          <RecommendationList
            key={`${assessment.benchmark}|${assessment.version}|${assessment.level}`}
            rows={rows}
            basis={assessment.basis}
            onAddException={(settingId) => setPrefill((current) => ({ settingId, nonce: (current?.nonce ?? 0) + 1 }))}
          />

          <ExceptionsPanel
            identity={assessed!}
            settingIds={differing}
            prefill={prefill}
            onChanged={() => run(assessed)}
          />

          <ManualSection assessment={assessment} rows={rows} />

          <BenchmarkExports
            blocker={running ? "Available when the comparison finishes." : null}
            missing={missingSettings(assessment)}
            complete={assessment.collection.complete}
          />
        </div>
      )}

      {msp && <BenchmarkPortfolioPanel nameOf={(id) => choices.find((item) => item.id === id)?.name} />}
    </div>
  );
}
