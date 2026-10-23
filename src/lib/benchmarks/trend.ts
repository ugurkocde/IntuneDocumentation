/**
 * Benchmark trend from stored runs, rewritten from TenuVault (cis-trend.ts)
 * against StoredBenchmarkRun: the rate of every point is the headline of its
 * run (Pass / (Pass + Fail)), and a point is compared only with the previous
 * run of the same benchmark, version and Level that assessed the same pack.
 * Exceptions are not part of the trend, so adding or removing one neither
 * raises nor hides drift.
 */
import type { BenchmarkLevel, ResultCounts } from "./assessment";
import { storedRunHeadline, type StoredBenchmarkRun } from "./history";

export interface TrendPoint {
  benchmark: string;
  version: string;
  level: BenchmarkLevel;
  assessedAt: string;
  basis: StoredBenchmarkRun["basis"];
  rate: number | null;
  counts: ResultCounts;
  /** first of its series, pack changed (or another basis), or compared with the previous point. */
  comparison: "first" | "pack-changed" | "compared";
  /** Change of the rate from the compared point; null when not compared or a rate is null. */
  change: number | null;
}

export interface DriftEntry {
  benchmark: string;
  version: string;
  level: BenchmarkLevel;
  previousRate: number;
  currentRate: number;
  previousAssessedAt: string;
  assessedAt: string;
  kind: "decline" | "below-bar";
}

function timeOf(run: Pick<StoredBenchmarkRun, "assessedAt">): number {
  const time = Date.parse(run.assessedAt);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** The one order of stored runs every view uses, oldest first: by time, then by pack digest. */
export function compareRuns(
  a: StoredBenchmarkRun,
  b: StoredBenchmarkRun,
): number {
  return (
    timeOf(a) - timeOf(b) ||
    a.packDigest.localeCompare(b.packDigest) ||
    a.level - b.level
  );
}

const seriesKey = (
  run: Pick<StoredBenchmarkRun, "benchmark" | "version" | "level">,
) => JSON.stringify([run.benchmark, run.version, run.level]);

/** Trend points oldest first; the input is not changed. */
export function benchmarkTrend(
  runs: readonly StoredBenchmarkRun[],
): TrendPoint[] {
  const sorted = [...runs].sort(compareRuns);
  const previous = new Map<string, TrendPoint & { packDigest: string }>();
  return sorted.map((run) => {
    const { counts, rate } = storedRunHeadline(run);
    const key = seriesKey(run);
    const before = previous.get(key);
    const comparison: TrendPoint["comparison"] = !before
      ? "first"
      : before.packDigest === run.packDigest && before.basis === run.basis
        ? "compared"
        : "pack-changed";
    const point: TrendPoint = {
      benchmark: run.benchmark,
      version: run.version,
      level: run.level,
      assessedAt: run.assessedAt,
      basis: run.basis,
      rate,
      counts,
      comparison,
      change:
        comparison === "compared" && before!.rate !== null && rate !== null
          ? rate - before!.rate
          : null,
    };
    previous.set(key, { ...point, packDigest: run.packDigest });
    return point;
  });
}

/**
 * Drift in the newest point of each benchmark, version and Level, compared
 * with the point before it in the same series: the rate dropped by at least 5
 * percentage points, or crossed from at least 0.90 to below 0.90 (below-bar
 * wins when both apply). A changed pack or a null rate never raises drift.
 */
export function driftSignals(points: readonly TrendPoint[]): DriftEntry[] {
  const series = new Map<string, TrendPoint[]>();
  for (const point of points)
    series.set(seriesKey(point), [
      ...(series.get(seriesKey(point)) ?? []),
      point,
    ]);
  const entries: DriftEntry[] = [];
  for (const list of series.values()) {
    const current = list[list.length - 1]!;
    const before = list[list.length - 2];
    if (
      !before ||
      current.comparison !== "compared" ||
      current.rate === null ||
      before.rate === null
    )
      continue;
    const belowBar = before.rate >= 0.9 && current.rate < 0.9;
    const decline = before.rate - current.rate >= 0.05 - 1e-9;
    if (!belowBar && !decline) continue;
    entries.push({
      benchmark: current.benchmark,
      version: current.version,
      level: current.level,
      previousRate: before.rate,
      currentRate: current.rate,
      previousAssessedAt: before.assessedAt,
      assessedAt: current.assessedAt,
      kind: belowBar ? "below-bar" : "decline",
    });
  }
  return entries;
}

/**
 * Runs of point indexes of one series that a sparkline may join: a run breaks
 * at a null rate and where a point was not compared with the one before it.
 */
export function sparklineSegments(points: readonly TrendPoint[]): number[][] {
  const segments: number[][] = [];
  let current: number[] = [];
  points.forEach((point, index) => {
    if (point.rate === null || point.comparison !== "compared") {
      if (current.length) segments.push(current);
      current = [];
    }
    if (point.rate !== null) current.push(index);
  });
  if (current.length) segments.push(current);
  return segments;
}

/** The change cell of a trend point: first run, pack changed, not available, or the change in percentage points. */
export function trendChangeText(
  point: Pick<TrendPoint, "comparison" | "change">,
): string {
  if (point.comparison === "first") return "First comparison";
  if (point.comparison === "pack-changed") return "Pack changed, not compared";
  if (point.change === null) return "Not available";
  const points = Math.round(point.change * 1000) / 10;
  return `${points >= 0 ? "+" : ""}${points.toFixed(1)} pp`;
}
