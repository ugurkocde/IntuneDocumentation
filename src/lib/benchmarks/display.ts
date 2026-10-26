/**
 * Display text for benchmark results, shared by the Benchmarks screen and the
 * exports. The internal states keep TenuVault's Pass and Fail; people see
 * Matches, Differs, Needs review and Not assessed. The product never calls a
 * result compliant, a score or certified.
 */
import {
  isNotConfigured,
  type AssessmentResult,
  type BenchmarkAssessment,
  type HeadlineStates,
  type LevelSummary,
  type Observation,
  type ReasonCode,
  type ResultState,
  type SettingFinding,
  type SettingStatus,
} from "./assessment";
import { compareDefinition } from "./policies";
import {
  otherProfilesFor,
  type OtherProfileFamily,
  type OtherProfileFamilyKey,
} from "./tenant-settings";
import {
  NOT_CONFIGURED,
  NOT_FOUND,
  settingName,
  settingValue,
  type UnreadableCause,
  type ValueText,
} from "./values";

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
  Missing: NOT_CONFIGURED,
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
  notAssignedDiffers:
    "Only policies that are not assigned hold this setting, and none of them matches the recommended value.",
  notAssignedMixed:
    "Only policies that are not assigned hold this setting: some match the recommended value and some hold another value.",
  assignmentUnknown:
    "No matching policy is known to be assigned: an assignment could not be read, or its effective targeting could not be resolved.",
  settingOutsidePack:
    "The recommendation names a setting outside the pack, so it is not assessed here.",
  otherProfiles:
    "Not found in the Settings Catalog. It may be set outside the Settings Catalog, by a profile of another type for this platform.",
  packValueUnreadable:
    "The delivered pack holds a value for this setting, or a platform list for its policy, that cannot be compared.",
};

/** Short forms of REASON_LABELS for table cells; the full sentence is shown once beside them. */
export const SHORT_REASON_LABELS: Readonly<Record<ReasonCode, string>> = {
  collectionIncomplete: "Collection incomplete",
  unreadableValue: "Value not readable",
  profileChoice: "Pack value to choose",
  notAssigned: "Only on unassigned policies",
  notAssignedDiffers: "Other value, unassigned only",
  notAssignedMixed: "Mixed values, unassigned only",
  assignmentUnknown: "Assignment unknown",
  settingOutsidePack: "Setting outside the pack",
  otherProfiles: "Other profile types may set it",
  packValueUnreadable: "Pack value not comparable",
};

/** What each displayed state means, for legends. */
export const STATE_DESCRIPTIONS: Readonly<Record<keyof Omit<HeadlineStates, "assessed" | "total">, string>> = {
  matches: "The recommended value is set on at least one assigned policy.",
  differs: "A policy that is assigned, or whose assignment could not be read, holds another value.",
  notConfigured: "A complete collection shows the setting in no policy, and no profile of another type exists for its platform.",
  needsReview: "Checked automatically, but the collected data does not show whether it matches.",
  notAssessed: "Not compared here; the reason says why.",
};

export const READINESS_DISCLAIMER = "Readiness comparison, not a certification";

/**
 * The label of a result for people: Differs, except Not configured for a
 * Differs result whose differing settings the collection proves missing.
 */
export function resultLabel(
  item: Parameters<typeof isNotConfigured>[0],
): string {
  return isNotConfigured(item) ? NOT_CONFIGURED : RESULT_LABELS[item.result];
}

/** What each unreadable cause means, where the engine can tell which applies. */
export const UNREADABLE_CAUSE_LABELS: Readonly<
  Record<UnreadableCause, string>
> = {
  secret:
    "The value is a secret, which Microsoft Graph never returns in a readable form.",
  redacted: "The value was redacted when it was collected.",
  wrongType: "The value does not have the type its setting documents.",
  undocumented: "The setting uses a value type that is not documented.",
};

/** Needs review and manual recommendations are different things; this says how. */
export const NEEDS_REVIEW_NOTE =
  "Needs review means the setting was checked automatically, but the collected data does not show whether it matches. Manual recommendations are a separate group: this view does not check them.";

/** For a Level judged by settings. */
export const SETTINGS_BASIS_NOTE =
  "This pack is delivered as settings without recommendation ids, so results are per setting.";

/** For a comparison of Level 2, which shows Level 1 too. */
export const LEVEL_2_NOTE =
  "Level 2 adds settings for environments that need stronger protection on top of Level 1. Comparing Level 2 compares both Levels, and each Level has its own headline.";

/** The lead line of the readiness PDF cover. */
export const COVER_LEAD =
  "This report compares the delivered benchmark pack with the Settings Catalog policies of the last collection.";

