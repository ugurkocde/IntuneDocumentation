import {
  compareControlIds,
  excludedByAlternative,
  hasAssignedEvidence,
  hasUnreadData,
} from "../engine";
import type {
  AssessmentScope,
  CapabilityResult,
  CapabilityStatus,
  ComplianceAssessment,
  ControlStatus,
  FrameworkAssessment,
} from "../types";
import { unknownAssignmentReasons } from "../assignments";
import { isIdentifier } from "../graph-rows";
import { portalAreaFor, PORTAL_AREAS } from "./portal-links";
import type {
  ManagementMetrics,
  ManagementSummary,
  NextAction,
  NextActionTier,
  OutsideScopeMeasure,
  SafeguardCount,
  SafeguardState,
} from "./types";

// Management view of one framework assessment: evidence coverage counts and a
// deterministic list of next actions. Counts only consider capabilities mapped
// to the framework's assessed controls (README rule 8).

/** Highest priority first; mirrors the NextActionTier documentation order. */
const TIER_ORDER: readonly NextActionTier[] = [
  "conflicting",
  "assignedDeviation",
  "partial",
  "unassigned",
  "missing",
];

const TIER_BY_STATUS: Partial<Record<CapabilityStatus, NextActionTier>> = {
  conflictingEvidence: "conflicting",
  disabledByPolicy: "assignedDeviation",
  partialConfiguration: "partial",
  configuredNotAssigned: "unassigned",
  noEvidence: "missing",
};

const DATA_GAP_STATUSES: readonly CapabilityStatus[] = [
  "assignmentUnknown",
  "collectionIncomplete",
];

/** Capability ids referenced by the framework's assessed controls. */
function mappedCapabilityIds(fa: FrameworkAssessment): Set<string> {
  return new Set(fa.controls.flatMap((control) => control.capabilityIds));
}

/** Mapped capability ids whose result is configured and assigned. */
function inPlaceCapabilityIds(
  capabilities: readonly CapabilityResult[],
): Set<string> {
  return new Set(
    capabilities
      .filter((result) => hasAssignedEvidence(result.status))
      .map((result) => result.capability.id),
  );
}

/**
 * Capabilities without evidence whose alternative is in use, or which cannot
 * be combined with the Conditional Access policies that exist. They are not
 * safeguards to count. An unreadable alternative stays counted, as a data gap.
 */
function alternativeIds(
  capabilities: readonly CapabilityResult[],
): Set<string> {
  return new Set(
    capabilities
      .filter(excludedByAlternative)
      .map((result) => result.capability.id),
  );
}

/**
 * A value on a policy that can take effect could not be read, and nothing
 * else gives the capability evidence. Unassigned (disabled or report-only)
 * policies cannot put a safeguard in place, so their unreadable values do
 * not count.
 */
function hasUnreadablePolicyValue(result: CapabilityResult): boolean {
  return (
    result.status === "noEvidence" &&
    !result.alternative &&
    result.checks.some(
      (check) =>
        check.assessmentStatus === "unableToCheck" &&
        // A policy check names its policy, also one Graph returned without
        // an id (""); collection checks name none.
        check.policyId !== undefined &&
        check.assignment?.state !== "notAssigned",
    )
  );
}

/**
 * Whether a data gap comes from assignments that were read completely but
 * whose effective targeting could not be resolved (AssignmentSummary
 * uncertainty "unresolved"), of the capability or of the alternative it
 * depends on: "only" when that is its only cause, which a review of the
 * overlapping assignments settles and collecting again does not; "partly"
 * when assignments or other data that could not be read add to it, such as
 * a failed collection page or an unreadable value (hasUnreadData), which
 * needs both.
 */
function unresolvedTargeting(
  result: CapabilityResult,
): "only" | "partly" | undefined {
  if (result.alternative) {
    if (result.alternative.state !== "unknown") return undefined;
    return result.alternative.targetingUnresolved
      ? "only"
      : result.alternative.targetingPartlyUnresolved
        ? "partly"
        : undefined;
  }
  if (result.status !== "assignmentUnknown") return undefined;
  const { incomplete, unresolved } = unknownAssignmentReasons(
    result.evidence.map((item) => item.assignment),
  );
  if (!unresolved) return undefined;
  return incomplete || hasUnreadData(result) ? "partly" : "only";
}

