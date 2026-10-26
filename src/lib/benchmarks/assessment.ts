/**
 * Benchmark comparison of one collection against one delivered pack Level,
 * ported from TenuVault (policies.ts comparePolicies, cis-recommendations.ts
 * and cis-readiness.ts) and adapted to this PR's rule: absent, unreadable or
 * incomplete data is Review or Not assessed, never Missing or Different.
 *
 * - Missing only when the collection proves absence (TenantSettings.complete)
 *   and no profile of an older type (device configuration, administrative
 *   template, security baseline or endpoint security intent) exists for the
 *   setting's platform; otherwise an absent setting is Review (otherProfiles),
 *   because the comparison reads Settings Catalog policies only.
 * - Different only with a readable observed value that differs on a policy
 *   that is assigned or of unknown assignment. A policy that is not
 *   assigned (an Intune group both included and excluded included) applies
 *   to nobody, so its difference counts no more than its match: without
 *   another such holder the setting is Review, notAssignedDiffers when no
 *   holder matches and notAssignedMixed when one does, or
 *   collectionIncomplete when an unread policy may hold it too.
 * - A nested setting applies only below the options its parents select, so
 *   it is judged with them (policies.ts compareDefinition): a readable
 *   tenant parent with another option is Different, never Pass or Missing,
 *   and a parent unreadable on either side, without such a difference above
 *   it, makes it Review.
 * - Present only when a readable match exists, every observation holding
 *   the setting on a policy that is assigned or of unknown assignment is
 *   readable and matches, and the collection is complete (an unread policy
 *   may hold another value). An unassigned policy whose value cannot be read
 *   counts for nothing, like its readable difference; when only unassigned
 *   policies hold the setting and none matches, an unreadable value there
 *   makes it Review (unreadableValue), not notAssignedDiffers.
 * - Pass needs Present on at least one assigned policy (owner decision
 *   2026-10-22); unassigned policies holding the same value do not change
 *   that. Review (notAssigned) only when every holder is unassigned and
 *   matches, Review (assignmentUnknown) when none is assigned and an
 *   assignment could not be read.
 * - A pack value this app cannot read is never compared: Review
 *   (packValueUnreadable), never Missing, and never Different on its own
 *   account. A readable difference that decides whatever that value is
 *   stays Different: a readable tenant parent with another option above it,
 *   or a readable difference in another branch of the same root.
 * - A recommendation naming a setting outside the pack is Not assessed.
 * - The headline is Pass / (Pass + Fail); Review and Not assessed are counted
 *   but never lower it; null when nothing was assessed.
 */
import {
  compareDefinition,
  compareRoot,
  definitionIds,
  parsePolicies,
  readableRecommendation,
  sameRecommendedValue,
  type BaselinePolicy,
  type Comparison,
  type RecordJson,
} from "./policies";
import { appliesOn, localDate, type BenchmarkException } from "./exceptions";
import { computeCoverage, type LevelCoverage } from "./coverage";
import {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
  manualItemsForLevel,
  type ManualItemView,
} from "./manual";
import { canonicalPlatforms } from "../compliance/graph-rows";
import {
  mayBeSetElsewhere,
  tenantSettings,
  type AssignmentReach,
  type AssignmentState,
  type BenchmarkCollection,
  type SettingNames,
  type TenantSettings,
} from "./tenant-settings";
import {
  recommendedValue,
  settingDifferences,
  settingValue,
  type SettingDifference,
  type ValueText,
} from "./values";
import type {
  BenchmarkLevel,
  BenchmarkPack,
  PackRecommendation,
  RecommendationList,
} from "./pack";

export type { BenchmarkLevel, PackRecommendation };

/** How one pack setting compares with the tenant values. */
export type SettingStatus = "Present" | "Missing" | "Different" | "Review";
/** Internal result; display labels are Matches, Differs, Needs review and Not assessed. */
export type ResultState = "Pass" | "Fail" | "Review" | "Not assessed";
export type ReasonCode =
  | "collectionIncomplete"
  | "unreadableValue"
  | "profileChoice"
  | "notAssigned"
  | "notAssignedDiffers"
  | "notAssignedMixed"
  | "assignmentUnknown"
  | "settingOutsidePack"
  | "otherProfiles"
  | "packValueUnreadable";

export interface Observation {
  policyId: string;
  policyName: string;
  templated: boolean;
  assignment: AssignmentState;
  /** What the policy's assignments reach (targets, exclusions), for "assigned to G". */
  reach: AssignmentReach;
  /**
   * The policy's value of the finding's setting as text (choice options by
   * their display name where known), with the raw instance.
   */
  current: ValueText;
  /** The tenant root instance, cleaned of export annotations. */
  value: RecordJson;
  /** This root against the recommended root. */
  comparison: Comparison;
  /**
   * Settings below the finding's setting whose readable value definitely
   * differs while the setting's own value matches, with both values as
   * text; only set when there are any. Never stored in history.
   */
  differences?: SettingDifference[];
}

/** The differences of one policy below the finding's setting, as an optional field. */
function differencesOf(
  recommended: RecordJson,
  value: RecordJson,
  settingId: string,
  names: SettingNames,
): { differences?: SettingDifference[] } {
  const differences = settingDifferences(recommended, value, settingId, names);
  return differences.length ? { differences } : {};
}