/** Captions of the result count tiles. */
export const KPI_CAPTIONS = {
  counted: "Counted in the headline",
  notCounted: "Not counted in the headline",
} as const;

/**
 * When a percentage may lead: at least HERO_MIN_ASSESSED results assessed
 * (Matches, Differs or Not configured) and at least HERO_MIN_SHARE of all
 * results of the Level. Below that a percentage overstates what was shown
 * ("100%" of 1 result while 87 need review), so the counts lead and the
 * rate is shown with its base beside them. The rate itself is unchanged.
 */
export const HERO_MIN_ASSESSED = 10;
export const HERO_MIN_SHARE = 0.25;

export function rateIsHero(
  states: Pick<HeadlineStates, "assessed" | "total">,
): boolean {
  return (
    states.assessed >= HERO_MIN_ASSESSED &&
    states.total > 0 &&
    states.assessed / states.total >= HERO_MIN_SHARE
  );
}

/** The per state counts in display order, with their labels. */
export function stateCounts(
  states: HeadlineStates,
): Array<{ state: keyof HeadlineStates; label: string; count: number }> {
  return [
    { state: "matches" as const, label: RESULT_LABELS.Pass, count: states.matches },
    { state: "differs" as const, label: RESULT_LABELS.Fail, count: states.differs },
    { state: "notConfigured" as const, label: NOT_CONFIGURED, count: states.notConfigured },
    { state: "needsReview" as const, label: RESULT_LABELS.Review, count: states.needsReview },
    { state: "notAssessed" as const, label: RESULT_LABELS["Not assessed"], count: states.notAssessed },
  ].filter((entry) => entry.state !== "notConfigured" || entry.count > 0);
}

/** "3 matches, 1 differs, 87 need review": the counts as one line. */
export function stateCountsText(states: HeadlineStates): string {
  return stateCounts(states)
    .map(({ label, count }) => `${count.toLocaleString("en-US")} ${label.toLowerCase()}`)
    .join(", ");
}

/** Order of rows: Differs and Not configured first, then Needs review, Not assessed and Matches. */
export const SEVERITY_ORDER: readonly ResultState[] = [
  "Fail",
  "Review",
  "Not assessed",
  "Pass",
];

const numeric = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/** Compares two rows by severity, then by id. */
export function bySeverity(
  a: { result: ResultState; id: string; level?: number },
  b: { result: ResultState; id: string; level?: number },
): number {
  return (
    SEVERITY_ORDER.indexOf(a.result) - SEVERITY_ORDER.indexOf(b.result) ||
    (a.level ?? 0) - (b.level ?? 0) ||
    numeric(a.id, b.id)
  );
}

const ASSIGNMENT_STATE_LABELS: Readonly<Record<Observation["assignment"], string>> = {
  assigned: "Assigned",
  notAssigned: "Not assigned",
  unknown: "Assignment unknown",
};

/**
 * Where a policy's assignments reach, in words: "assigned to Group: Pilot,
 * All Devices, excluding Group: Kiosk". Group memberships are not read, so
 * this names targets only.
 */
export function reachText(
  observation: Pick<Observation, "assignment" | "reach">,
): string {
  const { assignment, reach } = observation;
  if (assignment === "unknown")
    return reach.uncertainty === "unresolved"
      ? "assignment unknown: effective targeting could not be resolved"
      : "assignment unknown: assignments were not read completely";
  if (assignment === "notAssigned") return "not assigned";
  // A target that is also excluded reaches nobody through that assignment.
  const targets = reach.targets.filter((target) => !reach.exclusions.includes(target));
  const parts = [`assigned to ${targets.join(", ")}`];
  if (reach.exclusions.length)
    parts.push(`excluding ${reach.exclusions.join(", ")}`);
  if (reach.filters)
    parts.push(
      `${reach.filters} assignment ${reach.filters === 1 ? "filter" : "filters"}`,
    );
  return parts.join(", ");
}

/** "Assigned", "Not assigned" or "Assignment unknown". */
export function assignmentLabel(assignment: Observation["assignment"]): string {
  return ASSIGNMENT_STATE_LABELS[assignment];
}

/**
 * A Matches result with where it applies: "Matches, policy P, assigned to
 * Group: G". Only for a result that is Pass; only assigned policies whose
 * value of the setting matches are named; null otherwise.
 */
export function matchReachText(
  finding: Pick<SettingFinding, "recommended" | "observations">,
  settingId: string,
  result: ResultState,
): string | null {
  if (result !== "Pass") return null;
  const assigned = finding.observations.filter(
    (observation) =>
      observation.assignment === "assigned" &&
      observationLabel(finding, observation, settingId) === "Matches",
  );
  if (!assigned.length) return null;
  return `${RESULT_LABELS.Pass}, ${assigned
    .map((observation) => `policy ${observation.policyName}, ${reachText(observation)}`)
    .join("; ")}`;
}