const targetingUnresolved = (result: CapabilityResult) =>
  unresolvedTargeting(result) === "only";

function isDataGap(result: CapabilityResult): boolean {
  return (
    DATA_GAP_STATUSES.includes(result.status) ||
    result.alternative?.state === "unknown" ||
    hasUnreadablePolicyValue(result)
  );
}

/**
 * Mapped data gaps (metrics.dataGaps) that targeting that could not be
 * resolved causes alone (only) or beside data that could not be read
 * (partly).
 */
function unresolvedDataGaps(
  fa: FrameworkAssessment,
  capabilities: readonly CapabilityResult[],
  kind: "only" | "partly",
): number {
  const mapped = mappedCapabilityIds(fa);
  return new Set(
    capabilities
      .filter(
        (result) =>
          mapped.has(result.capability.id) &&
          isDataGap(result) &&
          unresolvedTargeting(result) === kind,
      )
      .map((result) => result.capability.id),
  ).size;
}

function safeguardCount(
  capabilityIds: Iterable<string>,
  inPlace: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
): SafeguardCount {
  const ids = new Set([...capabilityIds].filter((id) => !excluded.has(id)));
  return {
    inPlace: [...ids].filter((id) => inPlace.has(id)).length,
    total: ids.size,
  };
}

function countStatus(fa: FrameworkAssessment, status: ControlStatus): number {
  return fa.controls.filter((control) => control.status === status).length;
}

export function computeMetrics(
  fa: FrameworkAssessment,
  capabilities: readonly CapabilityResult[],
  totalRequirements: number | undefined = fa.framework.totalRequirements,
  notEvaluated = 0,
): ManagementMetrics {
  const evidenceFound = countStatus(fa, "evidenceFound");
  const partialEvidence = countStatus(fa, "partialEvidence");
  const noEvidence = countStatus(fa, "noEvidence");
  const conflicting = countStatus(fa, "conflictingEvidence");
  const assessable = evidenceFound + partialEvidence + noEvidence + conflicting;
  const withEvidence = evidenceFound + partialEvidence;

  const mapped = mappedCapabilityIds(fa);
  const mappedResults = capabilities.filter((result) =>
    mapped.has(result.capability.id),
  );
  const distinctWhere = (keep: (result: CapabilityResult) => boolean) =>
    new Set(mappedResults.filter(keep).map((result) => result.capability.id))
      .size;

  const safeguards = safeguardCount(
    mapped,
    inPlaceCapabilityIds(capabilities),
    alternativeIds(capabilities),
  );

  return {
    assessable,
    withEvidence,
    coveragePct: assessable
      ? Math.floor((withEvidence * 100) / assessable)
      : null,
    withoutEvidence: noEvidence,
    conflicting,
    unassignedConfigs: distinctWhere(
      (result) => result.status === "configuredNotAssigned",
    ),
    outsideIntuneScope:
      totalRequirements === undefined
        ? null
        : Math.max(
            0,
            totalRequirements - fa.summary.totalControls - notEvaluated,
          ),
    dataGaps: distinctWhere(isDataGap),
    safeguardsTotal: safeguards.total,
    safeguardsInPlace: safeguards.inPlace,
    safeguardPct: safeguards.total
      ? Math.floor((safeguards.inPlace * 100) / safeguards.total)
      : null,
  };
}

/**
 * Measures with at least one safeguard in place, over measures with at least
 * one mapped safeguard. Derived from the safeguard counts so every measure
 * figure agrees; metrics.withEvidence stays for older baselines.
 */
export function measuresWithSafeguards(
  summary: Pick<ManagementSummary, "safeguards">,
): { withSafeguard: number; total: number } {
  const mapped = Object.values(summary.safeguards).filter(
    (count) => count.total > 0,
  );
  return {
    withSafeguard: mapped.filter((count) => count.inPlace > 0).length,
    total: mapped.length,
  };
}