export interface SettingFinding {
  /**
   * policyIndex:settingIndex in the pack; with several Levels compared
   * together, prefixed with the pack Level ("L1/0:3").
   */
  key: string;
  /** The Level of the pack that delivers this setting. */
  packLevel: BenchmarkLevel;
  policyIndex: number;
  settingIndex: number;
  /** The pack policy is created from a template, which drafts do not generate. */
  templated: boolean;
  /** Name of the pack policy; in memory only, never stored. */
  policyName: string;
  platforms: string;
  settingId: string;
  status: SettingStatus;
  result: ResultState;
  reason?: ReasonCode;
  recommended: RecordJson;
  /** The recommended value of the setting as text, with the raw instance. */
  recommendedValue: ValueText;
  observations: Observation[];
  /**
   * For a Level judged by settings: the exception in effect when the
   * setting does not pass, and whether the adjusted headline counts it.
   */
  exception?: ExceptionUse;
  credited?: true;
}

/**
 * The exception in effect for a setting of a result that does not pass: the
 * pack Level's own, else one recorded at the compared Level
 * (exceptionsForLevel), by its stored id, and whether it applies on the
 * as-of date (created by then and not expired). Ids only.
 */
export interface ExceptionUse {
  id: string;
  applies: boolean;
}

export interface RecommendationSettingResult {
  id: string;
  status: SettingStatus | "Unmapped";
  result: ResultState;
  reason?: ReasonCode;
  findingKeys: string[];
  /** The exception in effect when the setting does not pass. */
  exception?: ExceptionUse;
}

export interface RecommendationResult {
  id: string;
  /** The Level of the pack that delivers this recommendation. */
  packLevel: BenchmarkLevel;
  /** Delivered with the pack; in memory only, never stored. */
  title: string;
  level: BenchmarkLevel;
  result: ResultState;
  reason?: ReasonCode;
  settings: RecommendationSettingResult[];
  findingKeys: string[];
  /** Declared settings whose result is not Pass. */
  openSettingIds: string[];
  /**
   * The adjusted headline counts this Fail result as Pass: every setting
   * that does not pass is Fail with an exception that applies.
   */
  credited?: true;
}

export interface ResultCounts {
  pass: number;
  fail: number;
  review: number;
  notAssessed: number;
}

/**
 * The results of one Level by what people see: Matches, Differs, Not
 * configured (a Differs result whose open settings are all missing),
 * Needs review and Not assessed. assessed is the base of the rate (Matches
 * plus Differs plus Not configured) and total every result of the Level.
 */
export interface HeadlineStates {
  matches: number;
  differs: number;
  notConfigured: number;
  needsReview: number;
  notAssessed: number;
  assessed: number;
  total: number;
}

export interface LevelHeadline {
  basis: "recommendations" | "settings";
  /** Pass / (Pass + Fail); null when nothing was assessed. */
  rate: number | null;
  /** The rate with excepted results counted as Pass; null when no exception is in use. */
  adjusted: number | null;
  /** Ids of the exceptions in use for this headline. */
  exceptionIds: string[];
  counts: ResultCounts;
  states: HeadlineStates;
}

export interface LevelSummary {
  level: BenchmarkLevel;
  headline: LevelHeadline;
  coverage: LevelCoverage;
  manual: ManualItemView[];
  /** Identifiers of this Level the list names, automated and manual; empty without a list. */
  listIdentifiers: string[];
}

export interface BenchmarkAssessment {
  benchmark: string;
  version: string;
  /** The compared Level; Level 2 compares the Level 1 pack too. */
  level: BenchmarkLevel;
  assessedAt: string;
  collection: Pick<
    TenantSettings,
    | "collectedAt"
    | "complete"
    | "gaps"
    | "otherProfilePlatforms"
    | "otherProfiles"
  >;
  /**
   * How results are counted: per recommendation, per setting, or mixed when
   * the Levels shown differ (each Level's headline.basis says which).
   */
  basis: "recommendations" | "settings" | "mixed";
  settings: SettingFinding[];
  recommendations: RecommendationResult[];
  levels: LevelSummary[];
  /** True when a recommendation list for this benchmark and version was used. */
  listUsed: boolean;
  manualNote: string;
  notice: { text: string; url: string };
  /**
   * Display names of the setting definitions the pack names, where known:
   * from the collected settingDefinitions or the Graph definition lookup.
   * A setting without an entry is shown by its id.
   */
  settingNames: SettingNames;
}

export interface AssessOptions {
  list?: RecommendationList;
  exceptions?: readonly BenchmarkException[];
  now?: Date | string;
  /** Display names known besides the collected ones (Graph lookup). */
  names?: SettingNames;
}

interface Judgement {
  status: SettingStatus;
  reason?: ReasonCode;
  holders: Observation[];
}

/** What the collection proves about absence for one pack platform. */
export interface AbsenceProof {
  /** The Settings Catalog collection is complete. */
  complete: boolean;
  /** Profiles of older types may set the setting on this platform. */
  elsewhere: boolean;
}

/**
 * One definition of a recommended root across every tenant root of the same
 * platform and root definition.
 */
