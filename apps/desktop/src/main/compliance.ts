import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import type { TokenProvider } from "../../../../src/lib/graph-client";
import {
  assessCompliance,
  BSI_IT_GRUNDSCHUTZ,
  compareControlIds,
  createEvidenceManifest,
  CYBER_ESSENTIALS,
  DEF_STAN_05_138,
  essentialEightFramework,
  HIPAA_OUTSIDE_INTUNE_SCOPE,
  HIPAA_SECURITY_RULE,
  ISO_27001,
  NIS2,
  NIS2_OUTSIDE_INTUNE_SCOPE,
  NIST_800_171,
  NIST_800_171_R3,
  NIST_800_53,
  NIST_CSF,
  SOC_2,
} from "../../../../src/lib/compliance";
import {
  BASELINE_REJECTION_MESSAGES,
  compareBaseline,
} from "../../../../src/lib/compliance/management/baseline";
import { cisByControl } from "../../../../src/lib/compliance/management/crosswalk";
import { buildManagementSummary } from "../../../../src/lib/compliance/management/management-summary";
import type {
  BaselineDelta,
  BaselineFile,
  Crosswalk,
  ManagementSummary,
  OutsideScopeMeasure,
} from "../../../../src/lib/compliance/management/types";
import { frameworkCoverageLabel } from "../../../../src/lib/compliance/presentation";
import type {
  AssessmentScope,
  ComplianceAssessment,
  CompliancePlatform,
  FrameworkDefinition,
} from "../../../../src/lib/compliance/types";
import type {
  ComplianceFrameworkId,
  ComplianceReportProgress,
  ComplianceRequest,
  ComplianceView,
  ManagementUnassignedConfig,
} from "../shared/ipc-types";
import { localDateStamp } from "../shared/dates";
import { getCollectionOwner, getLastCollection } from "./collect";

type Collection = NonNullable<ReturnType<typeof getLastCollection>>;

// Unmapped measures listed in the management summary, where the framework
// publishes them.
const OUTSIDE_SCOPE: Partial<
  Record<ComplianceFrameworkId, readonly OutsideScopeMeasure[]>
> = {
  "nis2-2022-2555": NIS2_OUTSIDE_INTUNE_SCOPE,
  "hipaa-security-rule": HIPAA_OUTSIDE_INTUNE_SCOPE,
};

// Order of view.frameworks. The picker order comes from the renderer's
// FRAMEWORK_OPTIONS, which places NIS2 after ISO 27001.
const FRAMEWORKS: Record<ComplianceFrameworkId, () => FrameworkDefinition> = {
  "essential-eight": () => essentialEightFramework(1),
  "iso-27001-2022": () => ISO_27001,
  "soc2-tsc": () => SOC_2,
  "nist-800-53-r5": () => NIST_800_53,
  "nist-csf-2": () => NIST_CSF,
  "bsi-it-grundschutz": () => BSI_IT_GRUNDSCHUTZ,
  "def-stan-05-138-i4": () => DEF_STAN_05_138,
  "cyber-essentials-v3": () => CYBER_ESSENTIALS,
  "nist-800-171-r2": () => NIST_800_171,
  "nist-800-171-r3": () => NIST_800_171_R3,
  "nis2-2022-2555": () => NIS2,
  "hipaa-security-rule": () => HIPAA_SECURITY_RULE,
};
const FRAMEWORK_IDS = Object.keys(FRAMEWORKS) as ComplianceFrameworkId[];
const PLATFORMS: readonly CompliancePlatform[] = [
  "windows",
  "macos",
  "ios",
  "android",
];

function isFrameworkId(value: unknown): value is ComplianceFrameworkId {
  return (
    typeof value === "string" &&
    (FRAMEWORK_IDS as readonly string[]).includes(value)
  );
}

export function parseFrameworkId(value: unknown): ComplianceFrameworkId {
  if (!isFrameworkId(value)) throw new Error("Unknown compliance framework.");
  return value;
}