/** A non-enforcing value switches a protection off only where it is assigned. */
function switchesOffAssigned(result: CapabilityResult): boolean {
  return result.evidence.some(
    (item) =>
      item.verdict === "disabled" && item.assignment.state === "assigned",
  );
}

/** Plain-language state of one safeguard for the management report. */
export function safeguardState(result: CapabilityResult): SafeguardState {
  if (result.alternative)
    return result.alternative.state === "inUse"
      ? "alternativeInUse"
      : result.alternative.state === "notCombinable"
        ? "notCombinable"
        : targetingUnresolved(result)
          ? "targetingUnresolved"
          : "dataMissing";
  // Tenant-wide Entra settings are not policies that switch something off.
  if (
    result.status === "disabledByPolicy" &&
    result.capability.signals.some((signal) => signal.source === "tenantPolicy")
  )
    return "tenantSettingDiffers";
  if (hasUnreadablePolicyValue(result)) return "dataMissing";
  switch (result.status) {
    case "enforced":
    case "requirementAssigned":
      return "inPlace";
    case "partialConfiguration":
      return "partial";
    case "configuredNotAssigned":
      return "notAssigned";
    case "disabledByPolicy":
      return switchesOffAssigned(result) ? "switchedOff" : "notConfigured";
    case "conflictingEvidence":
      return "conflicting";
    case "assignmentUnknown":
      return targetingUnresolved(result)
        ? "targetingUnresolved"
        : "dataMissing";
    case "collectionIncomplete":
      return "dataMissing";
    default:
      return "notConfigured";
  }
}

/**
 * Distinct policies behind a safeguard, assigned ones first, then by name:
 * policies with evidence and every policy a check read, such as the
 * tenant-wide Entra policy, a policy that leaves the setting not configured
 * and one whose value could not be read, so a read policy never shows as
 * "No policy found".
 */