function judge(
  recommended: RecordJson,
  observations: readonly Observation[],
  definitionId: string,
  proof: AbsenceProof,
): Judgement {
  const states = observations.map((observation) => ({
    observation,
    state: compareDefinition(recommended, observation.value, definitionId) ?? {
      holds: "no" as const,
      comparison: "differ" as const,
    },
  }));
  const held = states.filter(({ state }) => state.holds === "yes");
  const holders = held.map(({ observation }) => observation);
  // A difference is definite: compareLeaves reaches one only through a
  // readable pack leaf below readable pack and tenant parents, so a pack
  // value that cannot be read never makes it Different, while a readable
  // difference in another branch of the same root still does. A policy that
  // is not assigned applies to nobody, so its difference counts no more
  // than its match does (owner decision D1): without another holder that
  // is assigned or of unknown assignment the result is Review. The reason
  // says what the unassigned holders hold, so the advice fits: change a
  // differing value before assigning, or assign a matching policy. Only a
  // complete collection shows that no other policy holds it.
  const differs = ({ state }: (typeof held)[number]) =>
    state.comparison === "differ";
  const notAssigned = ({ observation }: (typeof held)[number]) =>
    observation.assignment === "notAssigned";
  if (held.some((item) => differs(item) && !notAssigned(item)))
    return { status: "Different", holders };
  const holding = held.filter((item) => !differs(item));
  const maybe = states.some(({ state }) => state.holds === "maybe");
  const maybeApplies = states.some(
    (item) => item.state.holds === "maybe" && !notAssigned(item),
  );
  const matched = holding.some(({ state }) => state.comparison === "match");
  // An unassigned policy whose value cannot be read, or that may hold the
  // setting below an unreadable parent: what it holds is unknown, so it is
  // not named a difference to change.
  const unknown =
    maybe || holding.some(({ state }) => state.comparison === "unknown");
  if (
    holding.length < held.length &&
    holding.every(notAssigned) &&
    !maybeApplies
  )
    return {
      status: "Review",
      reason: !proof.complete
        ? "collectionIncomplete"
        : matched
          ? "notAssignedMixed"
          : unknown
            ? "unreadableValue"
            : "notAssignedDiffers",
      holders,
    };
  const readable = readableRecommendation(recommended, definitionId);
  if (!holding.length && !maybe) {
    if (!proof.complete)
      return { status: "Review", reason: "collectionIncomplete", holders };
    if (!readable)
      return { status: "Review", reason: "packValueUnreadable", holders };
    if (proof.elsewhere)
      return { status: "Review", reason: "otherProfiles", holders };
    return { status: "Missing", holders };
  }
  // A match on, below or above an unreadable pack value is not a reading of
  // the pack.
  if (!readable)
    return { status: "Review", reason: "packValueUnreadable", holders };
  // Unassigned policies count for nothing here too: a value of theirs that
  // cannot be read no more stands against an assigned match than their
  // readable difference does. Without a readable match the value is unknown.
  if (
    maybeApplies ||
    holding.some(
      (item) => item.state.comparison === "unknown" && !notAssigned(item),
    ) ||
    !matched
  )
    return { status: "Review", reason: "unreadableValue", holders };
  if (!proof.complete)
    return { status: "Review", reason: "collectionIncomplete", holders };
  return { status: "Present", holders };
}

/**
 * One definition of a pack root, as judge does, for the platforms of its
 * pack policy. Platforms that are no set of documented members, or the
 * member none that names no platform, select no tenant policy, so the
 * definition is never compared: Review (packValueUnreadable), never Missing
 * or Different.
 */
function judgeOnPlatforms(
  recommended: RecordJson,
  observations: readonly Observation[],
  definitionId: string,
  platforms: string,
  tenant: Pick<TenantSettings, "complete" | "otherProfilePlatforms">,
): Judgement {
  const read = canonicalPlatforms(platforms);
  if (read === null || read === "none")
    return { status: "Review", reason: "packValueUnreadable", holders: [] };
  return judge(recommended, observations, definitionId, {
    complete: tenant.complete,
    elsewhere: mayBeSetElsewhere(tenant, platforms),
  });
}

/** One assigned matching policy is enough; otherwise why the match needs review. */
function assignmentReason(
  holders: readonly Observation[],
): ReasonCode | undefined {
  if (holders.some((holder) => holder.assignment === "assigned"))
    return undefined;
  if (holders.every((holder) => holder.assignment === "notAssigned"))
    return "notAssigned";
  return "assignmentUnknown";
}

function resultOf(judgement: Judgement): {
  result: ResultState;
  reason?: ReasonCode;
} {
  if (judgement.status === "Missing" || judgement.status === "Different")
    return { result: "Fail" };
  if (judgement.status === "Review")
    return { result: "Review", reason: judgement.reason };
  const reason = assignmentReason(judgement.holders);
  return reason ? { result: "Review", reason } : { result: "Pass" };
}

const withReason = <T extends object>(value: T, reason?: ReasonCode) =>
  reason ? { ...value, reason } : value;

type TenantProof = Pick<TenantSettings, "complete" | "otherProfilePlatforms">;

/** The status, result and reason of one finding, as compareSettings judges it. */
function judgeFinding(
  finding: Pick<
    SettingFinding,
    "recommended" | "observations" | "settingId" | "platforms"
  >,
  tenant: TenantProof,
): { status: SettingStatus; result: ResultState; reason?: ReasonCode } {
  const judgement = judgeOnPlatforms(
    finding.recommended,
    finding.observations,
    finding.settingId,
    finding.platforms,
    tenant,
  );
  const { result, reason } = resultOf(judgement);
  return withReason(
    { status: judgement.status, result },
    reason ?? judgement.reason,
  );
}

