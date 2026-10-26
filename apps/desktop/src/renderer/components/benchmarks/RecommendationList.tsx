import { ArrowRight, Check, ChevronDown, Search, ShieldCheck, ShieldOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SettingFinding } from "../../../../../../src/lib/benchmarks/assessment";
import {
  REASON_LABELS,
  SETTING_STATUS_LABELS,
  absentValueText,
  matchingPolicies,
  resultSettingDetails,
  settingStatusText,
  type ResultSettingDetail,
} from "../../../../../../src/lib/benchmarks/display";
import { isActive, localDate } from "../../../../../../src/lib/benchmarks/exceptions";
import { nextStepText } from "../../../../../../src/lib/benchmarks/fix-plan";
import type { BenchmarkAssessmentView, BenchmarkException, BenchmarkLevel } from "../../../shared/ipc-types";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import {
  ROW_STATES,
  filterRows,
  formatDay,
  sortRows,
  stateCountsOf,
  type LevelFilter,
  type ReviewRow,
  type RowOrder,
  type StateFilter,
} from "../../lib/benchmarks-view";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { DisclosureSummary } from "../ui/DisclosureSummary";
import { EmptyState } from "../ui/EmptyState";
import { ResultChip, STATE_LABELS } from "./LevelHeadlines";

// Rows rendered at once; large packs show more on request.
export const PAGE_SIZE = 100;

const OBSERVATION_TONES: Record<string, string> = {
  Matches: "text-emerald-800",
  Differs: "text-red-800",
  "Parent setting differs": "text-red-800",
};

