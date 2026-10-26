import {
  assessmentResults,
  isNotConfigured,
  type AssessmentResult,
  type BenchmarkAssessment,
  type HeadlineStates,
  type LevelSummary,
  type ReasonCode,
  type RecommendationSettingResult,
  type ResultState,
  type SettingFinding,
} from "../../../../../src/lib/benchmarks/assessment";
import { SEVERITY_ORDER, bySeverity, resultLabel } from "../../../../../src/lib/benchmarks/display";
import { settingName } from "../../../../../src/lib/benchmarks/values";
import type {
  BenchmarkAssessmentView,
  BenchmarkCatalog,
  BenchmarkIdentity,
  BenchmarkLevel,
} from "../../shared/ipc-types";

// View helpers of the Benchmarks screen. Titles come from the delivered pack
// and live in this window's memory only. Verdicts, labels and next steps come
// from the engine (src/lib/benchmarks); nothing here judges a result.

const UNREADABLE = "The comparison result could not be read. Try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// benchmarks:assess returns the engine's BenchmarkAssessment with its fix plan
// as JSON. Anything without its lists is refused here instead of rendering a
// half empty review.
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
    !Array.isArray(value.levels) ||
    !isRecord(value.fixPlan) ||
    !Array.isArray(value.fixPlan.actions) ||
    !isRecord(value.fixPlan.byResult)
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

// What people see of a result, as the headline counts it (HeadlineStates):
// Matches, Differs, Not configured, Needs review or Not assessed.
export type RowState = Exclude<keyof HeadlineStates, "assessed" | "total">;

const STATE_OF: Readonly<Record<ResultState, RowState>> = {
  Pass: "matches",
  Fail: "differs",
  Review: "needsReview",
  "Not assessed": "notAssessed",
};

// The order of the result filters and headline counts, as stateCounts lists the headline states.
export const ROW_STATES: readonly RowState[] = ["matches", "differs", "notConfigured", "needsReview", "notAssessed"];

// The engine's severity order (bySeverity), with Differs before Not
// configured inside the Differs result so the two stay grouped.
export function bySeverityState(a: ReviewRow, b: ReviewRow): number {
  return (
    SEVERITY_ORDER.indexOf(a.result) - SEVERITY_ORDER.indexOf(b.result) ||
    Number(a.state === "notConfigured") - Number(b.state === "notConfigured") ||
    bySeverity(a, b)
  );
}

// One row of the review list: a recommendation, or a pack setting when the
// pack carries no recommendations.
export interface ReviewRow {
  key: string;
  id: string;
  // The recommendation title, or the setting's display name (its id when no
  // definition names it).
  title: string;
  // The pack policy of a setting row.
  context: string | null;
  level: BenchmarkLevel;
  result: ResultState;
  reason?: ReasonCode;
  // The headline state and its label (resultLabel: Not configured for a
  // Differs result whose differing settings are all missing).
  state: RowState;
  label: string;
  settings: RecommendationSettingResult[];
  // Display names of the settings, for the search.
  settingNames: string[];
  findings: SettingFinding[];
  // The engine's result, for resultSettingDetails and nextStepText.
  item: AssessmentResult;
}

// Rows of every Level shown (assessmentResults), most severe first
// (bySeverityState: Differs, Not configured, Needs review, Not assessed,
// Matches; Level and id order within). A setting row is titled by the
// setting's display name where one is known, its id otherwise.
export function reviewRows(assessment: BenchmarkAssessment): ReviewRow[] {
  const findings = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  const found = (keys: readonly string[]) =>
    keys.map((key) => findings.get(key)).filter((finding): finding is SettingFinding => Boolean(finding));
  const names = (settings: readonly { id: string }[]) =>
    settings.map((setting) => settingName(assessment.settingNames, setting.id));
  return assessmentResults(assessment)
    .map((item): ReviewRow => {
      const shown = item.kind === "recommendation" ? item.recommendation : item.finding;
      const common = {
        key: item.key,
        id: item.id,
        level: item.level,
        result: item.result,
        ...(item.reason ? { reason: item.reason } : {}),
        state: isNotConfigured(shown) ? ("notConfigured" as const) : STATE_OF[item.result],
        label: resultLabel(shown),
        item,
      };
      if (item.kind === "recommendation")
        return {
          ...common,
          title: item.recommendation.title,
          context: null,
          settings: item.recommendation.settings,
          settingNames: names(item.recommendation.settings),
          findings: found(item.recommendation.findingKeys),
        };
      const finding = item.finding;
      const settings = [
        {
          id: finding.settingId,
          status: finding.status,
          result: finding.result,
          ...(finding.reason ? { reason: finding.reason } : {}),
          findingKeys: [finding.key],
        },
      ];
      return {
        ...common,
        title: settingName(assessment.settingNames, finding.settingId),
        context: finding.policyName,
        settings,
        settingNames: names(settings),
        findings: [finding],
      };
    })
    .sort(bySeverityState);
}

export type RowOrder = "severity" | "id";

// Rows by severity (as reviewRows returns them) or by id, numerically, then Level.
export function sortRows(rows: readonly ReviewRow[], order: RowOrder): ReviewRow[] {
  return order === "severity"
    ? [...rows].sort(bySeverityState)
    : [...rows].sort((a, b) => numeric(a.id, b.id) || a.level - b.level);
}