/**
 * How one pack root judges one setting declared within it (the root itself
 * or a setting below it), as recommendationResults does for each root of a
 * declared setting: the fix plan answers each declared setting by this
 * verdict, also where the root's own verdict differs.
 */
export function judgeDeclared(
  finding: Pick<
    SettingFinding,
    "recommended" | "observations" | "platforms" | "reason"
  >,
  settingId: string,
  tenant: TenantProof,
): { status: SettingStatus; result: ResultState; reason?: ReasonCode } {
  if (finding.reason === "profileChoice")
    return { status: "Review", result: "Review", reason: "profileChoice" };
  const judgement = judgeOnPlatforms(
    finding.recommended,
    finding.observations,
    settingId,
    finding.platforms,
    tenant,
  );
  const { result, reason } = resultOf(judgement);
  return withReason({ status: judgement.status, result }, reason);
}

/** Where compareSettings' findings come from and how values are named. */
export interface CompareContext {
  /** The Level of the delivered pack; the pack's own when compared alone. */
  packLevel?: BenchmarkLevel;
  /** Display names for value texts, besides the collected ones. */
  names?: SettingNames;
}

/** Setting results of every pack root against the tenant values. */
export function compareSettings(
  policies: readonly BaselinePolicy[],
  tenant: TenantSettings,
  context: CompareContext = {},
): SettingFinding[] {
  const names = { ...tenant.definitions, ...context.names };
  const packLevel = context.packLevel ?? 1;
  // Platforms are read in canonical form (canonicalPlatforms), so the same
  // set compares equal in any order. A tenant policy holds a pack setting
  // when its platforms include every platform of the pack policy: it applies
  // there. Platforms that are no set of documented members select nothing:
  // such a tenant policy is a gap of the collection, and such a pack policy
  // is never compared (judgeOnPlatforms).
  const held = new Map<
    string,
    Array<{ platforms: string[]; observation: Observation }>
  >();
  for (const policy of tenant.policies) {
    const platforms = canonicalPlatforms(policy.platforms)?.split(",");
    if (!platforms) continue;
    for (const instance of policy.settings) {
      const id = instance.settingDefinitionId;
      if (typeof id !== "string") continue;
      const list = held.get(id) ?? [];
      list.push({
        platforms,
        observation: {
          policyId: policy.id,
          policyName: policy.name,
          templated: policy.templated,
          assignment: policy.assignment,
          reach: policy.reach,
          current: { text: "", raw: null },
          value: instance,
          comparison: "unknown",
        },
      });
      held.set(id, list);
    }
  }
  const packKey = (policy: BaselinePolicy, id: string) => {
    const platforms = canonicalPlatforms(policy.platforms);
    return platforms ? `${platforms}:${id}` : null;
  };
  // The distinct recommended values per definition and platforms
  // (sameRecommendedValue).
  const recommended = new Map<string, RecordJson[]>();
  for (const policy of policies)
    for (const { settingInstance } of policy.settings) {
      const key = packKey(policy, settingInstance.settingDefinitionId);
      if (!key) continue;
      const values = recommended.get(key) ?? [];
      if (!values.some((value) => sameRecommendedValue(value, settingInstance)))
        values.push(settingInstance);
      recommended.set(key, values);
    }
  return policies.flatMap((policy, policyIndex) =>
    policy.settings.map(({ settingInstance }, settingIndex) => {
      const settingId = settingInstance.settingDefinitionId;
      const key = packKey(policy, settingId);
      const wanted = canonicalPlatforms(policy.platforms)?.split(",");
      const observed = (wanted ? (held.get(settingId) ?? []) : [])
        .filter(({ platforms }) =>
          wanted!.every((platform) => platforms.includes(platform)),
        )
        .map(({ observation }) => ({
          ...observation,
          current: settingValue(observation.value, settingId, names),
          comparison: compareRoot(settingInstance, observation.value),
          ...differencesOf(settingInstance, observation.value, settingId, names),
        }));
      const base = {
        key: `${policyIndex}:${settingIndex}`,
        packLevel,
        policyIndex,
        settingIndex,
        templated: Boolean(policy.templateReference?.templateId),
        policyName: policy.name,
        platforms: policy.platforms,
        settingId,
        recommended: settingInstance,
        recommendedValue: recommendedValue(settingInstance, settingId, names),
        observations: observed,
      };
      // Several recommended values for one definition need a profile choice first.
      if (key && (recommended.get(key)?.length ?? 0) > 1)
        return {
          ...base,
          status: "Review" as const,
          result: "Review" as const,
          reason: "profileChoice" as const,
        };
      return { ...base, ...judgeFinding(base, tenant) };
    }),
  );
}

function compareIds(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference) return difference;
  }
  return 0;
}

const STATUS_ORDER: SettingStatus[] = [
  "Different",
  "Missing",
  "Review",
  "Present",
];

/**
 * One result per pack recommendation. Each declared setting is judged on its
 * own leaf across every tenant root holding it. Not assessed when any
 * declared setting is outside the pack; otherwise Fail when any is Missing or
 * Different; otherwise Review when any is Review or matches on no assigned
 * policy; Pass only when every declared setting is Present with at least one
 * assigned matching policy.
 */
