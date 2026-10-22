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
 * - Different only with a readable observed value that differs.
 * - Present only when every observation holding the setting is readable and
 *   matches, and the collection is complete (an unread policy may hold
 *   another value).
 * - Pass needs Present on at least one assigned policy (owner decision
 *   2026-10-22); unassigned policies holding the same value do not change
 *   that. Review (notAssigned) only when every matching policy is unassigned,
 *   Review (assignmentUnknown) when none is assigned and an assignment could
 *   not be read.
 * - A pack value this app cannot read is never compared: Review
 *   (packValueUnreadable), never Different or Missing.
 * - A recommendation naming a setting outside the pack is Not assessed.
 * - The headline is Pass / (Pass + Fail); Review and Not assessed are counted
 *   but never lower it; null when nothing was assessed.
 */
import {
  comparable,
  compareDefinition,
  compareRoot,
  definitionIds,
  parsePolicies,
  readableRecommendation,
  type BaselinePolicy,
  type Comparison,
  type RecordJson,
} from "./policies";
import {
  appliesOn,
  exceptionKey,
  localDate,
  type BenchmarkException,
} from "./exceptions";
import { computeCoverage, type LevelCoverage } from "./coverage";
import {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
  manualItemsForLevel,
  type ManualItemView,
} from "./manual";
import {
  mayBeSetElsewhere,
  tenantSettings,
  type AssignmentState,
  type BenchmarkCollection,
  type TenantSettings,
} from "./tenant-settings";
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
  | "assignmentUnknown"
  | "settingOutsidePack"
  | "otherProfiles"
  | "packValueUnreadable";

export interface Observation {
  policyId: string;
  policyName: string;
  templated: boolean;
  assignment: AssignmentState;
  /** The tenant root instance, cleaned of export annotations. */
  value: RecordJson;
  /** This root against the recommended root. */
  comparison: Comparison;
}

export interface SettingFinding {
  /** policyIndex:settingIndex in the pack. */
  key: string;
  policyIndex: number;
  settingIndex: number;
  /** Name of the pack policy; in memory only, never stored. */
  policyName: string;
  platforms: string;
  settingId: string;
  status: SettingStatus;
  result: ResultState;
  reason?: ReasonCode;
  recommended: RecordJson;
  observations: Observation[];
}

export interface RecommendationSettingResult {
  id: string;
  status: SettingStatus | "Unmapped";
  result: ResultState;
  reason?: ReasonCode;
  findingKeys: string[];
}

export interface RecommendationResult {
  id: string;
  /** Delivered with the pack; in memory only, never stored. */
  title: string;
  level: BenchmarkLevel;
  result: ResultState;
  reason?: ReasonCode;
  settings: RecommendationSettingResult[];
  findingKeys: string[];
  /** Declared settings whose result is not Pass. */
  openSettingIds: string[];
}

export interface ResultCounts {
  pass: number;
  fail: number;
  review: number;
  notAssessed: number;
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
  level: BenchmarkLevel;
  assessedAt: string;
  collection: Pick<TenantSettings, "collectedAt" | "complete" | "gaps">;
  basis: "recommendations" | "settings";
  settings: SettingFinding[];
  recommendations: RecommendationResult[];
  levels: LevelSummary[];
  /** True when a recommendation list for this benchmark and version was used. */
  listUsed: boolean;
  manualNote: string;
  notice: { text: string; url: string };
}

