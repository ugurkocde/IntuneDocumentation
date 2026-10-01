import { compareControlIds, hasAssignedEvidence } from "../engine";
import type {
  AssessmentScope,
  CapabilityResult,
  CapabilityStatus,
  ComplianceAssessment,
  ControlStatus,
  FrameworkAssessment,
} from "../types";
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

function safeguardCount(
  capabilityIds: Iterable<string>,
  inPlace: ReadonlySet<string>,
): SafeguardCount {
  const ids = new Set(capabilityIds);
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
  const distinctWith = (statuses: readonly CapabilityStatus[]) =>
    new Set(
      mappedResults
        .filter((result) => statuses.includes(result.status))
        .map((result) => result.capability.id),
    ).size;

  const safeguards = safeguardCount(mapped, inPlaceCapabilityIds(capabilities));

  return {
    assessable,
    withEvidence,
    coveragePct: assessable
      ? Math.floor((withEvidence * 100) / assessable)
      : null,
    withoutEvidence: noEvidence,
    conflicting,
    unassignedConfigs: distinctWith(["configuredNotAssigned"]),
    outsideIntuneScope:
      totalRequirements === undefined
        ? null
        : Math.max(0, totalRequirements - fa.summary.totalControls),
    dataGaps: distinctWith(DATA_GAP_STATUSES),
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
    case "collectionIncomplete":
      return "dataMissing";
    default:
      return "notConfigured";
  }
}

/** Distinct policies behind a safeguard, assigned ones first, then by name. */
export function safeguardPolicies(
  result: CapabilityResult,
): { name: string; assigned: boolean }[] {
  const byId = new Map<string, { name: string; assigned: boolean }>();
  for (const item of result.evidence) {
    const assigned = item.assignment.state === "assigned";
    const known = byId.get(item.policyId);
    if (known) known.assigned ||= assigned;
    else byId.set(item.policyId, { name: item.policyName, assigned });
  }
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
  return {
    frameworkId,
    frameworkName: fa.framework.name,
    frameworkVersion: fa.framework.version,
    generatedAt: assessment.generatedAt,
    rulesetVersion: assessment.provenance.rulesetVersion,
    scopeKey: scopeKeyOf(assessment.scope),
    metrics: computeMetrics(fa, assessment.capabilities),
    nextActions: rankNextActions(fa, assessment.capabilities, options.limit),
    controls: Object.fromEntries(
      fa.controls.map((control) => [control.control.id, control.status]),
    ),
    safeguards: Object.fromEntries(
      fa.controls.map((control) => [
        control.control.id,
        safeguardCount(control.capabilityIds, inPlace),
      ]),
    ),
    outsideScope: [...(options.outsideScope ?? [])],
  };
}