export function recommendationResults(
  findings: readonly SettingFinding[],
  recommendations: readonly PackRecommendation[],
  tenant: TenantProof,
  packLevel: BenchmarkLevel = findings[0]?.packLevel ?? 1,
): RecommendationResult[] {
  const findingIds = findings.map((finding) => ({
    finding,
    ids: new Set(definitionIds(finding.recommended)),
  }));
  return [...recommendations]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((recommendation) => {
      const keys = new Set<string>();
      const settings: RecommendationSettingResult[] =
        recommendation.settings.map((id) => {
          const mapped = findingIds
            .filter((entry) => entry.ids.has(id))
            .map((entry) => entry.finding);
          const findingKeys = mapped.map((finding) => finding.key);
          for (const key of findingKeys) keys.add(key);
          if (!mapped.length)
            return {
              id,
              status: "Unmapped" as const,
              result: "Not assessed" as const,
              reason: "settingOutsidePack" as const,
              findingKeys,
            };
          if (mapped.some((finding) => finding.reason === "profileChoice"))
            return {
              id,
              status: "Review" as const,
              result: "Review" as const,
              reason: "profileChoice" as const,
              findingKeys,
            };
          // Each pack root holding the definition is judged on its own: an
          // assigned match on one root does not stand in for another root.
          const judged = mapped.map((finding) =>
            judgeDeclared(finding, id, tenant),
          );
          const status =
            STATUS_ORDER.find((candidate) =>
              judged.some((entry) => entry.status === candidate),
            ) ?? "Review";
          const result: ResultState = judged.some(
            (entry) => entry.result === "Fail",
          )
            ? "Fail"
            : judged.some((entry) => entry.result === "Review")
              ? "Review"
              : "Pass";
          const reason =
            result === "Review"
              ? judged.find((entry) => entry.result === "Review")?.reason
              : undefined;
          return withReason({ id, status, result, findingKeys }, reason);
        });
      const results = settings.map((setting) => setting.result);
      const result: ResultState = results.includes("Not assessed")
        ? "Not assessed"
        : results.includes("Fail")
          ? "Fail"
          : results.includes("Review")
            ? "Review"
            : "Pass";
      const reason =
        result === "Not assessed" || result === "Review"
          ? settings.find((setting) => setting.result === result)?.reason
          : undefined;
      return withReason(
        {
          id: recommendation.id,
          packLevel,
          title: recommendation.title,
          level: recommendation.level,
          result,
          settings,
          findingKeys: [...keys],
          openSettingIds: settings
            .filter((setting) => setting.result !== "Pass")
            .map((setting) => setting.id),
        },
        reason,
      );
    });
}

export function countResults(
  results: readonly { result: ResultState }[],
): ResultCounts {
  const count = (state: ResultState) =>
    results.filter((item) => item.result === state).length;
  return {
    pass: count("Pass"),
    fail: count("Fail"),
    review: count("Review"),
    notAssessed: count("Not assessed"),
  };
}

/** Pass / (Pass + Fail): Review and Not assessed never lower it. Null when nothing was assessed. */
export function headlineRate(
  counts: Pick<ResultCounts, "pass" | "fail">,
): number | null {
  const assessed = counts.pass + counts.fail;
  return assessed ? counts.pass / assessed : null;
}

/**
 * The exceptions of one pack Level in effect per setting id. Of two for the
 * same setting, one that applies on the date wins.
 */
function exceptionsInEffect(
  exceptions: readonly BenchmarkException[],
  pack: Pick<BenchmarkPack, "benchmark" | "version" | "level">,
  date: string,
): Map<string, ExceptionUse> {
  const inEffect = new Map<string, ExceptionUse>();
  for (const exception of exceptions) {
    if (
      exception.benchmark !== pack.benchmark ||
      exception.version !== pack.version ||
      exception.level !== pack.level
    )
      continue;
    const use = { id: exception.id, applies: appliesOn(exception, date) };
    if (use.applies || !inEffect.get(exception.settingId)?.applies)
      inEffect.set(exception.settingId, use);
  }
  return inEffect;
}

/**
 * An exception credits a Fail result only when every setting of it that does
 * not pass is Fail and has an exception that applies on the as-of date.
 */
function credits(
  result: ResultState,
  open: ReadonlyArray<{ result: ResultState; exception?: ExceptionUse }>,
): boolean {
  return (
    result === "Fail" &&
    open.length > 0 &&
    open.every(
      (setting) => setting.result === "Fail" && setting.exception?.applies,
    )
  );
}

/** A recommendation with the exceptions in effect for its open settings. */
function withRecommendationExceptions(
  item: RecommendationResult,
  inEffect: ReadonlyMap<string, ExceptionUse>,
): RecommendationResult {
  if (!inEffect.size) return item;
  let touched = false;
  const settings = item.settings.map((setting) => {
    const use =
      setting.result === "Pass" ? undefined : inEffect.get(setting.id);
    if (!use) return setting;
    touched = true;
    return { ...setting, exception: use };
  });
  if (!touched) return item;
  const open = settings.filter((setting) => setting.result !== "Pass");
  return credits(item.result, open)
    ? { ...item, settings, credited: true }
    : { ...item, settings };
}

