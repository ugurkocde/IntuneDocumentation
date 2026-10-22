/**
 * Display text for benchmark results, shared by the Benchmarks screen and the
 * exports. The internal states keep TenuVault's Pass and Fail; people see
 * Matches, Differs, Needs review and Not assessed. The product never calls a
 * result compliant, a score or certified.
 */
import type {
  BenchmarkAssessment,
  LevelSummary,
  Observation,
  ReasonCode,
  ResultState,
  SettingFinding,
  SettingStatus,
} from "./assessment";
import { compareDefinition } from "./policies";

export const RESULT_LABELS: Readonly<Record<ResultState, string>> = {
  Pass: "Matches",
  Fail: "Differs",
  Review: "Needs review",
  "Not assessed": "Not assessed",
};

export const SETTING_STATUS_LABELS: Readonly<
  Record<SettingStatus | "Unmapped", string>
> = {
  Present: "Matches",
  Different: "Differs",
  Missing: "Missing",
  Review: "Needs review",
  Unmapped: "Not assessed",
};

export const REASON_LABELS: Readonly<Record<ReasonCode, string>> = {
  collectionIncomplete:
    "The collection is incomplete, so this cannot be shown to match or to be missing.",
  unreadableValue:
    "The tenant value could not be read (secret, redacted, wrong type or undocumented).",
  profileChoice:
    "The pack holds several values for this setting; choose one first.",
  notAssigned: "The matching value is only on policies that are not assigned.",
  assignmentUnknown:
    "No matching policy is known to be assigned: an assignment could not be read.",
  settingOutsidePack:
    "The recommendation names a setting outside the pack, so it is not assessed here.",
  otherProfiles:
    "Not found in the Settings Catalog. It may be set outside the Settings Catalog, by a profile of another type for this platform.",
  packValueUnreadable:
    "The delivered pack holds a value for this setting that cannot be compared.",
};

export const READINESS_DISCLAIMER = "Readiness comparison, not a certification";

export type ObservationLabel =
  | "Matches"
  | "Differs"
  | "Not set in this policy"
  | "Not readable";

/**
 * How one tenant policy holds the displayed setting of a finding: the
 * setting itself, not the whole root it sits in, so a nested setting that
 * matches next to a differing sibling reads Matches. The screen and the PDF
 * both use it.
 */
export function observationLabel(
  finding: Pick<SettingFinding, "recommended">,
  observation: Pick<Observation, "value">,
  settingId: string,
): ObservationLabel {
  const state = compareDefinition(
    finding.recommended,
    observation.value,
    settingId,
  );
  if (!state) return "Not readable";
  if (state.holds === "no") return "Not set in this policy";
  if (state.comparison === "match") return "Matches";
  if (state.comparison === "differ") return "Differs";
  return "Not readable";
}

/** A rate in percent with one decimal; null stays null. */
export function ratePercent(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 1000) / 10;
}

/** A rate as text with its unit, or Not available. */
export function formatRate(rate: number | null): string {
  const value = ratePercent(rate);
  return value === null ? "Not available" : `${value}%`;
}

export function headlineLabel(basis: "recommendations" | "settings"): string {
  return basis === "recommendations"
    ? "Matching recommendations"
    : "Matching settings";
}

/** "X% with N exclusions" next to the headline, or null when no exception is in use. */
export function exclusionsText(
  headline: Pick<LevelSummary["headline"], "adjusted" | "exceptionIds">,
): string | null {
  const count = headline.exceptionIds.length;
  if (headline.adjusted === null || !count) return null;
  return `${formatRate(headline.adjusted)} with ${count} ${count === 1 ? "exclusion" : "exclusions"}`;
}

/** The counts line under a headline: what is outside the rate is named, never hidden. */
export function countsText(counts: LevelSummary["headline"]["counts"]): string {
  return [
    `${counts.pass} ${RESULT_LABELS.Pass.toLowerCase()}`,
    `${counts.fail} ${RESULT_LABELS.Fail.toLowerCase()}`,
    `${counts.review} ${RESULT_LABELS.Review.toLowerCase()}`,
    `${counts.notAssessed} ${RESULT_LABELS["Not assessed"].toLowerCase()}`,
  ].join(", ");
}

/** A benchmark id as words, for when no catalog name is known. */
export function benchmarkDisplayName(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * How many recommendations of a Level are checked automatically and how many
 * need a manual check. With a list the total is its identifiers for the
 * Level; without one no total is claimed.
 */
export function levelCheckCounts(
  level: Pick<LevelSummary, "coverage" | "manual" | "listIdentifiers">,
  assessed: number,
): { checked: number; manual: number; total: number | null } {
  if (level.listIdentifiers.length) {
    const checked = level.coverage.coveredIds.length;
    return {
      checked,
      manual: level.listIdentifiers.length - checked,
      total: level.listIdentifiers.length,
    };
  }
  return { checked: assessed, manual: level.manual.length, total: null };
}

/** The sentence shown above the manual notice for one Level. */
export function levelCheckSummary(
  level: Pick<
    LevelSummary,
    "level" | "coverage" | "manual" | "listIdentifiers"
  >,
  assessed: number,
  product = "Intune Documentation",
): string {
  const { checked, manual, total } = levelCheckCounts(level, assessed);
  const noun = (count: number) =>
    count === 1 ? "recommendation" : "recommendations";
  if (total === null) {
    const prefix = checked
      ? `Level ${level.level}: ${product} checks ${checked} ${noun(checked)} of this pack automatically.`
      : `Level ${level.level}: ${product} compares the settings of this pack automatically.`;
    if (!manual)
      return `${prefix} Recommendations outside the pack, including manual ones, need a manual check.`;
    return `${prefix} The ${manual === 1 ? "one" : String(manual)} listed here and any recommendations outside the pack need a manual check.`;
  }
  if (!manual)
    return `Level ${level.level}: ${product} checks all ${checked} ${noun(checked)} automatically.`;
  const rest =
    manual === 1
      ? "The other one needs a manual check."
      : `The other ${manual} need a manual check.`;
  return `Level ${level.level}: ${product} checks ${checked} of ${total} ${noun(total)} automatically. ${rest}`;
}

/** Coverage of the full benchmark in plain words; never estimated without a list. */
export function coverageStatement(
  level: Pick<LevelSummary, "level" | "coverage">,
): string {
  const { coverage } = level;
  if (coverage.source === "none")
    return "Coverage of the full benchmark is not shown because the list of all its automated recommendations is not available.";
  if (coverage.coverage === null)
    return `Coverage of the full benchmark is not shown because the recommendation list marks none of Level ${level.level} as automated.`;
  return `Coverage: ${formatRate(coverage.coverage)} (${coverage.numerator} of ${coverage.denominator} automated recommendations), from the delivered recommendation list.`;
}

/**
 * The Levels an assessment's results cover, for headers and the PDF cover:
 * "Level 1", "Level 2" or "Levels 1 and 2". Falls back to the compared Level.
 */
export function levelsLabel(
  assessment: Pick<BenchmarkAssessment, "level" | "levels">,
): string {
  const levels = assessment.levels.length
    ? assessment.levels.map((item) => item.level)
    : [assessment.level];
  if (levels.length === 1) return `Level ${levels[0]}`;
  return `Levels ${levels.slice(0, -1).join(", ")} and ${levels.at(-1)}`;
}
