import {
  assessmentResults,
  type BenchmarkAssessment,
  type LevelSummary,
  type ReasonCode,
  type RecommendationSettingResult,
  type ResultState,
  type SettingFinding,
} from "../../../../../src/lib/benchmarks/assessment";
import { bySeverity } from "../../../../../src/lib/benchmarks/display";
import { settingName } from "../../../../../src/lib/benchmarks/values";
import type {
  BenchmarkAssessmentView,
  BenchmarkCatalog,
  BenchmarkIdentity,
  BenchmarkLevel,
} from "../../shared/ipc-types";

// View helpers of the Benchmarks screen. Titles come from the delivered pack
// and live in this window's memory only.

export const RESULT_ORDER: readonly ResultState[] = ["Pass", "Fail", "Review", "Not assessed"];

const UNREADABLE = "The comparison result could not be read. Try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// benchmarks:assess returns the engine's BenchmarkAssessment as JSON. Anything
// without its lists is refused here instead of rendering a half empty review.
export function toAssessment(value: unknown): BenchmarkAssessmentView {
  if (
    !isRecord(value) ||
    typeof value.benchmark !== "string" ||
    typeof value.version !== "string" ||
    (value.level !== 1 && value.level !== 2) ||
    typeof value.assessedAt !== "string" ||
    !isRecord(value.collection) ||
    !Array.isArray(value.settings) ||
    !Array.isArray(value.recommendations) ||
    !Array.isArray(value.levels)
  ) {
    throw new Error(UNREADABLE);
  }
  return value as unknown as BenchmarkAssessmentView;
}

const numeric = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
// Newest version first.
const newest = (a: string, b: string) => numeric(b, a);

export interface CatalogChoice {
  id: string;
  name: string;
  versions: Array<{ version: string; levels: BenchmarkLevel[] }>;
}