export function safeguardPolicies(
  result: CapabilityResult,
): { name: string; assigned: boolean }[] {
  const byId = new Map<string, { name: string; assigned: boolean }>();
  // Only a Graph id names one policy. Policies without one are told apart
  // by name and assignment, so one is never shown with the assignment of
  // another.
  const add = (policyId: string, name: string, assigned: boolean) => {
    const id = isIdentifier(policyId)
      ? policyId
      : `\u0000${name}\u0000${assigned}`;
    const known = byId.get(id);
    if (known) known.assigned ||= assigned;
    else byId.set(id, { name, assigned });
  };
  for (const item of result.evidence)
    add(item.policyId, item.policyName, item.assignment.state === "assigned");
  for (const check of result.checks)
    if (
      check.policyId !== undefined &&
      check.policyName &&
      check.assessmentStatus !== "outsideScope"
    )
      add(
        check.policyId,
        check.policyName,
        check.assignment?.state === "assigned",
      );
  return [...byId.values()].sort(
    (a, b) =>
      Number(b.assigned) - Number(a.assigned) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

export function rankNextActions(
  fa: FrameworkAssessment,
  capabilities: readonly CapabilityResult[],
  limit = 5,
): NextAction[] {
  const resultById = new Map(
    capabilities.map((result) => [result.capability.id, result]),
  );
  // Controls without any evidence; closing these gaps comes first.
  const gapControlIds = new Set(
    fa.controls
      .filter(
        (control) =>
          control.status === "noEvidence" ||
          control.status === "conflictingEvidence",
      )
      .map((control) => control.control.id),
  );
  const candidates: Omit<NextAction, "rank">[] = [];
  for (const id of mappedCapabilityIds(fa)) {
    const result = resultById.get(id);
    // Never recommend a safeguard whose alternative is in use or unreadable,
    // or which cannot be combined with existing Conditional Access policies,
    // such as security defaults in a Conditional Access tenant.
    if (result?.alternative) continue;
    // A value that could not be read is a data gap, not a safeguard to set up.
    if (result && hasUnreadablePolicyValue(result)) continue;
    // A non-enforcing value only switches a protection off where the policy
    // is assigned; in an unassigned policy the protection is simply missing.
    const tier =
      result?.status === "disabledByPolicy" && !switchesOffAssigned(result)
        ? "missing"
        : result && TIER_BY_STATUS[result.status];
    if (!result || !tier) continue;
    const controlIds = fa.controls
      .filter(
        (control) =>
          control.status !== "evidenceFound" &&
          control.capabilityIds.includes(id),
      )
      .map((control) => control.control.id)
      .sort(compareControlIds);
    if (!controlIds.length) continue;
    const area = portalAreaFor(result.capability);
    candidates.push({
      capabilityId: id,
      name: result.capability.name,
      tier,
      controlIds,
      area,
      url: PORTAL_AREAS[area].url,
    });
  }
  const gapCount = (action: Omit<NextAction, "rank">) =>
    action.controlIds.filter((id) => gapControlIds.has(id)).length;
  const ordered = candidates.sort(
    (a, b) =>
      Number(gapCount(b) > 0) - Number(gapCount(a) > 0) ||
      TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
      b.controlIds.length - a.controlIds.length ||
      (a.capabilityId < b.capabilityId
        ? -1
        : a.capabilityId > b.capabilityId
          ? 1
          : 0),
  );
  // Spread the short list across controls: take the first action that
  // reaches a control no earlier pick covers, and only then repeat controls.
  const picked: Omit<NextAction, "rank">[] = [];
  const covered = new Set<string>();
  while (picked.length < Math.max(0, limit) && ordered.length) {
    const index = Math.max(
      0,
      ordered.findIndex((action) =>
        action.controlIds.some((id) => !covered.has(id)),
      ),
    );
    const [action] = ordered.splice(index, 1);
    picked.push(action!);
    for (const id of action!.controlIds) covered.add(id);
  }
  return picked.map((action, rank) => ({ ...action, rank }));
}

/** Same key as the desktop main process uses for its assessment cache. */
export function scopeKeyOf(scope: AssessmentScope): string {
  return JSON.stringify([
    scope.platforms ? [...scope.platforms].sort() : null,
    scope.essentialEightMaturityLevel ?? 1,
    scope.defStanRiskLevel ?? null,
  ]);
}

export function buildManagementSummary(
  assessment: ComplianceAssessment,
  frameworkId: string,
  options: {
    outsideScope?: readonly OutsideScopeMeasure[];
    limit?: number;
  } = {},
): ManagementSummary {
  const fa = assessment.frameworks.find(
    (item) => item.framework.id === frameworkId,
  );
  if (!fa)
    throw new Error(`Framework ${frameworkId} is not in this assessment.`);
  const inPlace = inPlaceCapabilityIds(assessment.capabilities);
  const excluded = alternativeIds(assessment.capabilities);
  const unresolved = unresolvedDataGaps(fa, assessment.capabilities, "only");
  const partly = unresolvedDataGaps(fa, assessment.capabilities, "partly");
  return {
    frameworkId,
    frameworkName: fa.framework.name,
    frameworkVersion: fa.framework.version,
    generatedAt: assessment.generatedAt,
    rulesetVersion: assessment.provenance.rulesetVersion,
    scopeKey: scopeKeyOf(assessment.scope),
    metrics: computeMetrics(
      fa,
      assessment.capabilities,
      fa.framework.totalRequirements,
      (options.outsideScope ?? []).filter((measure) => measure.notEvaluated)
        .length,
    ),
    nextActions: rankNextActions(fa, assessment.capabilities, options.limit),
    controls: Object.fromEntries(
      fa.controls.map((control) => [control.control.id, control.status]),
    ),
    safeguards: Object.fromEntries(
      fa.controls.map((control) => [
        control.control.id,
        safeguardCount(control.capabilityIds, inPlace, excluded),
      ]),
    ),
    outsideScope: [...(options.outsideScope ?? [])],
    ...(unresolved ? { targetingUnresolved: unresolved } : {}),
    ...(partly ? { targetingPartlyUnresolved: partly } : {}),
  };
}