/** A setting result with the exception in effect when it does not pass. */
function withFindingException(
  finding: SettingFinding,
  inEffect: ReadonlyMap<string, ExceptionUse>,
): SettingFinding {
  const use =
    finding.result === "Pass" ? undefined : inEffect.get(finding.settingId);
  if (!use) return finding;
  return credits(finding.result, [{ result: finding.result, exception: use }])
    ? { ...finding, exception: use, credited: true }
    : { ...finding, exception: use };
}

/**
 * The headline of one Level. A credited item (credits) counts as Pass in the
 * adjusted rate; Review items are excluded from the rate either way.
 */
function levelHeadline(
  basis: LevelHeadline["basis"],
  items: ReadonlyArray<{
    result: ResultState;
    failing: Array<{
      id: string;
      result: ResultState;
      status: SettingStatus | "Unmapped";
      exception?: ExceptionUse;
    }>;
    credited?: true;
  }>,
): LevelHeadline {
  const counts = countResults(items);
  const notConfigured = items.filter(isNotConfigured).length;
  const used = new Set<string>();
  let credited = 0;
  for (const item of items) {
    if (!item.credited) continue;
    credited += 1;
    for (const setting of item.failing) used.add(setting.exception!.id);
  }
  const rate = headlineRate(counts);
  return {
    basis,
    rate,
    adjusted:
      used.size && rate !== null
        ? (counts.pass + credited) / (counts.pass + counts.fail)
        : null,
    exceptionIds: [...used],
    counts,
    states: {
      matches: counts.pass,
      differs: counts.fail - notConfigured,
      notConfigured,
      needsReview: counts.review,
      notAssessed: counts.notAssessed,
      assessed: counts.pass + counts.fail,
      total: items.length,
    },
  };
}

/**
 * A Differs result whose differing settings are all missing: the collection
 * proves them absent, so people read it as Not configured.
 */
export function isNotConfigured(item: {
  result: ResultState;
  status?: SettingStatus;
  failing?: ReadonlyArray<{
    result: ResultState;
    status: SettingStatus | "Unmapped";
  }>;
  settings?: ReadonlyArray<{
    result: ResultState;
    status: SettingStatus | "Unmapped";
  }>;
}): boolean {
  if (item.result !== "Fail") return false;
  if (item.status !== undefined) return item.status === "Missing";
  const failing = (item.failing ?? item.settings ?? []).filter(
    (setting) => setting.result === "Fail",
  );
  return (
    failing.length > 0 &&
    failing.every((setting) => setting.status === "Missing")
  );
}

/** The recommendation list when it belongs to the pack's benchmark and version. */
export function matchingList(
  pack: Pick<BenchmarkPack, "benchmark" | "version">,
  list: RecommendationList | undefined,
): RecommendationList | undefined {
  return list &&
    list.benchmark === pack.benchmark &&
    list.version === pack.version
    ? list
    : undefined;
}

/**
 * Compares one collection with one delivered pack Level. The pack is the
 * value parsePack returned; its policies are validated here.
 */
export function assessBenchmark(
  collection: BenchmarkCollection,
  pack: BenchmarkPack,
  options: AssessOptions = {},
): BenchmarkAssessment {
  const policies = parsePolicies(pack.policies);
  const tenant = tenantSettings(collection);
  const now = options.now ?? new Date();
  const assessedAt = new Date(now).toISOString();
  const today = localDate(now);
  const compared = compareSettings(policies, tenant, {
    packLevel: pack.level,
    ...(options.names ? { names: options.names } : {}),
  });
  // Each result records the exception in effect for its open settings and
  // whether it is credited, so every view shows what the headline counted.
  const inEffect = exceptionsInEffect(options.exceptions ?? [], pack, today);
  const recommendations = recommendationResults(
    compared,
    pack.recommendations ?? [],
    tenant,
    pack.level,
  ).map((item) => withRecommendationExceptions(item, inEffect));
  const basis = recommendations.length ? "recommendations" : "settings";
  const settings =
    basis === "settings"
      ? compared.map((finding) => withFindingException(finding, inEffect))
      : compared;
  const list = matchingList(pack, options.list);
  const levelNumbers = [
    ...new Set<BenchmarkLevel>(
      basis === "recommendations"
        ? recommendations.map((item) => item.level)
        : [pack.level],
    ),
  ].sort((a, b) => a - b);
  const descriptions = policies.map((policy) => policy.description);
  const levels = levelNumbers.map((level): LevelSummary => {
    const own = recommendations.filter((item) => item.level === level);
    const headline =
      basis === "recommendations"
        ? levelHeadline(
            basis,
            own.map((item) => ({
              result: item.result,
              failing: item.settings.filter(
                (setting) => setting.result !== "Pass",
              ),
              ...(item.credited ? { credited: true as const } : {}),
            })),
          )
        : levelHeadline(
            basis,
            settings.map((finding) => ({
              result: finding.result,
              failing:
                finding.result === "Pass"
                  ? []
                  : [
                      {
                        id: finding.settingId,
                        result: finding.result,
                        status: finding.status,
                        ...(finding.exception
                          ? { exception: finding.exception }
                          : {}),
                      },
                    ],
              ...(finding.credited ? { credited: true as const } : {}),
            })),
          );
    const coverage = computeCoverage({
      level,
      version: pack.version,
      descriptions,
      assessedIds: own
        .filter((item) => item.result !== "Not assessed")
        .map((item) => item.id),
      unassessedIds: own
        .filter((item) => item.result === "Not assessed")
        .map((item) => item.id),
      ...(list ? { list } : {}),
    });
    return {
      level,
      headline,
      coverage,
      manual: manualItemsForLevel(list, level, [
        ...coverage.notCoveredIds,
        ...(list
          ? []
          : own
              .filter((item) => item.result === "Not assessed")
              .map((item) => item.id)),
      ]),
      listIdentifiers: [
        ...new Set(
          (list?.items ?? [])
            .filter((item) => item.level === level)
            .map((item) => item.identifier),
        ),
      ],
    };
  });
  return {
    benchmark: pack.benchmark,
    version: pack.version,
    level: pack.level,
    assessedAt,
    collection: {
      collectedAt: tenant.collectedAt,
      complete: tenant.complete,
      gaps: tenant.gaps,
      otherProfilePlatforms: tenant.otherProfilePlatforms,
      otherProfiles: tenant.otherProfiles,
    },
    basis,
    settings,
    recommendations,
    levels,
    listUsed: Boolean(list),
    manualNote: MANUAL_NOT_ASSESSED_NOTE,
    notice: {
      text: MANUAL_RECOMMENDATIONS_NOTICE,
      url: MANUAL_RECOMMENDATIONS_URL,
    },
    settingNames: namesFor(settings, recommendations, {
      ...tenant.definitions,
      ...options.names,
    }),
  };
}

