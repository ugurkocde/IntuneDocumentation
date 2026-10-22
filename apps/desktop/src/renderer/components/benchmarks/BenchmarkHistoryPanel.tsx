import { History, RefreshCw, TrendingDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatRate } from "../../../../../../src/lib/benchmarks/display";
import { sparklineSegments, trendChangeText } from "../../../../../../src/lib/benchmarks/trend";
import type {
  BenchmarkHistoryView,
  BenchmarkIdentity,
  BenchmarkLevel,
  BenchmarkRunRecord,
  DriftEntry,
  TrendPoint,
} from "../../../shared/ipc-types";
import { errorMessage, ipc } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

// Points listed under the sparkline, newest first.
const POINTS_SHOWN = 6;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// A series is a benchmark, version and recommendation Level: the Level cards
// of a comparison, not the Level of the pack that was loaded.
const sameSeries =
  (identity: BenchmarkIdentity, level: BenchmarkLevel) =>
  (point: Pick<TrendPoint, "benchmark" | "version" | "level">) =>
    point.benchmark === identity.benchmark && point.version === identity.version && point.level === level;

function driftText(entry: DriftEntry): string {
  const change =
    `from ${formatRate(entry.previousRate)} to ${formatRate(entry.currentRate)} ` +
    `since the comparison of ${formatDate(entry.previousAssessedAt)}`;
  return entry.kind === "below-bar"
    ? `The headline fell below 90%, ${change}.`
    : `The headline fell by 5 points or more, ${change}.`;
}

// Joins the points of one series where they were compared with each other; a
// changed pack or a point without a rate breaks the line.
function Sparkline({ points }: { points: readonly TrendPoint[] }) {
  const width = 240;
  const height = 48;
  const x = (index: number) => (points.length === 1 ? width / 2 : 4 + (index * (width - 8)) / (points.length - 1));
  const y = (rate: number) => height - 4 - rate * (height - 8);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="max-w-full shrink-0"
      role="img"
      aria-label={`Headline of the last ${points.length} stored comparisons`}
    >
      <line x1="0" x2={width} y1={y(0.9)} y2={y(0.9)} className="stroke-mint-100" strokeDasharray="3 3" />
      {sparklineSegments(points).map((segment) => (
        <polyline
          key={segment.join("-")}
          points={segment.map((index) => `${x(index)},${y(points[index]!.rate!)}`).join(" ")}
          fill="none"
          className="stroke-teal-600"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      ))}
      {points.map((point, index) =>
        point.rate === null ? null : (
          <circle key={index} cx={x(index)} cy={y(point.rate)} r="2.5" className="fill-teal-700" />
        ),
      )}
    </svg>
  );
}

// Trend and drift of each Level of the compared benchmark and version from
// the runs stored with the snapshots, one series per Level card. Shows why
// when history is off or unavailable, or when this comparison was not stored.
export function BenchmarkHistoryPanel({
  identity,
  levels,
  assessedAt,
  record,
  onOpenHistory,
}: {
  identity: BenchmarkIdentity;
  // The Levels the comparison shows, as the Level cards.
  levels: readonly BenchmarkLevel[];
  // A new comparison may have stored new runs.
  assessedAt: string;
  // Whether this comparison was stored, and why not.
  record?: BenchmarkRunRecord;
  onOpenHistory: () => void;
}) {
  const [view, setView] = useState<BenchmarkHistoryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const requestId = useRef(0);
  const key = JSON.stringify([identity.benchmark, identity.version, identity.level, assessedAt]);

  useEffect(() => ipc.onHistoryChanged(() => setReload((value) => value + 1)), []);

  useEffect(() => {
    const id = ++requestId.current;
    setError(null);
    ipc
      .benchmarksHistory(identity)
      .then((next) => {
        if (id === requestId.current) setView(next);
      })
      .catch((caught) => {
        if (id === requestId.current) setError(errorMessage(caught));
      });
    // identity is represented by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);

  const series = levels.map((level) => ({
    level,
    points: view?.trend.filter(sameSeries(identity, level)) ?? [],
    drift: view?.drift.filter(sameSeries(identity, level)) ?? [],
  }));
  const several = levels.length > 1;

  return (
    <section
      aria-labelledby="benchmark-history-title"
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <History className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">History</p>
          <h2 id="benchmark-history-title" className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
            {several ? "Trend of this benchmark and version per Level" : "Trend of this benchmark, version and Level"}
          </h2>
          <p className="text-petrol-600 mt-1 max-w-2xl text-xs leading-5">
            Each stored comparison keeps ids and results only. Points are compared only when they used the same
            pack; exceptions are not part of the trend.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {error ? (
          <Alert
            tone="danger"
            title="The history could not be loaded"
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setReload((value) => value + 1)}>
                Try again
              </Button>
            }
          >
            {error}
          </Alert>
        ) : !view ? (
          <p className="text-petrol-600 flex items-center gap-2 text-xs" role="status">
            <Spinner className="h-3.5 w-3.5" /> Loading the history
          </p>
        ) : !view.available ? (
          <Alert tone="info" title="History is not available on this computer">
            {view.reason ?? "Stored comparisons cannot be read here."}
          </Alert>
        ) : (
          <>
            {!view.enabled && (
              <Alert
                tone="info"
                title="Keep history is off"
                action={
                  <Button size="sm" variant="secondary" icon={History} onClick={onOpenHistory}>
                    Open History
                  </Button>
                }
              >
                Comparisons are stored with the snapshots only while Keep history on this computer is on.
                {view.reason ? ` ${view.reason}` : ""}
              </Alert>
            )}
            {record && !record.recorded && view.enabled && (
              <Alert tone="warning" title="This comparison was not stored">
                {record.reason ?? "It could not be stored in history."}
              </Alert>
            )}
            {series.map(({ level, points, drift }) => (
              <div key={level} className="space-y-3">
                {several && <h3 className="text-petrol-950 text-[13px] font-semibold">Level {level}</h3>}
                {drift.map((entry) => (
                  <Alert
                    key={`${entry.kind}-${entry.assessedAt}`}
                    tone="warning"
                    title={entry.kind === "below-bar" ? "Below 90%" : "The headline dropped"}
                  >
                    <span className="inline-flex items-start gap-1.5">
                      <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {driftText(entry)}
                    </span>
                  </Alert>
                ))}
                {points.length === 0 ? (
                  <p className="text-petrol-600 text-xs">
                    No comparison of this benchmark, version and Level is stored yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                    <Sparkline points={points} />
                    <ol
                      className="min-w-0 flex-1 basis-64 space-y-1.5"
                      aria-label={several ? `Stored comparisons, Level ${level}` : "Stored comparisons"}
                    >
                      {[...points]
                        .reverse()
                        .slice(0, POINTS_SHOWN)
                        .map((point) => (
                          <li
                            key={point.assessedAt}
                            className="text-petrol-700 flex flex-wrap items-baseline gap-x-3 text-xs tabular-nums"
                          >
                            <span className="text-petrol-600 min-w-36">{formatDate(point.assessedAt)}</span>
                            <span className="text-petrol-950 font-semibold">
                              {point.rate === null ? "n/a" : formatRate(point.rate)}
                            </span>
                            <span>{trendChangeText(point)}</span>
                          </li>
                        ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