export interface AssessOptions {
  list?: RecommendationList;
  exceptions?: readonly BenchmarkException[];
  now?: Date | string;
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
  const holding = states.filter(({ state }) => state.holds === "yes");
  const holders = holding.map(({ observation }) => observation);
  if (holding.some(({ state }) => state.comparison === "differ"))
    return { status: "Different", holders };
  const readable = readableRecommendation(recommended, definitionId);
  const maybe = states.some(({ state }) => state.holds === "maybe");
  if (!holding.length && !maybe) {
    if (!proof.complete)
      return { status: "Review", reason: "collectionIncomplete", holders };
    if (!readable)
      return { status: "Review", reason: "packValueUnreadable", holders };
    if (proof.elsewhere)
      return { status: "Review", reason: "otherProfiles", holders };
    return { status: "Missing", holders };
  }
  // A match below an unreadable pack parent is not a reading of the pack.
  if (!readable)
    return { status: "Review", reason: "packValueUnreadable", holders };
  if (maybe || holding.some(({ state }) => state.comparison === "unknown"))
    return { status: "Review", reason: "unreadableValue", holders };
  if (!proof.complete)
    return { status: "Review", reason: "collectionIncomplete", holders };
  return { status: "Present", holders };
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

/** Setting results of every pack root against the tenant values. */
export function compareSettings(
  policies: readonly BaselinePolicy[],
  tenant: TenantSettings,
): SettingFinding[] {
  const observations = new Map<string, Observation[]>();
  for (const policy of tenant.policies) {
    if (!policy.platforms) continue;
    for (const instance of policy.settings) {
      const id = instance.settingDefinitionId;
      if (typeof id !== "string") continue;
      const key = `${policy.platforms}:${id}`;
      const list = observations.get(key) ?? [];
      list.push({
        policyId: policy.id,
        policyName: policy.name,
        templated: policy.templated,
        assignment: policy.assignment,
        value: instance,
        comparison: "unknown",
      });
      observations.set(key, list);
    }
  }
  const recommended = new Map<string, Set<string>>();
  for (const policy of policies)
    for (const { settingInstance } of policy.settings) {
      const key = `${policy.platforms}:${settingInstance.settingDefinitionId}`;
      const values = recommended.get(key) ?? new Set<string>();
      values.add(JSON.stringify(comparable(settingInstance)));
      recommended.set(key, values);
    }
  return policies.flatMap((policy, policyIndex) =>
    policy.settings.map(({ settingInstance }, settingIndex) => {
      const settingId = settingInstance.settingDefinitionId;
      const key = `${policy.platforms}:${settingId}`;
      const observed = (observations.get(key) ?? []).map((observation) => ({
        ...observation,
        comparison: compareRoot(settingInstance, observation.value),
      }));
      const base = {
        key: `${policyIndex}:${settingIndex}`,
        policyIndex,
        settingIndex,
        policyName: policy.name,
        platforms: policy.platforms,
        settingId,
        recommended: settingInstance,
        observations: observed,
      };
      // Several recommended values for one definition need a profile choice first.
      if ((recommended.get(key)?.size ?? 0) > 1)
        return {
          ...base,
          status: "Review" as const,
          result: "Review" as const,
          reason: "profileChoice" as const,
        };
      const judgement = judge(settingInstance, observed, settingId, {
        complete: tenant.complete,
        elsewhere: mayBeSetElsewhere(tenant, policy.platforms),
      });
      const { result, reason } = resultOf(judgement);
      return withReason(
        { ...base, status: judgement.status, result },
        reason ?? judgement.reason,
      );
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
  tenant: Pick<TenantSettings, "complete" | "otherProfilePlatforms">,
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
          const judged = mapped.map((finding) => {
            const judgement = judge(
              finding.recommended,
              finding.observations,
              id,
              {
                complete: tenant.complete,
                elsewhere: mayBeSetElsewhere(tenant, finding.platforms),
              },
            );
            return { judgement, ...resultOf(judgement) };
          });
          const status =
            STATUS_ORDER.find((candidate) =>
              judged.some(({ judgement }) => judgement.status === candidate),
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
 * The headline of one Level. An exception credits a Fail item only when every
 * setting of it that does not pass is Fail and has an exception that applies
 * on the as-of date; Review items are excluded from the rate either way.
 */
function levelHeadline(
  basis: LevelHeadline["basis"],
  items: ReadonlyArray<{
    result: ResultState;
    failing: Array<{ id: string; result: ResultState }>;
  }>,
  exceptionFor: (settingId: string) => BenchmarkException | undefined,
): LevelHeadline {
  const counts = countResults(items);
  const used = new Map<string, BenchmarkException>();
  let credited = 0;
  for (const item of items) {
    if (item.result !== "Fail") continue;
    if (item.failing.some((setting) => setting.result !== "Fail")) continue;
    const exceptions = item.failing.map((setting) => exceptionFor(setting.id));
    if (!exceptions.length || exceptions.some((exception) => !exception))
      continue;
    credited += 1;
    for (const exception of exceptions) used.set(exception!.id, exception!);
  }
  const rate = headlineRate(counts);
  return {
    basis,
    rate,
    adjusted:
      used.size && rate !== null
        ? (counts.pass + credited) / (counts.pass + counts.fail)
        : null,
    exceptionIds: [...used.keys()],
    counts,
  };
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
  const settings = compareSettings(policies, tenant);
  const recommendations = recommendationResults(
    settings,
    pack.recommendations ?? [],
    tenant,
  );
  const basis = recommendations.length ? "recommendations" : "settings";
  const list = matchingList(pack, options.list);
  const applicable = new Map(
    (options.exceptions ?? [])
      .filter(
        (exception) =>
          exception.benchmark === pack.benchmark &&
          exception.version === pack.version &&
          exception.level === pack.level &&
          appliesOn(exception, today),
      )
      .map((exception) => [
        exceptionKey(
          exception.benchmark,
          exception.version,
          exception.level,
          exception.settingId,
        ),
        exception,
      ]),
  );
  const exceptionFor = (settingId: string) =>
    applicable.get(
      exceptionKey(pack.benchmark, pack.version, pack.level, settingId),
    );
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
            })),
            exceptionFor,
          )
        : levelHeadline(
            basis,
            settings.map((finding) => ({
              result: finding.result,
              failing:
                finding.result === "Pass"
                  ? []
                  : [{ id: finding.settingId, result: finding.result }],
            })),
            exceptionFor,
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
  };
}