/** Every setting definition id the pack names: roots, nested settings and recommendation settings. */
function namedIds(
  settings: readonly SettingFinding[],
  recommendations: readonly RecommendationResult[],
): Set<string> {
  const ids = new Set<string>();
  for (const finding of settings)
    for (const id of definitionIds(finding.recommended)) ids.add(id);
  for (const item of recommendations)
    for (const setting of item.settings) ids.add(setting.id);
  return ids;
}

function namesFor(
  settings: readonly SettingFinding[],
  recommendations: readonly RecommendationResult[],
  known: SettingNames,
): SettingNames {
  const names: SettingNames = {};
  for (const id of namedIds(settings, recommendations))
    if (Object.hasOwn(known, id)) names[id] = known[id]!;
  return names;
}

/** Setting ids the pack names that no definition names yet, sorted. */
export function unnamedSettingIds(
  assessment: Pick<
    BenchmarkAssessment,
    "settings" | "recommendations" | "settingNames"
  >,
): string[] {
  return [...namedIds(assessment.settings, assessment.recommendations)]
    .filter((id) => !Object.hasOwn(assessment.settingNames, id))
    .sort();
}

/**
 * The assessment with more display names: the names are merged (known ones
 * win) and every value text is written again with them. Verdicts do not
 * change; names never take part in a comparison.
 */
export function withSettingNames(
  assessment: BenchmarkAssessment,
  extra: SettingNames,
): BenchmarkAssessment {
  const all = { ...extra, ...assessment.settingNames };
  const settingNames = namesFor(
    assessment.settings,
    assessment.recommendations,
    all,
  );
  return {
    ...assessment,
    settingNames,
    settings: assessment.settings.map((finding) => ({
      ...finding,
      recommendedValue: recommendedValue(
        finding.recommended,
        finding.settingId,
        settingNames,
      ),
      observations: finding.observations.map((observation) => ({
        ...observation,
        current: settingValue(observation.value, finding.settingId, settingNames),
        ...differencesOf(
          finding.recommended,
          observation.value,
          finding.settingId,
          settingNames,
        ),
      })),
    })),
  };
}

/** One result row of a Level: a recommendation, or a pack setting for a Level judged by settings. */
export type AssessmentResult =
  | {
      kind: "recommendation";
      level: BenchmarkLevel;
      /** Recommendation id; unique within the Level. */
      id: string;
      key: string;
      result: ResultState;
      reason?: ReasonCode;
      recommendation: RecommendationResult;
    }
  | {
      kind: "setting";
      level: BenchmarkLevel;
      /** Setting id; a setting may appear once per pack platform. */
      id: string;
      /** The finding key, unique within the assessment. */
      key: string;
      result: ResultState;
      reason?: ReasonCode;
      finding: SettingFinding;
    };

/**
 * The results each Level's headline counts, in Level order: recommendations
 * of the Level when it is judged by recommendations, otherwise the settings
 * of the pack of that Level. Every export and view lists these.
 */
export function assessmentResults(
  assessment: Pick<
    BenchmarkAssessment,
    "levels" | "recommendations" | "settings"
  >,
): AssessmentResult[] {
  return assessment.levels.flatMap(({ level, headline }): AssessmentResult[] =>
    headline.basis === "recommendations"
      ? assessment.recommendations
          .filter((item) => item.level === level)
          .map((item) =>
            withReason(
              {
                kind: "recommendation" as const,
                level,
                id: item.id,
                key: `r:${level}:${item.id}`,
                result: item.result,
                recommendation: item,
              },
              item.reason,
            ),
          )
      : assessment.settings
          .filter((finding) => finding.packLevel === level)
          .map((finding) =>
            withReason(
              {
                kind: "setting" as const,
                level,
                id: finding.settingId,
                key: `s:${finding.key}`,
                result: finding.result,
                finding,
              },
              finding.reason,
            ),
          ),
  );
}

/**
 * The Levels whose stored exceptions an assessment applies: the Level of
 * each pack compared and the compared Level (a Level 2 exception also
 * applies to the Level 1 part, exceptionsForLevel). A Level 2 pack holding
 * Level 1 recommendations applies Level 2 exceptions only.
 */
