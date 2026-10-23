import { Building2, RefreshCw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { benchmarkDisplayName, formatRate } from "../../../../../../src/lib/benchmarks/display";
import type { BenchmarkPortfolioRequest, BenchmarkPortfolioView } from "../../../shared/ipc-types";
import { errorMessage, ipc } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const choiceKey = (choice: BenchmarkPortfolioRequest) => JSON.stringify([choice.benchmark, choice.version]);

function formatDate(value: string | null): string {
  if (!value) return "No stored comparison";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

// MSP plan only: the newest stored headline per Level of every tenant on this
// computer for one benchmark and version. Built from stored runs, so it holds
// ids and results only; names come from the catalog when it is loaded.
export function BenchmarkPortfolioPanel({ nameOf }: { nameOf: (benchmark: string) => string | undefined }) {
  const [view, setView] = useState<BenchmarkPortfolioView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<BenchmarkPortfolioRequest | null>(null);
  const [reload, setReload] = useState(0);
  const requestId = useRef(0);
  const selectId = useId();
  const key = chosen ? choiceKey(chosen) : "";

  useEffect(() => ipc.onHistoryChanged(() => setReload((value) => value + 1)), []);

  useEffect(() => {
    const id = ++requestId.current;
    setError(null);
    ipc
      .benchmarksPortfolio(chosen ?? undefined)
      .then((next) => {
        if (id === requestId.current) setView(next);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(errorMessage(caught));
      });
    // chosen is represented by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);

  const label = (choice: BenchmarkPortfolioRequest) =>
    `${nameOf(choice.benchmark) ?? benchmarkDisplayName(choice.benchmark)} ${choice.version}`;
  const levels = [...new Set(view?.rows.flatMap((row) => row.levels.map((level) => level.level)) ?? [])].sort(
    (a, b) => a - b,
  );

  return (
    <section
      aria-labelledby="benchmark-portfolio-title"
      className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 @xl:px-6">
        <div className="flex min-w-0 flex-1 basis-72 items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Building2 className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Portfolio</p>
            <h2
              id="benchmark-portfolio-title"
              className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]"
            >
              Tenants on this computer
            </h2>
            <p className="text-petrol-600 mt-1 text-xs leading-5">
              The newest stored headline per Level of each tenant. Readiness comparison, not a certification.
            </p>
          </div>
        </div>
        {view && view.benchmarks.length > 0 && view.selected && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="text-petrol-700 text-xs font-semibold">
              Benchmark
            </label>
            <select
              id={selectId}
              value={choiceKey(view.selected)}
              onChange={(event) => {
                const [benchmark, version] = JSON.parse(event.target.value) as [string, string];
                setChosen({ benchmark, version });
              }}
              className="border-petrol-950/12 text-petrol-950 min-h-9 max-w-full min-w-0 cursor-pointer rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              {view.benchmarks.map((item) => (
                <option key={choiceKey(item)} value={choiceKey(item)}>
                  {label(item)} ({item.tenants.toLocaleString()} {item.tenants === 1 ? "tenant" : "tenants"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="border-petrol-950/6 border-t">
        {error ? (
          <div className="p-5 @xl:px-6">
            <Alert
              tone="danger"
              title="The portfolio could not be loaded"
              action={
                <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setReload((value) => value + 1)}>
                  Try again
                </Button>
              }
            >
              {error}
            </Alert>
          </div>
        ) : !view ? (
          <p className="text-petrol-600 flex items-center gap-2 p-5 text-xs @xl:px-6" role="status">
            <Spinner className="h-3.5 w-3.5" /> Loading the portfolio
          </p>
        ) : !view.available ? (
          <p className="text-petrol-600 p-5 text-xs leading-5 @xl:px-6">
            {view.reason ?? "The portfolio is not available on this computer."}
          </p>
        ) : view.rows.length === 0 || !view.selected ? (
          <p className="text-petrol-600 p-5 text-xs leading-5 @xl:px-6">
            No tenant has a stored comparison yet. Comparisons are stored while Keep history on this computer is on.
          </p>
        ) : (
          <ul className="divide-petrol-950/6 divide-y" aria-label="Tenants">
            {view.rows.map((row) => (
              <li
                key={row.tenantId}
                aria-label={row.tenantName ?? row.tenantId}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 @xl:px-6"
              >
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-petrol-950 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
                    <span className="min-w-0 break-words">{row.tenantName ?? row.tenantId}</span>
                    {row.current && <Badge variant="info">Signed in</Badge>}
                  </p>
                  <p className="text-petrol-600 mt-0.5 text-[11px]">
                    {row.error
                      ? row.error
                      : row.otherBenchmark
                        ? "Stored comparisons of other benchmarks only"
                        : formatDate(row.assessedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {levels.map((level) => {
                    const entry = row.levels.find((item) => item.level === level);
                    return (
                      <div key={level} className="min-w-24 text-right tabular-nums">
                        <p className="text-petrol-600 text-[10px] font-bold tracking-[0.1em] uppercase">
                          Level {level}
                        </p>
                        <p className="text-petrol-950 text-sm font-semibold">
                          {!entry ? "Not run" : entry.rate === null ? "n/a" : formatRate(entry.rate)}
                        </p>
                        {entry && (
                          <p className="text-petrol-600 text-[10px]">
                            {entry.counts.pass.toLocaleString()} of{" "}
                            {(entry.counts.pass + entry.counts.fail).toLocaleString()}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