// The renderer is trusted but still only gets to pick from known values.
export function parseComplianceRequest(
  input: unknown,
  requireFramework: boolean,
): ComplianceRequest {
  const raw = (input ?? {}) as { frameworkId?: unknown; scope?: unknown };
  const frameworkId = raw.frameworkId ?? null;
  if (frameworkId !== null && !isFrameworkId(frameworkId)) {
    throw new Error("Unknown compliance framework.");
  }
  if (requireFramework && frameworkId === null) {
    throw new Error("Choose a compliance framework first.");
  }
  const rawScope = (raw.scope ?? {}) as Record<string, unknown>;
  const scope: AssessmentScope = {};
  if (rawScope.platforms !== undefined) {
    const platforms = rawScope.platforms;
    if (
      !Array.isArray(platforms) ||
      platforms.length === 0 ||
      !platforms.every((platform) =>
        (PLATFORMS as readonly unknown[]).includes(platform),
      )
    ) {
      throw new Error("Select at least one supported platform.");
    }
    scope.platforms = [...new Set(platforms as CompliancePlatform[])];
  }
  const level = rawScope.essentialEightMaturityLevel;
  if (level !== undefined) {
    if (level !== 1 && level !== 2 && level !== 3) {
      throw new Error("The Essential Eight target must be level 1, 2 or 3.");
    }
    scope.essentialEightMaturityLevel = level;
  }
  const risk = rawScope.defStanRiskLevel;
  if (risk !== undefined) {
    if (risk !== 0 && risk !== 1 && risk !== 2 && risk !== 3) {
      throw new Error("The Def Stan risk level must be 0, 1, 2 or 3.");
    }
    scope.defStanRiskLevel = risk;
  }
  return { frameworkId, scope };
}

function requireCollection(owner: string): Collection {
  const collection = getLastCollection();
  if (!collection || getCollectionOwner() !== owner) {
    throw new Error("Collect tenant data first.");
  }
  return collection;
}

// Group ids referenced by assignments and Conditional Access user conditions,
// the same set the website resolves for its compliance view.
function referencedGroupIds(collection: Collection): string[] {
  const ids = new Set<string>();
  for (const section of collection.sections) {
    for (const item of section.items as Array<Record<string, any>>) {
      for (const assignment of Array.isArray(item.assignments)
        ? item.assignments
        : []) {
        const groupId = assignment?.target?.groupId;
        if (typeof groupId === "string" && groupId) ids.add(groupId);
      }
      const users = item.conditions?.users;
      for (const id of [
        ...(Array.isArray(users?.includeGroups) ? users.includeGroups : []),
        ...(Array.isArray(users?.excludeGroups) ? users.excludeGroups : []),
      ]) {
        if (typeof id === "string" && id) ids.add(id);
      }
    }
  }
  return [...ids];
}

// Resolved once per collection. A failed lookup keeps the identifiers, as on
// the website, is not cached and is retried with the next request.
const groupNameCache = new WeakMap<Collection, Promise<Map<string, string>>>();

async function groupNamesFor(
  collection: Collection,
  token: TokenProvider,
): Promise<{ names: Map<string, string>; resolved: boolean }> {
  let pending = groupNameCache.get(collection);
  if (!pending) {
    pending = (async () => {
      const ids = referencedGroupIds(collection);
      if (ids.length === 0) return new Map<string, string>();
      const { GroupResolver } = await import(
        "../../../../src/lib/group-resolver"
      );
      return new GroupResolver(token).getGroupNames(ids);
    })();
    groupNameCache.set(collection, pending);
  }
  try {
    return { names: await pending, resolved: true };
  } catch {
    if (groupNameCache.get(collection) === pending) {
      groupNameCache.delete(collection);
    }
    return { names: new Map<string, string>(), resolved: false };
  }
}

function assessmentData(
  collection: Collection,
  groupNames: Map<string, string>,
  scope: AssessmentScope,
): DetailedExportData {
  return {
    ...(collection as unknown as DetailedExportData),
    assessmentScope: scope,
    groupNames,
  };
}

const MAX_CACHED_SCOPES = 12;
const assessmentCache = new WeakMap<
  Collection,
  Map<string, ComplianceAssessment>
>();

function scopeKey(scope: AssessmentScope): string {
  return JSON.stringify([
    scope.platforms ? [...scope.platforms].sort() : null,
    scope.essentialEightMaturityLevel ?? 1,
    scope.defStanRiskLevel ?? null,
  ]);
}

// Only assessments built with resolved group names are cached, so a retry
// after a failed lookup assesses again.
function assess(
  collection: Collection,
  groupNames: { names: Map<string, string>; resolved: boolean },
  scope: AssessmentScope,
): ComplianceAssessment {
  let byScope = assessmentCache.get(collection);
  if (!byScope) {
    byScope = new Map();
    assessmentCache.set(collection, byScope);
  }
  const key = scopeKey(scope);
  const cached = byScope.get(key);
  if (cached) return cached;
  const assessment = assessCompliance(
    assessmentData(collection, groupNames.names, scope),
  );
  if (!groupNames.resolved) return assessment;
  if (byScope.size >= MAX_CACHED_SCOPES) byScope.clear();
  byScope.set(key, assessment);
  return assessment;
}