/** Older profile families by name, as the advice to check them says it. */
export const OTHER_PROFILE_LABELS: Readonly<Record<OtherProfileFamilyKey, string>> = {
  deviceConfigurations: "device configuration profiles",
  windowsUpdatePolicies: "update rings",
  administrativeTemplates: "administrative templates",
  securityBaselines: "security baselines and endpoint security profiles of the older template type",
};

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  windows: "Windows",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  linux: "Linux",
};

/** One older profile family as text: its name and why it may hold the setting. */
export function otherProfileText(family: OtherProfileFamily): string {
  const name = OTHER_PROFILE_LABELS[family.family];
  if (!family.complete) return `${name} (not collected completely)`;
  if (family.platforms === null) return `${name} (platform not collected)`;
  return `${name} (${family.platforms.map((platform) => PLATFORM_LABELS[platform] ?? platform).join(", ")})`;
}

/** The older profile families that may set a setting on these pack platforms, as a list. */
export function otherProfilesText(
  families: readonly OtherProfileFamily[],
  platforms: string,
): string {
  const relevant = otherProfilesFor(families, platforms).filter(
    (family) => !family.complete || family.count > 0,
  );
  return relevant.length
    ? relevant.map(otherProfileText).join(", ")
    : "profiles of other types";
}

export type ObservationLabel =
  | "Matches"
  | "Differs"
  | "Parent setting differs"
  | "Not set in this policy"
  | "Not readable";

/**
 * How one tenant policy holds the displayed setting of a finding: the
 * setting itself, not the whole root it sits in, so a nested setting that
 * matches next to a differing sibling reads Matches. A parent of the setting
 * with another option reads Parent setting differs: the setting applies only
 * below the recommended option. The screen and the PDF both use it.
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
  if (state.comparison === "differ")
    return state.parentDiffers ? "Parent setting differs" : "Differs";
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

/**
 * What a headline rate is based on: "of 1 assessed, 87 need review". The
 * rate is Matches out of the assessed results (Matches plus Differs).
 */
export function headlineBaseText(
  counts: Pick<LevelSummary["headline"]["counts"], "pass" | "fail" | "review">,
): string {
  const assessed = counts.pass + counts.fail;
  return `of ${assessed.toLocaleString("en-US")} assessed, ${counts.review.toLocaleString("en-US")} ${counts.review === 1 ? "needs" : "need"} review`;
}

/**
 * A headline rate with its base, "100% of 1 assessed, 87 need review". A
 * null rate keeps its own wording.
 */
export function headlineWithBase(
  rate: number | null,
  counts: Pick<LevelSummary["headline"]["counts"], "pass" | "fail" | "review">,
  nullText = "n/a",
): string {
  return rate === null
    ? nullText
    : `${formatRate(rate)} ${headlineBaseText(counts)}`;
}

/**
 * The status of one setting beside its result. A setting that matches but
 * needs review says why, so Matches never stands alone beside Needs review:
 * "Matches, on an unassigned policy" or "Matches, assignment unknown".
 * policies is the number of policies holding the matching value.
 */
export function settingStatusText(
  setting: {
    status: SettingStatus | "Unmapped";
    result: ResultState;
    reason?: ReasonCode;
  },
  policies = 0,
): string {
  const label = SETTING_STATUS_LABELS[setting.status];
  if (setting.status !== "Present" || setting.result !== "Review") return label;
  if (setting.reason === "notAssigned")
    return `${label}, ${policies === 1 ? "on an unassigned policy" : "on unassigned policies"}`;
  if (setting.reason === "assignmentUnknown")
    return `${label}, assignment unknown`;
  return `${label}, needs review`;
}

/** Policies whose value of the setting matches the recommended value. */
export function matchingPolicies(
  findings: ReadonlyArray<Pick<SettingFinding, "recommended" | "observations">>,
  settingId: string,
): number {
  return findings.reduce(
    (sum, finding) =>
      sum +
      finding.observations.filter(
        (observation) =>
          observationLabel(finding, observation, settingId) === "Matches",
      ).length,
    0,
  );
}