// Asks the list to show one state (and Level), for example from a headline
// count; the nonce repeats the request.
export interface ListRequest {
  state: StateFilter;
  level: LevelFilter;
  nonce: number;
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={count === undefined ? undefined : `${label}, ${count.toLocaleString()}`}
      onClick={onClick}
      className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none ${
        active
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-petrol-950/10 text-petrol-700 hover:bg-mint-50 bg-white"
      }`}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
      {count !== undefined && (
        <span className={`font-medium tabular-nums ${active ? "text-white" : "text-petrol-600"}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <p className="text-petrol-600 mt-2 text-[11px] font-bold tracking-[0.12em] uppercase">{label}</p>
      <pre className="selectable bg-surface border-petrol-950/6 text-petrol-800 mt-1 max-h-56 overflow-auto rounded-lg border p-2.5 font-mono text-[11px] leading-4 break-all whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// An exception on a result: accepted until its date, or expired.
function ExceptionBadge({ exception }: { exception: BenchmarkException }) {
  const active = isActive(exception, localDate());
  return (
    <Badge
      variant={active ? "info" : "warning"}
      className="text-[11px]"
      title={`Owner: ${exception.owner}. ${exception.reason}`}
    >
      {active ? <ShieldCheck className="h-3 w-3" aria-hidden="true" /> : null}
      {active ? `Accepted until ${formatDay(exception.expiresOn)}` : `Exception expired ${formatDay(exception.expiresOn)}`}
    </Badge>
  );
}

// One setting of a result: the current value in each policy holding it with
// where that policy is assigned, next to the recommended value, both in
// plain text (resultSettingDetails, as the PDF and the CSV), and the raw
// instances behind a disclosure.
function SettingDetail({
  setting,
  findings,
  rowReason,
  rowLabel,
  exception,
  onAddException,
}: {
  setting: ResultSettingDetail;
  findings: readonly SettingFinding[];
  rowReason?: string;
  // The label of the row's chip when this is its only setting: a setting
  // chip saying the same is left out.
  rowLabel: string | null;
  exception?: BenchmarkException;
  onAddException: (settingId: string) => void;
}) {
  const named = setting.name !== setting.settingId;
  const status = settingStatusText(setting, matchingPolicies(findings, setting.settingId));
  return (
    <li className="border-petrol-950/6 rounded-xl border bg-white p-3 @xl:p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <p
            className={`text-petrol-950 leading-5 ${
              named ? "text-[13px] font-semibold break-words" : "font-mono text-xs font-medium break-all"
            }`}
          >
            {setting.name}
          </p>
          {named && (
            <code className="selectable text-petrol-600 block font-mono text-[11px] leading-4 break-all">
              {setting.settingId}
            </code>
          )}
        </div>
        {status !== rowLabel && <ResultChip result={setting.result} label={status} />}
      </div>
      {setting.reason && REASON_LABELS[setting.reason] !== rowReason && (
        <p className="text-petrol-600 mt-1.5 text-[11px] leading-4">{REASON_LABELS[setting.reason]}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="text-petrol-600 text-[11px] font-bold tracking-[0.12em] uppercase">Current</p>
          {setting.holders.length === 0 ? (
            <p className="text-petrol-950 mt-1 text-xs font-semibold">{absentValueText(setting.status)}</p>
          ) : (
            <ul className="mt-1 space-y-2" aria-label="Policies holding this setting">
              {setting.holders.map((holder, index) => (
                <li key={`${holder.policyId}:${index}`} className="text-xs leading-5">
                  <span className="text-petrol-950 selectable block font-semibold break-words">{holder.current.text}</span>
                  <span className="text-petrol-700 block break-words">
                    <span className="text-petrol-950 font-medium">{holder.policyName}</span>, {holder.assignedTo}
                  </span>
                  {/* The state is said once: a single holder repeats neither its value nor the setting's status. */}
                  {!(
                    setting.holders.length === 1 &&
                    (holder.label === holder.current.text || holder.label === SETTING_STATUS_LABELS[setting.status])
                  ) && (
                    <span
                      className={`block text-[11px] font-semibold ${OBSERVATION_TONES[holder.label] ?? "text-petrol-600"}`}
                    >
                      {holder.label}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-petrol-600 text-[11px] font-bold tracking-[0.12em] uppercase">Recommended</p>
          <ul className="mt-1 space-y-1">
            {(setting.recommended.length ? setting.recommended : ["Not delivered"]).map((value) => (
              <li key={value} className="text-petrol-950 selectable text-xs leading-5 font-semibold break-words">
                {value}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <details className="text-petrol-700 mt-3 text-[11px]">
        <DisclosureSummary className="font-semibold hover:text-teal-700">Raw values (JSON)</DisclosureSummary>
        <div className="grid gap-x-3 @3xl:grid-cols-2">
          {findings.map((finding) => (
            <Json key={finding.key} label="Recommended, as delivered" value={finding.recommended} />
          ))}
          {setting.holders.map((holder, index) => (
            <Json key={`${holder.policyId}:${index}`} label={`Current, ${holder.policyName}`} value={holder.current.raw} />
          ))}
        </div>
      </details>
      {(exception || setting.result === "Fail") && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {exception && <ExceptionBadge exception={exception} />}
          {setting.result === "Fail" && (
            <Button
              size="sm"
              variant="ghost"
              icon={ShieldOff}
              className="-ml-2"
              aria-label={`${exception ? "Change the exception" : "Add an exception"} for ${setting.name}`}
              onClick={() => onAddException(setting.settingId)}
            >
              {exception ? "Change exception" : "Add exception"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function RowDetail({
  row,
  assessment,
  exceptions,
  onAddException,
}: {
  row: ReviewRow;
  assessment: BenchmarkAssessmentView;
  exceptions: ReadonlyMap<string, BenchmarkException>;
  onAddException: (settingId: string) => void;
}) {
  const details = useMemo(() => resultSettingDetails(assessment, row.item), [assessment, row.item]);
  const next = useMemo(() => nextStepText(assessment.fixPlan, row.item), [assessment.fixPlan, row.item]);
  const findings = new Map(row.findings.map((finding) => [finding.key, finding]));
  const reason = row.reason ? REASON_LABELS[row.reason] : undefined;
  return (
    <div className="border-petrol-950/6 bg-surface/60 space-y-3 border-t px-4 pt-3 pb-4 @xl:px-5">
      {reason && <p className="text-petrol-700 text-xs leading-5">{reason}</p>}
      {next && (
        <p className="flex items-start gap-2 rounded-xl border border-teal-600/20 bg-teal-50 px-3 py-2.5 text-xs leading-5">
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
          <span className="text-petrol-800 min-w-0 break-words">
            <span className="text-petrol-950 font-semibold">Next step: </span>
            {next}
          </span>
        </p>
      )}
      {row.context && <p className="text-petrol-600 text-[11px]">Pack policy: {row.context}</p>}
      {details.length === 0 ? (
        <p className="text-petrol-600 text-xs">The pack names no setting for this recommendation.</p>
      ) : (
        <ul className="space-y-2.5" aria-label="Settings">
          {details.map((setting, index) => (
            <SettingDetail
              key={setting.settingId}
              setting={setting}
              findings={(row.settings[index]?.findingKeys ?? [])
                .map((key) => findings.get(key))
                .filter((finding): finding is SettingFinding => Boolean(finding))}
              rowReason={reason}
              rowLabel={details.length === 1 ? row.label : null}
              exception={exceptions.get(setting.settingId)}
              onAddException={onAddException}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// The review list with filters by state and Level, a search over names, ids
// and setting ids, an order (most severe first or by id), and an optional
// narrowing to the results of one fix plan step.
export function RecommendationList({
  rows,
  basis,
  assessment,
  exceptions,
  request,
  step,
  onClearStep,
  onAddException,
}: {
  rows: readonly ReviewRow[];
  basis: "recommendations" | "settings" | "mixed";
  assessment: BenchmarkAssessmentView;
  exceptions: readonly BenchmarkException[];
  request: ListRequest | null;
  // The fix plan step the list is narrowed to, with the result keys it covers.
  step: { label: string; note: string; keys: ReadonlySet<string> } | null;
  onClearStep: () => void;
  onAddException: (settingId: string) => void;
}) {
  const [state, setState] = useState<StateFilter>("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<RowOrder>("severity");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const section = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const search = useDebouncedValue(query, 150);
  const levels = useMemo(() => [...new Set(rows.map((row) => row.level))].sort((a, b) => a - b), [rows]);
  const byExceptions = useMemo(
    () => new Map(exceptions.map((exception) => [exception.settingId, exception])),
    [exceptions],
  );
  const ordered = useMemo(() => sortRows(rows, order), [rows, order]);
  const scoped = useMemo(
    () => filterRows(ordered, { state: "all", level, query: search, keys: step?.keys ?? null }),
    [ordered, level, search, step],
  );
  const counts = useMemo(() => stateCountsOf(scoped), [scoped]);
  const visible = useMemo(() => (state === "all" ? scoped : scoped.filter((row) => row.state === state)), [
    scoped,
    state,
  ]);
  useEffect(() => setLimit(PAGE_SIZE), [state, level, search, rows, step, order]);

  useEffect(() => {
    if (!request) return;
    setState(request.state);
    setLevel(request.level);
    setQuery("");
    section.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [request]);
  useEffect(() => {
    if (step) section.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [step]);

  const filtered = state !== "all" || level !== "all" || search.trim() !== "" || step !== null;
  const noun = basis === "recommendations" ? "recommendation" : basis === "settings" ? "setting" : "result";
  const clear = () => {
    setState("all");
    setLevel("all");
    setQuery("");
    onClearStep();
  };
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const states = ROW_STATES.filter((item) => item !== "notConfigured" || rows.some((row) => row.state === item));

  return (
    <section ref={section} aria-labelledby="benchmark-list-title" className="scroll-mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h2 id="benchmark-list-title" className="text-petrol-950 text-base font-semibold tracking-[-0.01em]">
          {basis === "recommendations" ? "Recommendations" : basis === "settings" ? "Settings" : "Results"}
          <span className="bg-mint-100 text-petrol-700 ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-bold tabular-nums">
            {filtered
              ? `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()}`
              : rows.length.toLocaleString()}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="benchmark-order" className="text-petrol-700 text-xs font-semibold">
            Sort
          </label>
          <select
            id="benchmark-order"
            value={order}
            onChange={(event) => setOrder(event.target.value as RowOrder)}
            className="border-petrol-950/12 text-petrol-950 min-h-9 cursor-pointer rounded-xl border bg-white px-2.5 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="severity">Most severe first</option>
            <option value="id">By id</option>
          </select>
        </div>
      </div>

      <div className="relative">
        <Search
          className="text-petrol-600 pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <label htmlFor="benchmark-search" className="sr-only">
          Search by name or id
        </label>
        <input
          ref={input}
          id="benchmark-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Search by name or id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          className="border-petrol-950/12 text-petrol-950 placeholder:text-petrol-600 min-h-11 w-full rounded-xl border bg-white py-2.5 pr-11 pl-10 text-sm transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {step && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-600/20 bg-teal-50 px-3 py-2">
          <p className="text-petrol-800 min-w-0 flex-1 text-xs leading-5">
            <span className="font-semibold">Fix plan, {step.label}.</span> {step.note}
          </p>
          <Button size="sm" variant="ghost" icon={X} onClick={onClearStep}>
            Show all
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="text-petrol-600 float-left mr-1.5 text-[11px] font-bold tracking-[0.14em] uppercase">
            Result
          </legend>
          <FilterChip active={state === "all"} label="All" count={scoped.length} onClick={() => setState("all")} />
          {states.map((item) => (
            <FilterChip
              key={item}
              active={state === item}
              label={STATE_LABELS[item]}
              count={counts[item]}
              onClick={() => setState(state === item ? "all" : item)}
            />
          ))}
        </fieldset>
        {levels.length > 1 && (
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="text-petrol-600 float-left mr-1.5 text-[11px] font-bold tracking-[0.14em] uppercase">
              Level
            </legend>
            <FilterChip active={level === "all"} label="All" onClick={() => setLevel("all")} />
            {levels.map((item: BenchmarkLevel) => (
              <FilterChip
                key={item}
                active={level === item}
                label={`Level ${item}`}
                onClick={() => setLevel(level === item ? "all" : item)}
              />
            ))}
          </fieldset>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={Search}
          title={`No ${noun}s in this comparison`}
          description="The delivered pack holds nothing that could be compared with the collection."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon={Search}
          title={`No ${noun} matches the filters`}
          description="Change the search or the filters to see more results."
          action={
            <Button size="sm" variant="secondary" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <ul
          className="space-y-2"
          aria-label={basis === "recommendations" ? "Recommendations" : basis === "settings" ? "Settings" : "Results"}
        >
          {visible.slice(0, limit).map((row) => {
            const open = expanded.has(row.key);
            const exception = row.settings
              .filter((setting) => setting.result === "Fail")
              .map((setting) => byExceptions.get(setting.id))
              .find(Boolean);
            const named = row.title !== row.id;
            return (
              <li
                key={row.key}
                className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white has-[>button:focus-visible]:ring-2 has-[>button:focus-visible]:ring-teal-600 has-[>button:focus-visible]:ring-offset-2"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(row.key)}
                  className="hover:bg-mint-50/40 flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left focus-visible:outline-none @xl:px-5"
                >
                  <ChevronDown
                    className={`text-petrol-600 mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                      open ? "" : "-rotate-90"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`text-petrol-950 block leading-5 ${
                        named ? "text-[13px] font-semibold break-words" : "font-mono text-xs font-medium break-all"
                      }`}
                    >
                      {row.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {named && (
                        <span className="font-mono text-[11px] font-semibold break-all text-teal-700">
                          <span className="sr-only">, </span>
                          {row.id}
                        </span>
                      )}
                      {levels.length > 1 && (
                        <span className="text-petrol-600 text-[11px] font-bold">Level {row.level}</span>
                      )}
                      {exception && <ExceptionBadge exception={exception} />}
                    </span>
                    {row.reason && !open && (
                      <span className="text-petrol-600 mt-0.5 block text-[11px] leading-4">
                        {REASON_LABELS[row.reason]}
                      </span>
                    )}
                  </span>
                  {/* A fixed column, so titles keep one width whatever the state. */}
                  <span className="flex w-32 shrink-0 justify-end">
                    <ResultChip result={row.result} label={row.label} />
                  </span>
                </button>
                {open && (
                  <RowDetail
                    row={row}
                    assessment={assessment}
                    exceptions={byExceptions}
                    onAddException={onAddException}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > limit && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <p className="text-petrol-600 text-xs tabular-nums">
            Showing {limit.toLocaleString()} of {visible.length.toLocaleString()}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, visible.length - limit).toLocaleString()} more
          </Button>
        </div>
      )}
    </section>
  );
}
