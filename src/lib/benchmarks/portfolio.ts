/**
 * Benchmark portfolio across tenants from stored runs, rewritten from
 * TenuVault (cis-portfolio.ts). Each Level of a row comes from the tenant's
 * newest stored run of that benchmark, version and Level, in the order every
 * view uses (compareRuns). The portfolio is an MSP view: the caller gates it
 * on the plan before calling.
 */
import type { BenchmarkLevel, ResultCounts } from "./assessment";
import { storedRunHeadline, type StoredBenchmarkRun } from "./history";
import { compareRuns } from "./trend";

export interface PortfolioEntry {
  tenantId: string;
  tenantName?: string | null;
  runs?: readonly StoredBenchmarkRun[] | null;
  error?: string;
}

export interface PortfolioLevel {
  level: BenchmarkLevel;
  basis: StoredBenchmarkRun["basis"];
  rate: number | null;
  counts: ResultCounts;
  assessedAt: string;
}

export interface PortfolioRow {
  tenantId: string;
  tenantName: string | null;
  benchmark: string | null;
  version: string | null;
  /** Time of the newest run in the row. */
  assessedAt: string | null;
  levels: PortfolioLevel[];
  /** The tenant has stored runs, but none of the selected benchmark and version. */
  otherBenchmark?: boolean;
  error?: string;
}

export interface PortfolioBenchmark {
  benchmark: string;
  version: string;
  /** Tenants with at least one stored run of it. */
  tenants: number;
}

function dedupe(entries: readonly PortfolioEntry[]): PortfolioEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.tenantId.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Benchmarks and versions stored for the tenants, the one most tenants ran first, then the most recent. */
export function portfolioBenchmarks(
  entries: readonly PortfolioEntry[],
): PortfolioBenchmark[] {
  const found = new Map<string, PortfolioBenchmark & { newest: number }>();
  for (const entry of dedupe(entries)) {
    if (entry.error) continue;
    const counted = new Set<string>();
    for (const run of entry.runs ?? []) {
      const key = JSON.stringify([run.benchmark, run.version]);
      const current = found.get(key) ?? {
        benchmark: run.benchmark,
        version: run.version,
        tenants: 0,
        newest: Number.NEGATIVE_INFINITY,
      };
      if (!counted.has(key)) current.tenants += 1;
      counted.add(key);
      const time = Date.parse(run.assessedAt);
      if (Number.isFinite(time) && time > current.newest) current.newest = time;
      found.set(key, current);
    }
  }
  return [...found.values()]
    .sort(
      (a, b) =>
        b.tenants - a.tenants ||
        b.newest - a.newest ||
        a.benchmark.localeCompare(b.benchmark) ||
        a.version.localeCompare(b.version),
    )
    .map(({ newest: _newest, ...benchmark }) => benchmark);
}

function compareRate(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** Rates are only ranked on the same basis; recommendation rates come first. */
function compareLevel(a?: PortfolioLevel, b?: PortfolioLevel): number {
  const left = a?.rate ?? null;
  const right = b?.rate ?? null;
  if (left !== null && right !== null && a!.basis !== b!.basis)
    return a!.basis === "recommendations" ? -1 : 1;
  return compareRate(left, right);
}

/**
 * Portfolio rows comparing tenants on one benchmark and version, by default
 * the one most tenants ran. Tenants without a run of it show as not
 * assessed, below the assessed rows. The input is not changed.
 */
export function portfolioRows(
  entries: readonly PortfolioEntry[],
  selected: Pick<
    PortfolioBenchmark,
    "benchmark" | "version"
  > | null = portfolioBenchmarks(entries)[0] ?? null,
): PortfolioRow[] {
  const rows = dedupe(entries).map((entry): PortfolioRow => {
    const tenantName = entry.tenantName ?? null;
    const empty = {
      tenantId: entry.tenantId,
      tenantName,
      benchmark: null,
      version: null,
      assessedAt: null,
      levels: [],
    };
    if (entry.error) return { ...empty, error: entry.error };
    const all = entry.runs ?? [];
    const runs = selected
      ? all.filter(
          (run) =>
            run.benchmark === selected.benchmark &&
            run.version === selected.version,
        )
      : all;
    if (!runs.length)
      return { ...empty, ...(all.length ? { otherBenchmark: true } : {}) };
    const newest = runs.reduce((best, run) =>
      compareRuns(run, best) > 0 ? run : best,
    );
    const levels = ([1, 2] as const).flatMap((level) => {
      const own = runs.filter(
        (run) =>
          run.level === level &&
          run.benchmark === newest.benchmark &&
          run.version === newest.version,
      );
      if (!own.length) return [];
      const run = own.reduce((best, candidate) =>
        compareRuns(candidate, best) > 0 ? candidate : best,
      );
      const { counts, rate } = storedRunHeadline(run);
      return [
        { level, basis: run.basis, rate, counts, assessedAt: run.assessedAt },
      ];
    });
    return {
      tenantId: entry.tenantId,
      tenantName,
      benchmark: newest.benchmark,
      version: newest.version,
      assessedAt: newest.assessedAt,
      levels,
    };
  });
  const level = (row: PortfolioRow, value: BenchmarkLevel) =>
    row.levels.find((item) => item.level === value);
  const time = (row: PortfolioRow) => {
    const value = Date.parse(row.assessedAt ?? "");
    return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  };
  return rows.sort((a, b) => {
    const assessed =
      Number(b.assessedAt !== null) - Number(a.assessedAt !== null);
    if (assessed) return assessed;
    if (a.assessedAt !== null && b.assessedAt !== null) {
      const ranked =
        compareLevel(level(a, 1), level(b, 1)) ||
        compareLevel(level(a, 2), level(b, 2)) ||
        time(b) - time(a);
      if (ranked) return ranked;
    }
    return (
      (a.tenantName ?? a.tenantId).localeCompare(b.tenantName ?? b.tenantId) ||
      a.tenantId.localeCompare(b.tenantId)
    );
  });
}