export function headlineLabel(
  basis: "recommendations" | "settings" | "mixed",
): string {
  return basis === "recommendations"
    ? "Matching recommendations"
    : basis === "settings"
      ? "Matching settings"
      : "Matching results";
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
 * A delivered benchmark name in one form: without a leading "CIS" and a
 * trailing "Benchmark", which the headers around it already say ("CIS
 * Benchmark readiness"). A name that would be left without its own words
 * stays as it is.
 */
export function benchmarkName(name: string): string {
  const trimmed = name
    .trim()
    .replace(/^CIS\s+/i, "")
    .replace(/\s+Benchmarks?$/i, "")
    .trim();
  return trimmed && !/^benchmarks?$/i.test(trimmed) ? trimmed : name.trim();
}

/**
 * How many recommendations of a Level are checked automatically and how many
 * need a manual check. With a list the total is its identifiers for the
 * Level; without one no total is claimed, and checked counts the assessed
 * results, which are settings for a pack without recommendations.
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
  > & { headline: Pick<LevelSummary["headline"], "basis"> },
  assessed: number,
  product = "Intune Documentation",
): string {
  const { checked, manual, total } = levelCheckCounts(level, assessed);
  const noun = (count: number) =>
    count === 1 ? "recommendation" : "recommendations";
  const assessedNoun = (count: number) =>
    level.headline.basis === "settings"
      ? count === 1
        ? "setting"
        : "settings"
      : noun(count);
  if (total === null) {
    const prefix = checked
      ? `Level ${level.level}: ${product} checks ${checked} ${assessedNoun(checked)} of this pack automatically.`
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
  level: Pick<LevelSummary, "level" | "coverage"> & {
    headline?: Pick<LevelSummary["headline"], "basis" | "states">;
  },
): string {
  const { coverage } = level;
  if (coverage.source === "none") {
    const covered = level.headline
      ? `This pack covers ${level.headline.states.total.toLocaleString("en-US")} ${
          level.headline.basis === "settings"
            ? level.headline.states.total === 1
              ? "setting"
              : "settings"
            : level.headline.states.total === 1
              ? "recommendation"
              : "recommendations"
        }. `
      : "";
    return `${covered}The full benchmark also has manual and other recommendations; coverage of the full benchmark will be shown once its list is published.`;
  }
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

/**
 * The current value of a setting no collected policy holds: Not configured
 * only where the engine proves it missing, otherwise not found.
 */
export function absentValueText(status: SettingStatus | "Unmapped"): string {
  return status === "Missing" ? NOT_CONFIGURED : NOT_FOUND;
}

/** One tenant policy holding a setting of a result, with its value and reach. */
export interface HolderDetail {
  policyId: string;
  policyName: string;
  assignment: Observation["assignment"];
  /** reachText: "assigned to Group: G", "not assigned" or why it is unknown. */
  assignedTo: string;
  label: ObservationLabel;
  current: ValueText;
}

/** One setting of a result: its name, recommended value and the policies holding it. */
export interface ResultSettingDetail {
  settingId: string;
  /** Display name, or the id when no definition names it. */
  name: string;
  status: SettingStatus | "Unmapped";
  result: ResultState;
  reason?: ReasonCode;
  /** The recommended values of the pack roots holding it, once each. */
  recommended: string[];
  holders: HolderDetail[];
}

/**
 * The settings of one result with names, the current value in every policy
 * that holds them and the recommended value, for the CSV, the JSON, the PDF
 * and the screen. A policy whose root does not hold the setting is left out;
 * no holder means the setting is not configured in any collected policy.
 */
export function resultSettingDetails(
  assessment: Pick<BenchmarkAssessment, "settings" | "settingNames">,
  result: AssessmentResult,
): ResultSettingDetail[] {
  const findings = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  const settings =
    result.kind === "recommendation"
      ? result.recommendation.settings
      : [
          {
            id: result.finding.settingId,
            status: result.finding.status,
            result: result.finding.result,
            ...(result.finding.reason ? { reason: result.finding.reason } : {}),
            findingKeys: [result.finding.key],
          },
        ];
  return settings.map((setting) => {
    const own = setting.findingKeys
      .map((key) => findings.get(key))
      .filter((finding): finding is SettingFinding => Boolean(finding));
    const recommended = [
      ...new Set(
        own.map((finding) => settingValue(finding.recommended, setting.id, assessment.settingNames).text),
      ),
    ];
    const holders = own.flatMap((finding) =>
      finding.observations.flatMap((observation): HolderDetail[] => {
        const label = observationLabel(finding, observation, setting.id);
        if (label === "Not set in this policy") return [];
        return [
          {
            policyId: observation.policyId,
            policyName: observation.policyName,
            assignment: observation.assignment,
            assignedTo: reachText(observation),
            label,
            current:
              setting.id === finding.settingId
                ? observation.current
                : settingValue(observation.value, setting.id, assessment.settingNames),
          },
        ];
      }),
    );
    return {
      settingId: setting.id,
      name: settingName(assessment.settingNames, setting.id),
      status: setting.status,
      result: setting.result,
      ...(setting.reason ? { reason: setting.reason } : {}),
      recommended,
      holders,
    };
  });
}
