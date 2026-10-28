import { History, RefreshCw } from "lucide-react";
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
import { withMinusSign } from "../../lib/benchmarks-view";
import { errorMessage, ipc } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

// Points listed next to the sparkline, newest first.
const POINTS_SHOWN = 6;

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { timeStyle: "short" });
}

// A series is a benchmark, version and recommendation Level: the Level cards
// of a comparison, not the Level of the pack that was loaded.
const sameSeries =
  (identity: BenchmarkIdentity, level: BenchmarkLevel) =>
  (point: Pick<TrendPoint, "benchmark" | "version" | "level">) =>
    point.benchmark === identity.benchmark && point.version === identity.version && point.level === level;

// The table below holds the rates and their bases, so the alert only says
// what happened and since when.
function driftText(entry: DriftEntry): string {
  const since = `the comparison of ${formatDate(entry.previousAssessedAt)}`;
  return entry.kind === "below-bar"
    ? `The latest comparison is below 90%, down from ${since}.`
    : `The latest comparison is 5 points or more below ${since}.`;
}

const TH = "text-petrol-700 px-2 pb-1.5 text-[11px] font-semibold first:pl-0 last:pr-0";
const TD = "px-2 py-1.5 align-top first:pl-0 last:pr-0";

// The stored comparisons of one series, newest first: a table whose columns
// keep their width, with the base of the rate in its own columns.
function PointsTable({ points, label }: { points: readonly TrendPoint[]; label: string }) {
  const shown = [...points].reverse().slice(0, POINTS_SHOWN);
  return (
    <table className="w-full min-w-0 table-fixed border-collapse text-xs tabular-nums" aria-label={label}>
      <caption className="text-petrol-600 caption-bottom pt-2 text-left text-[11px] leading-4">
        Headline is Matches out of the assessed results (Matches, Differs and Not configured). Needs review and Not
        assessed are not counted.
        {points.length > POINTS_SHOWN ? ` The newest ${POINTS_SHOWN} of ${points.length} are shown.` : ""}
      </caption>
      <colgroup>
        <col />
        <col className="w-16" />
        <col className="w-[4.25rem]" />
        <col className="w-[3.75rem]" />
        <col className="w-24" />
      </colgroup>
      <thead>
        <tr className="border-petrol-950/6 border-b text-left">
          <th scope="col" className={TH}>
            Compared
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Headline
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Assessed
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Review
          </th>
          <th scope="col" className={`${TH} text-right`}>
            Change
          </th>
        </tr>
      </thead>
      <tbody className="divide-petrol-950/6 divide-y">
        {shown.map((point) => (
          <tr key={point.assessedAt} className="text-petrol-700">
            <td className={TD}>
              <span className="text-petrol-800 block break-words">{formatDate(point.assessedAt)}</span>
              <span className="text-petrol-600 block text-[11px]">{formatTime(point.assessedAt)}</span>
            </td>
            <td className={`${TD} text-petrol-950 text-right font-semibold`}>
              {point.rate === null ? "n/a" : formatRate(point.rate)}
            </td>
            <td className={`${TD} text-right`}>{(point.counts.pass + point.counts.fail).toLocaleString()}</td>
            <td className={`${TD} text-right`}>{point.counts.review.toLocaleString()}</td>
            <td className={`${TD} text-right`}>{withMinusSign(trendChangeText(point))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Joins the points of one series where they were compared with each other; a
// changed pack or a point without a rate breaks the line.
function Sparkline({ points }: { points: readonly TrendPoint[] }) {
  const width = 240;
  const height = 64;
  const x = (index: number) => (points.length === 1 ? width / 2 : 4 + (index * (width - 8)) / (points.length - 1));
  const y = (rate: number) => height - 6 - rate * (height - 12);
  const first = points[0]!;
  const last = points.at(-1)!;
  return (
    <figure className="w-60 max-w-full shrink-0">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full"
        role="img"
        aria-label={`Headline of the last ${points.length} stored comparisons, from ${formatDate(first.assessedAt)} to ${formatDate(last.assessedAt)}, oldest first. The dashed line marks 90%.`}
      >
        <line
          x1="0"
          x2={width}
          y1={y(0.9)}
          y2={y(0.9)}
          className="stroke-petrol-600/50"
          strokeDasharray="3 3"
        />
        {sparklineSegments(points).map((segment) => (
          <polyline
            key={segment.join("-")}
            points={segment.map((index) => `${x(index)},${y(points[index]!.rate!)}`).join(" ")}
            fill="none"
            className="stroke-teal-700"
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
      <figcaption className="text-petrol-600 mt-1 flex justify-between gap-2 text-[11px] tabular-nums" aria-hidden="true">
        <span>{formatDate(first.assessedAt)}</span>
        <span>Dashed line: 90%</span>
        <span>{formatDate(last.assessedAt)}</span>
      </figcaption>
    </figure>
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
          <p className="text-petrol-600 text-[11px] font-bold tracking-[0.14em] uppercase">History</p>
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
                    {driftText(entry)}
                  </Alert>
                ))}
                {points.length === 0 ? (
                  <p className="text-petrol-600 text-xs">
                    No comparison of this benchmark, version and Level is stored yet.
                  </p>
                ) : (
                  <div className="grid gap-x-6 gap-y-3 @4xl:grid-cols-[auto_minmax(0,1fr)] @4xl:items-start">
                    <Sparkline points={points} />
                    <PointsTable
                      points={points}
                      label={several ? `Stored comparisons, Level ${level}` : "Stored comparisons"}
                    />
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