export function exceptionLevels(
  assessment: Pick<
    BenchmarkAssessment,
    "level" | "settings" | "recommendations"
  >,
): BenchmarkLevel[] {
  return [
    ...new Set<BenchmarkLevel>([
      assessment.level,
      ...assessment.settings.map((finding) => finding.packLevel),
      ...assessment.recommendations.map((item) => item.packLevel),
    ]),
  ].sort((a, b) => a - b);
}

/**
 * Assessments of the Level 1 and Level 2 packs of one benchmark version as
 * one: Level 2 packs add to Level 1, so choosing Level 2 shows both. Each
 * part keeps its own verdicts, headline and coverage; finding keys get the
 * pack Level as a prefix so they stay unique, and the compared Level is the
 * highest. Parts must be of one benchmark, version and collection and show
 * different Levels.
 */
export function combineLevelAssessments(
  parts: readonly BenchmarkAssessment[],
): BenchmarkAssessment {
  if (!parts.length) throw new Error("No assessment to combine.");
  if (parts.length === 1) return parts[0]!;
  const [first] = parts as [BenchmarkAssessment, ...BenchmarkAssessment[]];
  const shown = new Set<number>();
  for (const part of parts) {
    if (part.benchmark !== first.benchmark || part.version !== first.version)
      throw new Error("Only Levels of one benchmark version are combined.");
    for (const { level } of part.levels) {
      if (shown.has(level))
        throw new Error(`Level ${level} is shown by two packs.`);
      shown.add(level);
    }
  }
  const prefixed = (part: BenchmarkAssessment, key: string) =>
    `L${part.level}/${key}`;
  const bases = new Set(
    parts.flatMap((part) => part.levels.map((item) => item.headline.basis)),
  );
  return {
    benchmark: first.benchmark,
    version: first.version,
    level: Math.max(...parts.map((part) => part.level)) as BenchmarkLevel,
    assessedAt: first.assessedAt,
    collection: {
      ...first.collection,
      gaps: [...new Set(parts.flatMap((part) => part.collection.gaps))],
    },
    basis:
      bases.size === 1 ? [...bases][0]! : "mixed",
    settings: parts.flatMap((part) =>
      part.settings.map((finding) => ({
        ...finding,
        key: prefixed(part, finding.key),
      })),
    ),
    recommendations: parts.flatMap((part) =>
      part.recommendations.map((item) => ({
        ...item,
        findingKeys: item.findingKeys.map((key) => prefixed(part, key)),
        settings: item.settings.map((setting) => ({
          ...setting,
          findingKeys: setting.findingKeys.map((key) => prefixed(part, key)),
        })),
      })),
    ),
    levels: parts
      .flatMap((part) => part.levels)
      .sort((a, b) => a.level - b.level),
    listUsed: parts.some((part) => part.listUsed),
    manualNote: first.manualNote,
    notice: first.notice,
    settingNames: Object.assign(
      {},
      ...parts.map((part) => part.settingNames),
    ) as SettingNames,
  };
}

/**
 * The verdicts of an assessment again, with other assignment states for
 * some observations: what the engine would decide if those policies were
 * assigned. Only findings holding a changed observation, and the
 * recommendations naming them, are judged again; profile choices stay.
 * Uses the same judgement as the assessment, so a simulated verdict never
 * claims more than a real one.
 */
export function reassess(
  assessment: Pick<
    BenchmarkAssessment,
    "settings" | "recommendations" | "collection"
  >,
  assignmentOf: (observation: Observation) => AssignmentState,
): { settings: Map<string, ResultState>; recommendations: Map<string, ResultState> } {
  const tenant: TenantProof = {
    complete: assessment.collection.complete,
    otherProfilePlatforms: assessment.collection.otherProfilePlatforms,
  };
  const changed = new Set<string>();
  const findings = assessment.settings.map((finding) => {
    if (finding.reason === "profileChoice") return finding;
    let touched = false;
    const observations = finding.observations.map((observation) => {
      const assignment = assignmentOf(observation);
      if (assignment === observation.assignment) return observation;
      touched = true;
      return { ...observation, assignment };
    });
    if (!touched) return finding;
    changed.add(finding.key);
    const next = { ...finding, observations };
    delete (next as { reason?: ReasonCode }).reason;
    return { ...next, ...judgeFinding(next, tenant) };
  });
  const settings = new Map(
    findings
      .filter((finding) => changed.has(finding.key))
      .map((finding) => [finding.key, finding.result]),
  );
  const recommendations = new Map<string, ResultState>();
  for (const level of new Set(findings.map((finding) => finding.packLevel))) {
    const own = findings.filter((finding) => finding.packLevel === level);
    const affected = assessment.recommendations.filter(
      (item) =>
        item.packLevel === level &&
        item.findingKeys.some((key) => changed.has(key)),
    );
    if (!affected.length) continue;
    // recommendationResults reads the pack keys of one part.
    const results = recommendationResults(
      own,
      affected.map((item) => ({
        id: item.id,
        title: item.title,
        level: item.level,
        settings: item.settings.map((setting) => setting.id),
      })),
      tenant,
      level,
    );
    for (const item of results)
      recommendations.set(`${item.level}:${item.id}`, item.result);
  }
  return { settings, recommendations };
}