export type StateFilter = RowState | "all";
export type LevelFilter = BenchmarkLevel | "all";

export function matchesQuery(row: ReviewRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [row.id, row.title, row.context ?? "", ...row.settingNames, ...row.settings.map((setting) => setting.id)].some(
    (text) => text.toLowerCase().includes(needle),
  );
}

export function filterRows(
  rows: readonly ReviewRow[],
  filter: { state: StateFilter; level: LevelFilter; query: string; keys?: ReadonlySet<string> | null },
): ReviewRow[] {
  return rows.filter(
    (row) =>
      (filter.state === "all" || row.state === filter.state) &&
      (filter.level === "all" || row.level === filter.level) &&
      (!filter.keys || filter.keys.has(row.key)) &&
      matchesQuery(row, filter.query),
  );
}

export function stateCountsOf(rows: readonly ReviewRow[]): Record<RowState, number> {
  const counts: Record<RowState, number> = { matches: 0, differs: 0, notConfigured: 0, needsReview: 0, notAssessed: 0 };
  for (const row of rows) counts[row.state] += 1;
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

// A comparison with the rows and exception choices the screen derives from
// it. A view whose results cannot be listed (a malformed pack or result) is
// refused with the same message as one without its lists.
export interface Review {
  assessment: BenchmarkAssessmentView;
  rows: ReviewRow[];
  choices: ExceptionChoice[];
}

export function toReview(value: unknown): Review {
  const assessment = toAssessment(value);
  try {
    return { assessment, rows: reviewRows(assessment), choices: exceptionChoices(assessment) };
  } catch {
    throw new Error(UNREADABLE);
  }
}

// Drafts are generated only for Missing settings of a complete collection.
export function missingSettings(assessment: BenchmarkAssessment): number {
  if (!assessment.collection.complete) return 0;
  return new Set(
    assessment.settings.filter((finding) => finding.status === "Missing").map((finding) => finding.settingId),
  ).size;
}

// A setting an exception can accept: one whose result is Differs (also
// Missing), with the recommendation ids that check it and its display name.
// The headline looks exceptions up by the ids a recommendation checks, which
// may be nested children of a root, so recommendation mode offers those.
export interface ExceptionChoice {
  settingId: string;
  name: string;
  recommendationIds: string[];
  // Titles of those recommendations, in the same order.
  recommendationTitles: string[];
}

export function exceptionChoices(assessment: BenchmarkAssessment): ExceptionChoice[] {
  const byId = new Map<string, ExceptionChoice>();
  for (const item of assessmentResults(assessment)) {
    if (item.result !== "Fail") continue;
    const entries =
      item.kind === "recommendation"
        ? item.recommendation.settings
            .filter((setting) => setting.result === "Fail")
            .map((setting) => ({
              settingId: setting.id,
              recommendation: { id: item.id, title: item.recommendation.title } as { id: string; title: string } | null,
            }))
        : [{ settingId: item.finding.settingId, recommendation: null }];
    for (const { settingId, recommendation } of entries) {
      const choice = byId.get(settingId) ?? {
        settingId,
        name: settingName(assessment.settingNames, settingId),
        recommendationIds: [],
        recommendationTitles: [],
      };
      if (recommendation && !choice.recommendationIds.includes(recommendation.id)) {
        choice.recommendationIds.push(recommendation.id);
        choice.recommendationTitles.push(recommendation.title);
      }
      byId.set(settingId, choice);
    }
  }
  const sorted = [...byId.values()].map((choice) => {
    const order = choice.recommendationIds.map((id, index) => ({ id, title: choice.recommendationTitles[index]! }));
    order.sort((a, b) => numeric(a.id, b.id));
    return {
      ...choice,
      recommendationIds: order.map((entry) => entry.id),
      recommendationTitles: order.map((entry) => entry.title),
    };
  });
  const first = (choice: ExceptionChoice) => choice.recommendationIds[0] ?? "";
  return sorted.sort(
    (a, b) => numeric(first(a), first(b)) || a.name.localeCompare(b.name) || numeric(a.settingId, b.settingId),
  );
}

// The label of an exception choice: the recommendation id and title
// ("2.1.2 Synthetic recommendation 2", "and 1 more" when several check the
// setting), or the setting name for a pack without recommendation ids.
export function exceptionChoiceLabel(choice: ExceptionChoice): string {
  const [id] = choice.recommendationIds;
  if (!id) return choice.name;
  const more = choice.recommendationIds.length - 1;
  return `${id} ${choice.recommendationTitles[0]}${more ? ` and ${more} more` : ""}`;
}

// The second line of an exception choice: the setting it accepts.
export function exceptionChoiceSetting(choice: ExceptionChoice): string {
  return choice.name === choice.settingId ? choice.settingId : `${choice.name} (${choice.settingId})`;
}

// A YYYY-MM-DD date as a calendar date in this locale ("Mar 31, 2027"); any
// other text stays as it is.
export function formatDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

// A change as text with a true minus sign: "-43.0 pp" reads with U+2212.
export function withMinusSign(text: string): string {
  return text.replace(/(^|\s)-(?=\d)/g, "$1−");
}