// Per-owner management state from management.ts. The crosswalk and baselines
// are applied here, outside the assessment cache.
export interface ManagementContext {
  tenantId: string | null;
  baselines: ReadonlyMap<string, BaselineFile>;
  crosswalk: { crosswalk: Crosswalk; fileName: string } | null;
}

export const EMPTY_MANAGEMENT_CONTEXT: ManagementContext = {
  tenantId: null,
  baselines: new Map(),
  crosswalk: null,
};

export function managementSummaryFor(
  assessment: ComplianceAssessment,
  frameworkId: ComplianceFrameworkId,
): ManagementSummary {
  return buildManagementSummary(assessment, frameworkId, {
    outsideScope: OUTSIDE_SCOPE[frameworkId],
  });
}

// Mapped capabilities configured on a policy without an assignment, with the
// framework controls that list them.
export function unassignedConfigs(
  assessment: ComplianceAssessment,
  frameworkId: ComplianceFrameworkId,
): ManagementUnassignedConfig[] {
  const selected = assessment.frameworks.find(
    (framework) => framework.framework.id === frameworkId,
  );
  if (!selected) return [];
  const seen = new Set<string>();
  const result: ManagementUnassignedConfig[] = [];
  for (const { capability, status } of assessment.capabilities) {
    if (status !== "configuredNotAssigned" || seen.has(capability.id)) continue;
    const controlIds = selected.controls
      .filter((control) => control.capabilityIds.includes(capability.id))
      .map((control) => control.control.id)
      .sort(compareControlIds);
    if (controlIds.length === 0) continue;
    seen.add(capability.id);
    result.push({
      capabilityId: capability.id,
      name: capability.name,
      controlIds,
    });
  }
  return result.sort((a, b) =>
    a.capabilityId < b.capabilityId
      ? -1
      : a.capabilityId > b.capabilityId
        ? 1
        : 0,
  );
}

// The delta against a loaded baseline, or null when there is none or it no
// longer matches the current tenant, framework or scope.
export function baselineDelta(
  summary: ManagementSummary,
  context: ManagementContext,
): BaselineDelta | null {
  const file = context.baselines.get(summary.frameworkId);
  if (!file || !context.tenantId) return null;
  const compared = compareBaseline(summary, context.tenantId, file);
  return compared.ok ? compared.delta : null;
}

// Why a loaded baseline cannot be compared any more, for example after the
// scope changed; null when it can.
export function baselineMismatch(
  summary: ManagementSummary,
  context: ManagementContext,
): string | null {
  const file = context.baselines.get(summary.frameworkId);
  if (!file || !context.tenantId) return null;
  const compared = compareBaseline(summary, context.tenantId, file);
  return compared.ok ? null : BASELINE_REJECTION_MESSAGES[compared.reason].en;
}

export function crosswalkCisFor(
  context: ManagementContext,
  frameworkId: ComplianceFrameworkId,
  controlIds: readonly string[],
): Record<string, string[]> {
  return context.crosswalk
    ? cisByControl(context.crosswalk.crosswalk, frameworkId, controlIds)
    : {};
}

