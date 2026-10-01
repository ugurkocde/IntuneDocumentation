import { compareControlIds } from "../engine";
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
  };
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
    const tier = result && TIER_BY_STATUS[result.status];
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
    outsideScope: [...(options.outsideScope ?? [])],
  };
}
