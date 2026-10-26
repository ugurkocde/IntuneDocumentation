import { Check, ChevronDown, Search, ShieldOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Observation, ResultState, SettingFinding } from "../../../../../../src/lib/benchmarks/assessment";
import {
  REASON_LABELS,
  RESULT_LABELS,
  matchingPolicies,
  observationLabel,
  settingStatusText,
} from "../../../../../../src/lib/benchmarks/display";
import type { BenchmarkLevel } from "../../../shared/ipc-types";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import {
  RESULT_ORDER,
  filterRows,
  resultCounts,
  type LevelFilter,
  type ResultFilter,
  type ReviewRow,
} from "../../lib/benchmarks-view";
import { Button } from "../ui/Button";
import { DisclosureSummary } from "../ui/DisclosureSummary";
import { EmptyState } from "../ui/EmptyState";
import { ResultChip } from "./LevelHeadlines";

// Rows rendered at once; large packs show more on request.
export const PAGE_SIZE = 100;

const ASSIGNMENT_LABELS: Record<Observation["assignment"], string> = {
  assigned: "Assigned",
  notAssigned: "Not assigned",
  unknown: "Assignment unknown",
};

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
      className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
        active
          ? "border-teal-600/40 bg-teal-50 text-teal-800"
          : "border-petrol-950/10 text-petrol-700 hover:bg-mint-50 bg-white"
      }`}
    >
      {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
      {count !== undefined && <span className="text-petrol-600 font-medium tabular-nums">{count.toLocaleString()}</span>}
    </button>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="selectable bg-surface border-petrol-950/6 text-petrol-800 mt-1.5 max-h-56 overflow-auto rounded-lg border p-2.5 font-mono text-[10px] leading-4 break-all whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

// The policies holding the root of a finding, each judged on the displayed
// setting (observationLabel, as the PDF), never on the whole root: a nested
// setting that matches next to a differing sibling reads Matches.
function FindingDetail({ finding, settingId }: { finding: SettingFinding; settingId: string }) {
  return (
    <div className="mt-2 space-y-2">
      {finding.observations.length === 0 ? (
        <p className="text-petrol-600 text-[11px]">No collected policy holds this setting.</p>
      ) : (
        <ul className="space-y-1.5" aria-label="Policies holding this setting">
          {finding.observations.map((observation, index) => (
            <li
              key={`${observation.policyId}:${index}`}
              className="text-petrol-700 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4"
            >
              <span className="text-petrol-950 min-w-0 font-semibold break-words">{observation.policyName}</span>
              <span className="bg-mint-100 text-petrol-700 rounded-full px-2 py-0.5 text-[10px] font-bold">
                {ASSIGNMENT_LABELS[observation.assignment]}
              </span>
              <span className="text-petrol-600">{observationLabel(finding, observation, settingId)}</span>
            </li>
          ))}
        </ul>
      )}
      <details className="text-petrol-700 text-[11px]">
        <DisclosureSummary className="font-semibold hover:text-teal-700">Recommended value</DisclosureSummary>
        <Json value={finding.recommended} />
      </details>
    </div>
  );
}

function RowDetail({ row, onAddException }: { row: ReviewRow; onAddException: (settingId: string) => void }) {
  const findings = new Map(row.findings.map((finding) => [finding.key, finding]));
  return (
    <div className="border-petrol-950/6 space-y-3 border-t px-4 pt-3 pb-4 @xl:px-5">
      {row.reason && <p className="text-petrol-700 text-xs leading-5">{REASON_LABELS[row.reason]}</p>}
      {row.context && <p className="text-petrol-600 text-[11px]">Pack policy: {row.context}</p>}
      {row.settings.length === 0 ? (
        <p className="text-petrol-600 text-xs">The pack names no setting for this recommendation.</p>
      ) : (
        <ul className="space-y-2.5" aria-label="Settings">
          {row.settings.map((setting) => (
            <li key={setting.id} className="border-petrol-950/6 rounded-xl border bg-white p-3">
              <div className="flex flex-wrap items-start gap-2">
                <code className="selectable text-petrol-950 min-w-0 flex-1 basis-64 font-mono text-[11px] leading-4 break-all">
                  {setting.id}
                </code>
                <ResultChip
                  result={setting.result}
                  label={settingStatusText(
                    setting,
                    matchingPolicies(
                      setting.findingKeys
                        .map((key) => findings.get(key))
                        .filter((finding): finding is SettingFinding => Boolean(finding)),
                      setting.id,
                    ),
                  )}
                />
              </div>
              {setting.reason && setting.reason !== row.reason && (
                <p className="text-petrol-600 mt-1.5 text-[11px] leading-4">{REASON_LABELS[setting.reason]}</p>
              )}
              {setting.findingKeys
                .map((key) => findings.get(key))
                .filter((finding): finding is SettingFinding => Boolean(finding))
                .map((finding) => (
                  <FindingDetail key={finding.key} finding={finding} settingId={setting.id} />
                ))}
              {setting.result === "Fail" && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ShieldOff}
                  className="mt-2 -ml-2"
                  aria-label={`Add an exception for ${setting.id}`}
                  onClick={() => onAddException(setting.id)}
                >
                  Add exception
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The review list with filters by result and Level and a search over ids,
// titles and setting ids.
export function RecommendationList({
  rows,
  basis,
  onAddException,
}: {
  rows: readonly ReviewRow[];
  basis: "recommendations" | "settings";
  onAddException: (settingId: string) => void;
}) {
  const [result, setResult] = useState<ResultFilter>("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const search = useDebouncedValue(query, 150);
  const levels = useMemo(() => [...new Set(rows.map((row) => row.level))].sort((a, b) => a - b), [rows]);
  const scoped = useMemo(() => filterRows(rows, { result: "all", level, query: search }), [rows, level, search]);
  const counts = useMemo(() => resultCounts(scoped), [scoped]);
  const visible = useMemo(() => (result === "all" ? scoped : scoped.filter((row) => row.result === result)), [
    scoped,
    result,
  ]);
  useEffect(() => setLimit(PAGE_SIZE), [result, level, search, rows]);
  const filtered = result !== "all" || level !== "all" || search.trim() !== "";
  const noun = basis === "recommendations" ? "recommendation" : "setting";
  const clear = () => {
    setResult("all");
    setLevel("all");
    setQuery("");
  };
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section aria-labelledby="benchmark-list-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <h2 id="benchmark-list-title" className="text-petrol-950 text-base font-semibold tracking-[-0.01em]">
          {basis === "recommendations" ? "Recommendations" : "Settings"}
          <span className="bg-mint-100 text-petrol-700 ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-bold tabular-nums">
            {filtered
              ? `${visible.length.toLocaleString()} of ${rows.length.toLocaleString()}`
              : rows.length.toLocaleString()}
          </span>
        </h2>
      </div>

      <div className="relative">
        <Search
          className="text-petrol-600 pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <label htmlFor="benchmark-search" className="sr-only">
          Search by id, title or setting id
        </label>
        <input
          ref={input}
          id="benchmark-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Search by id, title or setting id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              setQuery("");
            }
          }}
          className="border-petrol-950/8 text-petrol-950 placeholder:text-petrol-600/70 min-h-11 w-full rounded-xl border bg-white py-2.5 pr-11 pl-10 text-sm transition-[border-color,box-shadow] focus-visible:border-teal-600/40 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              input.current?.focus();
            }}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="text-petrol-600 float-left mr-1.5 text-[10px] font-bold tracking-[0.14em] uppercase">
            Result
          </legend>
          <FilterChip active={result === "all"} label="All" count={scoped.length} onClick={() => setResult("all")} />
          {RESULT_ORDER.map((state: ResultState) => (
            <FilterChip
              key={state}
              active={result === state}
              label={RESULT_LABELS[state]}
              count={counts[state]}
              onClick={() => setResult(result === state ? "all" : state)}
            />
          ))}
        </fieldset>
        {levels.length > 1 && (
          <fieldset className="flex flex-wrap items-center gap-1.5">
            <legend className="text-petrol-600 float-left mr-1.5 text-[10px] font-bold tracking-[0.14em] uppercase">
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
        <ul className="space-y-2" aria-label={basis === "recommendations" ? "Recommendations" : "Settings"}>
          {visible.slice(0, limit).map((row) => {
            const open = expanded.has(row.key);
            return (
              <li key={row.key} className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(row.key)}
                  className="hover:bg-mint-50/40 flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset @xl:px-5"
                >
                  <ChevronDown
                    className={`text-petrol-600 mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
                      open ? "" : "-rotate-90"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {basis === "recommendations" && (
                        <span className="font-mono text-[11px] font-semibold text-teal-700">{row.id}</span>
                      )}
                      {levels.length > 1 && (
                        <span className="text-petrol-600 text-[10px] font-bold">Level {row.level}</span>
                      )}
                    </span>
                    <span
                      className={`text-petrol-950 mt-0.5 block text-[13px] leading-5 font-semibold ${
                        basis === "settings" ? "font-mono text-[11px] break-all" : "break-words"
                      }`}
                    >
                      {row.title}
                    </span>
                    {row.reason && !open && (
                      <span className="text-petrol-600 mt-0.5 block text-[11px] leading-4">
                        {REASON_LABELS[row.reason]}
                      </span>
                    )}
                  </span>
                  <ResultChip result={row.result} />
                </button>
                {open && <RowDetail row={row} onAddException={onAddException} />}
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