// The picker needs every framework's summary; the control list only the
// selected framework and the capabilities its controls reference.
export function toView(
  assessment: ComplianceAssessment,
  frameworkId: ComplianceFrameworkId | null,
  context: ManagementContext = EMPTY_MANAGEMENT_CONTEXT,
): ComplianceView {
  const byId = new Map(
    assessment.frameworks.map((framework) => [
      framework.framework.id,
      framework,
    ]),
  );
  const selected = frameworkId ? byId.get(frameworkId) : undefined;
  const capabilityIds = new Set(
    selected?.controls.flatMap((control) => control.capabilityIds) ?? [],
  );
  const management =
    selected && frameworkId
      ? managementSummaryFor(assessment, frameworkId)
      : null;
  const baseline = frameworkId ? context.baselines.get(frameworkId) : undefined;
  return {
    disclaimer: assessment.disclaimer,
    scope: assessment.scope,
    collectedAt: assessment.provenance.collectedAt ?? null,
    rulesetVersion: assessment.provenance.rulesetVersion,
    collectionCoverage: assessment.collectionCoverage,
    frameworks: FRAMEWORK_IDS.flatMap((id) => {
      const framework = byId.get(id);
      if (!framework) return [];
      return [
        {
          id,
          name: framework.framework.name,
          version: framework.framework.version,
          totalRequirements: framework.framework.totalRequirements,
          totalControls: framework.summary.totalControls,
          coverageLabel: frameworkCoverageLabel(framework),
        },
      ];
    }),
    selected:
      selected && frameworkId && management
        ? {
            framework: selected.framework,
            coverageLabel: frameworkCoverageLabel(selected),
            controls: selected.controls,
            capabilities: assessment.capabilities
              .filter((result) => capabilityIds.has(result.capability.id))
              .map(({ capability, ...result }) => ({
                ...result,
                capability: {
                  id: capability.id,
                  name: capability.name,
                  caveat: capability.caveat,
                },
              })),
            management,
            delta: baselineDelta(management, context),
            baseline: baseline
              ? {
                  generatedAt: baseline.generatedAt,
                  rulesetChanged:
                    baseline.rulesetVersion !== management.rulesetVersion,
                  mismatch: baselineMismatch(management, context),
                }
              : null,
            crosswalk: context.crosswalk
              ? {
                  rows: context.crosswalk.crosswalk.rows.length,
                  issues: context.crosswalk.crosswalk.issues.length,
                  fileName: context.crosswalk.fileName,
                }
              : null,
            crosswalkCis: crosswalkCisFor(
              context,
              frameworkId,
              selected.controls.map((control) => control.control.id),
            ),
            unassigned: unassignedConfigs(assessment, frameworkId),
          }
        : null,
  };
}

// The assessment behind the view, for the management handlers.
export async function complianceAssessment(
  owner: string,
  token: TokenProvider,
  scope: AssessmentScope,
): Promise<ComplianceAssessment> {
  const collection = requireCollection(owner);
  const groupNames = await groupNamesFor(collection, token);
  return assess(collection, groupNames, scope);
}

export async function complianceView(
  owner: string,
  token: TokenProvider,
  request: ComplianceRequest,
  context: ManagementContext = EMPTY_MANAGEMENT_CONTEXT,
): Promise<ComplianceView> {
  return toView(
    await complianceAssessment(owner, token, request.scope),
    request.frameworkId,
    context,
  );
}

// Reports and baselines name the tenant by a shortened id only.
export function tenantLabelOf(tenantId: string | null): string | undefined {
  return tenantId ? `${tenantId.slice(0, 8)}...` : undefined;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function complianceReport(
  owner: string,
  token: TokenProvider,
  request: ComplianceRequest & { frameworkId: ComplianceFrameworkId },
  tenantId: string | null,
  onProgress: (progress: ComplianceReportProgress) => void,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const collection = requireCollection(owner);
  onProgress({ stage: "groups" });
  const { names: groupNames } = await groupNamesFor(collection, token);
  onProgress({ stage: "generating" });
  // Lets the progress event leave before the generator holds the thread.
  await yieldToEventLoop();
  const { complianceReportFileName, generateComplianceReportPDF } =
    await import("../../../../src/lib/compliance/report-pdf");
  const tenantLabel = tenantLabelOf(tenantId);
  const bytes = await generateComplianceReportPDF(
    assessmentData(collection, groupNames, request.scope),
    {
      frameworkId: request.frameworkId,
      metadata: tenantLabel ? { tenantLabel } : undefined,
    },
  );
  return {
    fileName: complianceReportFileName(
      request.frameworkId,
      tenantLabel,
      request.scope.essentialEightMaturityLevel ?? 1,
    ),
    bytes,
  };
}

// The machine readable evidence record the website offers next to the PDF.
export async function complianceRecord(
  owner: string,
  token: TokenProvider,
  request: ComplianceRequest,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const collection = requireCollection(owner);
  const { names: groupNames } = await groupNamesFor(collection, token);
  const manifest = await createEvidenceManifest(
    assessmentData(collection, groupNames, request.scope),
    request.scope,
  );
  return {
    fileName: `compliance-evidence-${localDateStamp()}.json`,
    bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  };
}

export function frameworkSourceUrl(frameworkId: unknown): string {
  if (!isFrameworkId(frameworkId)) {
    throw new Error("Unknown compliance framework.");
  }
  const url = FRAMEWORKS[frameworkId]().source?.url;
  if (!url || new URL(url).protocol !== "https:") {
    throw new Error("This framework has no publisher reference.");
  }
  return url;
}