// The catalog lists one entry per benchmark and version; the picker chooses a
// benchmark, then a version, then a Level.
export function catalogChoices(catalog: BenchmarkCatalog): CatalogChoice[] {
  const byId = new Map<string, CatalogChoice>();
  for (const entry of catalog.benchmarks) {
    const choice = byId.get(entry.id) ?? { id: entry.id, name: entry.name, versions: [] };
    if (!choice.versions.some((item) => item.version === entry.version)) {
      choice.versions.push({ version: entry.version, levels: [...new Set(entry.levels)].sort((a, b) => a - b) });
    }
    byId.set(entry.id, choice);
  }
  const choices = [...byId.values()];
  for (const choice of choices) choice.versions.sort((a, b) => newest(a.version, b.version));
  return choices.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// The selection kept valid against the catalog: the benchmark, version and
// Level asked for where they exist, the first available otherwise.
export function resolveSelection(
  choices: readonly CatalogChoice[],
  wanted: Partial<BenchmarkIdentity>,
): BenchmarkIdentity | null {
  const choice = choices.find((item) => item.id === wanted.benchmark) ?? choices[0];
  const version = choice?.versions.find((item) => item.version === wanted.version) ?? choice?.versions[0];
  if (!choice || !version || !version.levels.length) return null;
  const level = version.levels.includes(wanted.level as BenchmarkLevel) ? wanted.level! : version.levels[0]!;
  return { benchmark: choice.id, version: version.version, level };
}

// One row of the review list: a recommendation, or a pack setting when the
// pack carries no recommendations.
export interface ReviewRow {
  key: string;
  id: string;
  title: string;
  // The pack policy of a setting row.
  context: string | null;
  level: BenchmarkLevel;
  result: ResultState;
  reason?: ReasonCode;
  settings: RecommendationSettingResult[];
  findings: SettingFinding[];
}

// Rows of every Level shown (assessmentResults), most severe first
// (bySeverity: Differs and Not configured, Needs review, Not assessed,
// Matches; Level and id order within). A setting row is titled by the
// setting's display name where one is known, its id otherwise.
export function reviewRows(assessment: BenchmarkAssessment): ReviewRow[] {
  const findings = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  const found = (keys: readonly string[]) =>
    keys.map((key) => findings.get(key)).filter((finding): finding is SettingFinding => Boolean(finding));
  return assessmentResults(assessment)
    .map((item): ReviewRow => {
      if (item.kind === "recommendation")
        return {
          key: `r:${item.level}:${item.id}`,
          id: item.id,
          title: item.recommendation.title,
          context: null,
          level: item.level,
          result: item.result,
          ...(item.reason ? { reason: item.reason } : {}),
          settings: item.recommendation.settings,
          findings: found(item.recommendation.findingKeys),
        };
      const finding = item.finding;
      return {
        key: `s:${finding.key}`,
        id: finding.settingId,
        title: settingName(assessment.settingNames, finding.settingId),
        context: finding.policyName,
        level: item.level,
        result: finding.result,
        ...(finding.reason ? { reason: finding.reason } : {}),
        settings: [
          {
            id: finding.settingId,
            status: finding.status,
            result: finding.result,
            ...(finding.reason ? { reason: finding.reason } : {}),
            findingKeys: [finding.key],
          },
        ],
        findings: [finding],
      };
    })
    .sort(bySeverity);
}

export type ResultFilter = ResultState | "all";
export type LevelFilter = BenchmarkLevel | "all";

export function matchesQuery(row: ReviewRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.id, row.title, row.context ?? "", ...row.settings.map((setting) => setting.id)].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

export function filterRows(
  rows: readonly ReviewRow[],
  filter: { result: ResultFilter; level: LevelFilter; query: string },
): ReviewRow[] {
  return rows.filter(
    (row) =>
      (filter.result === "all" || row.result === filter.result) &&
      (filter.level === "all" || row.level === filter.level) &&
      matchesQuery(row, filter.query),
  );
}

export function resultCounts(rows: readonly ReviewRow[]): Record<ResultState, number> {
  const counts: Record<ResultState, number> = { Pass: 0, Fail: 0, Review: 0, "Not assessed": 0 };
  for (const row of rows) counts[row.result] += 1;
  return counts;
}

// Why rows of one result are outside the headline, most frequent first. Rows
// without a reason code are counted under null.
export function reasonCounts(
  rows: readonly ReviewRow[],
  result: ResultState,
): Array<{ reason: ReasonCode | null; count: number }> {
  const counts = new Map<ReasonCode | null, number>();
  for (const row of rows) {
    if (row.result !== result) continue;
    const reason = row.reason ?? null;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || String(a.reason).localeCompare(String(b.reason)));
}

// Recommendations of a Level that were assessed, for levelCheckSummary.
export function assessedCount(rows: readonly ReviewRow[], level: LevelSummary["level"]): number {
  return rows.filter((row) => row.level === level && row.result !== "Not assessed").length;
}

// The Levels the results show, for the review header: "Level 1" or
// "Levels 1 and 2". The compared Level when no Level has results.
export { levelsLabel } from "../../../../../src/lib/benchmarks/display";

// Drafts are generated only for Missing settings of a complete collection.
export function missingSettings(assessment: BenchmarkAssessment): number {
  if (!assessment.collection.complete) return 0;
  return new Set(
    assessment.settings.filter((finding) => finding.status === "Missing").map((finding) => finding.settingId),
  ).size;
}

// Setting ids whose result is Differs: the only results an exception credits.
// The headline looks exceptions up by the ids a recommendation checks, which
// may be nested children of a root, so recommendation mode offers those.
export function differingSettingIds(assessment: BenchmarkAssessment): string[] {
  const ids = assessmentResults(assessment)
    .filter((item) => item.result === "Fail")
    .flatMap((item) =>
      item.kind === "recommendation"
        ? item.recommendation.settings.filter((setting) => setting.result === "Fail").map((setting) => setting.id)
        : [item.finding.settingId],
    );
  return [...new Set(ids)].sort(numeric);
}
