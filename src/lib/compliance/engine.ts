import type { DetailedExportData } from "../configuration-analyzer";
import type { ConfigurationSettingInstance } from "../intune-detailed-client";
import { summarizeAssignments } from "./assignments";
import { evaluatePolicyCheck } from "./policy-checks";
import {
  buildCollectionCoverage,
  collectConfigurations,
  isCapabilityCollectionIncomplete,
} from "./coverage";
import { COMPLIANCE_CAPABILITIES } from "./capabilities";
import { BSI_IT_GRUNDSCHUTZ } from "./frameworks/bsi-it-grundschutz";
import { CYBER_ESSENTIALS } from "./frameworks/cyber-essentials";
import { DEF_STAN_05_138 } from "./frameworks/def-stan-05-138";
import { ISO_27001 } from "./frameworks/iso-27001";
import { NIST_800_53 } from "./frameworks/nist-800-53";
import { NIST_800_171 } from "./frameworks/nist-800-171";
import { NIST_800_171_R3 } from "./frameworks/nist-800-171-r3";
import { NIST_CSF } from "./frameworks/nist-csf";
import { SOC_2 } from "./frameworks/soc2";
import type {
  AssessmentScope,
  CapabilityEvidence,
  CapabilityResult,
  CapabilityStatus,
  ComplianceAssessment,
  ComplianceCapability,
  ControlAssessment,
  ControlStatus,
  DetectionSignal,
  FrameworkAssessment,
  FrameworkDefinition,
  ValueExpectation,
  EvidenceKind,
} from "./types";

export type ComplianceExportData = Omit<DetailedExportData, "groupNames"> & {
  groupNames?: Map<string, string> | Readonly<Record<string, string>>;
};

export const COMPLIANCE_DISCLAIMER =
  "This assessment reports technical evidence found in the Intune tenant configuration. It is not a compliance certification and does not replace an audit. Absence of evidence means no matching Intune policy was detected, not that a requirement is unmet through other means.";

export const COMPLIANCE_RULESET_VERSION = "2026.09.2";

const controlIdCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

export function compareControlIds(left: string, right: string): number {
  return controlIdCollator.compare(left, right);
}

function satisfies(value: unknown, expectation: ValueExpectation): boolean {
  switch (expectation.kind) {
    case "equals":
      return value === expectation.value;
    case "oneOf":
      return expectation.values.some((candidate) => candidate === value);
    case "atLeast":
      return typeof value === "number" && value >= expectation.value;
    case "atMost":
      return typeof value === "number" && value <= expectation.value;
    case "nonEmptyString":
      return typeof value === "string" && value.trim().length > 0;
  }
}

export function normalizeOdataType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/^#/, "")
    .replace(/^microsoft\.graph\./, "")
    .toLowerCase();
}

function resolvePropertyPath(config: unknown, path: string): unknown {
  let current: unknown = config;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// Flattens a settings catalog policy into definitionId -> configured primitive
// values, walking choice/group children so nested settings are evaluated too.
export function collectCatalogValues(
  settings: unknown,
): Map<string, Array<string | number | boolean>> {
  const values = new Map<string, Array<string | number | boolean>>();

  const record = (definitionId: string | undefined, value: unknown) => {
    if (!definitionId) return;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      return;
    }
    const existing = values.get(definitionId);
    if (existing) existing.push(value);
    else values.set(definitionId, [value]);
  };

  const visit = (instance: ConfigurationSettingInstance | undefined) => {
    if (!instance || typeof instance !== "object") return;
    const definitionId = instance.settingDefinitionId;

    if (instance.simpleSettingValue) {
      record(definitionId, instance.simpleSettingValue.value);
    }
    for (const item of instance.simpleSettingCollectionValue ?? []) {
      record(definitionId, item.value);
    }
    if (instance.choiceSettingValue) {
      record(definitionId, instance.choiceSettingValue.value);
      instance.choiceSettingValue.children?.forEach(visit);
    }
    for (const choice of instance.choiceSettingCollectionValue ?? []) {
      record(definitionId, choice.value);
      choice.children?.forEach(visit);
    }
    instance.groupSettingValue?.children?.forEach(visit);
    for (const group of instance.groupSettingCollectionValue ?? []) {
      group.children?.forEach(visit);
    }
  };

  if (Array.isArray(settings)) {
    for (const setting of settings) {
      visit(
        (setting as { settingInstance?: ConfigurationSettingInstance })
          ?.settingInstance,
      );
    }
  }
  return values;
}

function normalizeGroupNames(value: unknown): Map<string, string> {
  if (value instanceof Map) {
    return new Map(
      [...value.entries()].filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }
  return new Map(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function compliancePolicyNote(
  config: Record<string, unknown>,
): string | undefined {
  const odataType = normalizeOdataType(config["@odata.type"]);
  if (!odataType.endsWith("compliancepolicy")) return undefined;

  const scheduledActions = Array.isArray(config.scheduledActionsForRule)
    ? config.scheduledActionsForRule
    : [];
  const blockActions = scheduledActions
    .flatMap((rule: any) => rule?.scheduledActionConfigurations ?? [])
    .filter((action: any) => action?.actionType === "block");
  const grace = blockActions.map((action: any) =>
    typeof action.gracePeriodHours === "number"
      ? `${action.gracePeriodHours} hours`
      : "unknown grace period",
  );
  return `Compliance requirement, not an observed device state. ${grace.length ? `Marks noncompliant after ${grace.join(", ")}. ` : "Noncompliance action timing is unavailable. "}Resource access depends on applicable Conditional Access policies; effective access is unverified.`;
}

function verdictsFor(
  values: readonly unknown[],
  signal: Exclude<DetectionSignal, { source: "policyCheck" }>,
) {
  return [...new Set(values)].flatMap<{
    verdict: "enforced" | "disabled";
    observed: unknown;
  }>((value) => {
    if (satisfies(value, signal.enforcedWhen))
      return [{ verdict: "enforced" as const, observed: value }];
    if (signal.disabledWhen && satisfies(value, signal.disabledWhen))
      return [{ verdict: "disabled" as const, observed: value }];
    return [];
  });
}

function legacyValues(
  config: Record<string, any>,
  signal: Extract<DetectionSignal, { settingId: string }>,
): unknown[] {
  if (signal.source === "administrativeTemplate")
    return (config.definitionValues ?? [])
      .filter((value: any) => value?.definition?.id === signal.settingId)
      .map((value: any) => value.enabled);
  if (signal.source === "omaUri")
    return (config.omaSettings ?? [])
      .filter((value: any) => value?.omaUri === signal.settingId)
      .map((value: any) => value.value);
  const settings = [
    ...(Array.isArray(config.settings) ? config.settings : []),
    ...(config.categories ?? []).flatMap(
      (category: any) => category?.settings ?? [],
    ),
  ];
  return settings
    .filter((setting: any) => setting?.definitionId === signal.settingId)
    .flatMap((setting: any) => {
      if (["boolean", "string", "number"].includes(typeof setting.value))
        return [setting.value];
      if (typeof setting.valueJson !== "string") return [];
      try {
        const value = JSON.parse(setting.valueJson);
        return typeof value === "object" && value !== null
          ? [value.value]
          : [value];
      } catch {
        return [];
      }
    });
}

function evaluateConfiguration(
  config: Record<string, unknown>,
  capabilities: readonly ComplianceCapability[],
  groupNames: ReadonlyMap<string, string>,
): CapabilityEvidence[] {
  const evidence: CapabilityEvidence[] = [];
  const catalogValues = collectCatalogValues(config.settings);
  const odataType = normalizeOdataType(config["@odata.type"]);
  const assignment = summarizeAssignments(
    config.assignments,
    groupNames,
    Boolean(
      config.collectionStatus &&
        (config.collectionStatus as any).assignments !== "complete",
    ),
  );
  const kind: EvidenceKind = odataType.endsWith("compliancepolicy")
    ? "complianceRequirement"
    : odataType === "conditionalaccesspolicy"
      ? "accessPolicy"
      : "configuration";
  const note = compliancePolicyNote(config);
  if (kind === "accessPolicy") {
    const ca = config as any;
    assignment.state = ca.state === "enabled" ? "assigned" : "notAssigned";
    assignment.targets = [
      `Users: ${JSON.stringify(ca.conditions?.users ?? {})}`,
      `Applications: ${JSON.stringify(ca.conditions?.applications ?? {})}`,
    ];
    assignment.exclusions = [];
    // Preserve every condition, including device filters, locations, risk and client types.
    assignment.targets.push(
      `Conditions: ${JSON.stringify(ca.conditions ?? {})}`,
    );
  }

  const policyId = typeof config.id === "string" ? config.id : "";
  const policyName =
    (typeof config.displayName === "string" && config.displayName) ||
    (typeof config.name === "string" && config.name) ||
    "Unnamed policy";
  const policyType =
    (typeof config.configType === "string" && config.configType) ||
    odataType ||
    "Unknown";

  for (const capability of capabilities) {
    for (const signal of capability.signals) {
      let values: unknown[] = [];
      let settingId: string;
      let matches: Array<{
        verdict: "enforced" | "disabled";
        observed: unknown;
      }>;
      if (signal.source === "policyCheck") {
        settingId = signal.check;
        const match = evaluatePolicyCheck(config, signal.check);
        matches = match ? [match] : [];
      } else {
        if (signal.source === "settingsCatalog") {
          settingId = signal.settingDefinitionId;
          values = catalogValues.get(settingId) ?? [];
        } else if (signal.source === "graphProperty") {
          if (
            !signal.odataTypes.some((type) => type.toLowerCase() === odataType)
          )
            continue;
          settingId = signal.propertyPath;
          const value = resolvePropertyPath(config, settingId);
          if (value === undefined || value === null) continue;
          values = [value];
        } else {
          settingId = signal.settingId;
          values = legacyValues(config, signal);
        }
        matches = verdictsFor(values, signal);
      }
      for (const match of matches)
        evidence.push({
          capabilityId: capability.id,
          policyId,
          policyName,
          policyType,
          familyKey:
            typeof config.__evidenceFamily === "string"
              ? config.__evidenceFamily
              : undefined,
          source: signal.source,
          settingId,
          observedValue: String(match.observed),
          verdict: match.verdict,
          assignment,
          kind,
          note,
          requirementGroup: signal.requirementGroup,
          policyVersion:
            typeof config.version === "number" ||
            typeof config.version === "string"
              ? String(config.version)
              : undefined,
          policyModifiedAt:
            typeof config.lastModifiedDateTime === "string"
              ? config.lastModifiedDateTime
              : undefined,
        });
    }
  }

  return evidence;
}

function capabilityStatus(
  evidence: readonly CapabilityEvidence[],
  capability: ComplianceCapability,
): CapabilityStatus {
  const assigned = evidence.filter(
    (item) => item.assignment.state === "assigned",
  );
  const positive = assigned.filter((item) => item.verdict === "enforced");
  if (positive.length && assigned.some((item) => item.verdict === "disabled"))
    return "conflictingEvidence";
  if (positive.length) {
    if (capability.requiredGroups?.length) {
      // Do not assemble a complete setting from policies with different scopes.
      const policyKeys = new Set(
        positive.map((item) => `${item.policyType}:${item.policyId}`),
      );
      const complete = [...policyKeys].some((key) =>
        capability.requiredGroups!.every((group) =>
          positive.some(
            (item) =>
              `${item.policyType}:${item.policyId}` === key &&
              item.requirementGroup === group,
          ),
        ),
      );
      if (!complete) return "partialConfiguration";
    }
    return positive.some((item) => item.kind !== "complianceRequirement")
      ? "enforced"
      : "requirementAssigned";
  }
  if (evidence.some((item) => item.assignment.state === "unknown"))
    return "assignmentUnknown";
  if (evidence.some((item) => item.verdict === "enforced"))
    return "configuredNotAssigned";
  if (evidence.some((item) => item.verdict === "disabled"))
    return "disabledByPolicy";
  return "noEvidence";
}

export function hasAssignedEvidence(status: CapabilityStatus): boolean {
  return status === "enforced" || status === "requirementAssigned";
}

export function assessCapabilities(
  data: ComplianceExportData,
  capabilities: readonly ComplianceCapability[] = COMPLIANCE_CAPABILITIES,
  scope: AssessmentScope = data.assessmentScope ?? {},
): CapabilityResult[] {
  const configurations = collectConfigurations(data);
  const groupNames = normalizeGroupNames(data.groupNames);
  const evidenceByCapability = new Map<string, CapabilityEvidence[]>();

  for (const config of configurations) {
    for (const item of evaluateConfiguration(
      config,
      capabilities,
      groupNames,
    )) {
      const existing = evidenceByCapability.get(item.capabilityId);
      if (existing) existing.push(item);
      else evidenceByCapability.set(item.capabilityId, [item]);
    }
  }

  return capabilities.map((capability) => {
    const evidence = evidenceByCapability.get(capability.id) ?? [];
    const incomplete = isCapabilityCollectionIncomplete(data, capability);
    let status = capabilityStatus(evidence, capability);
    if (status === "noEvidence" && incomplete) status = "collectionIncomplete";
    if (
      scope.platforms &&
      capability.platform !== "tenant" &&
      !scope.platforms.includes(capability.platform)
    )
      status = "notApplicable";
    return {
      capability,
      status,
      evidence,
      limitations: [
        ...(evidence.some((item) => item.assignment.state === "unknown")
          ? [
              "Assignment data is unavailable for some matching policies; effective targeting remains unknown.",
            ]
          : []),
        ...(incomplete
          ? [
              "Relevant policy collection is incomplete; additional or contradictory evidence may be missing.",
            ]
          : []),
        ...(status === "conflictingEvidence"
          ? [
              "Mixed policy evidence. Review profile settings and targeting overlap; a device conflict has not been established.",
            ]
          : []),
        ...(status === "partialConfiguration"
          ? [
              "Not all required settings are present together on an assigned policy.",
            ]
          : []),
        ...(capability.caveat ? [capability.caveat.en] : []),
      ],
    };
  });
}

export function assessFramework(
  capabilityResults: readonly CapabilityResult[],
  framework: FrameworkDefinition,
  scope: AssessmentScope = {},
): FrameworkAssessment {
  const capabilitiesByControl = new Map<string, string[]>();
  for (const [capabilityId, controlIds] of Object.entries(framework.mappings)) {
    for (const controlId of controlIds) {
      const existing = capabilitiesByControl.get(controlId);
      if (existing) existing.push(capabilityId);
      else capabilitiesByControl.set(controlId, [capabilityId]);
    }
  }

  const statusById = new Map(
    capabilityResults.map((result) => [result.capability.id, result.status]),
  );

  const controls: ControlAssessment[] = Object.values(framework.controls)
    .sort((a, b) => compareControlIds(a.id, b.id))
    .map((control) => {
      const mappedIds = capabilitiesByControl.get(control.id) ?? [];
      const excludedCapabilityIds = mappedIds.filter(
        (id) => statusById.get(id) === "notApplicable",
      );
      const capabilityIds = mappedIds.filter(
        (id) => !excludedCapabilityIds.includes(id),
      );
      const relevant = capabilityResults.filter((result) =>
        capabilityIds.includes(result.capability.id),
      );
      const enforcedCapabilityIds = relevant
        .filter((result) => hasAssignedEvidence(result.status))
        .map((result) => result.capability.id);
      const unassessedAspects = [...(control.unassessedAspects ?? [])];
      if (control.evidenceStrength !== "direct" && !unassessedAspects.length)
        unassessedAspects.push(
          "These settings support part of this control. Remaining technical and organizational requirements need separate assessment.",
        );
      let status: ControlStatus = "noEvidence";
      const outsidePlatformScope =
        scope.platforms &&
        control.platforms &&
        !control.platforms.some((platform) =>
          scope.platforms!.includes(platform),
        );
      const outsideRiskScope =
        scope.defStanRiskLevel !== undefined &&
        control.riskLevels &&
        !control.riskLevels.includes(scope.defStanRiskLevel);
      if (outsidePlatformScope || outsideRiskScope) status = "notApplicable";
      else if (!capabilityIds.length) {
        status = "notAssessed";
        unassessedAspects.push(
          "No detector is available for this control in the selected platform scope.",
        );
      } else if (
        relevant.some((result) => result.status === "conflictingEvidence")
      )
        status = "conflictingEvidence";
      else if (
        enforcedCapabilityIds.length ||
        relevant.some((result) => result.status === "partialConfiguration")
      ) {
        status =
          enforcedCapabilityIds.length === capabilityIds.length &&
          control.evidenceStrength === "direct" &&
          !unassessedAspects.length &&
          !relevant.some((result) => result.limitations.length)
            ? "evidenceFound"
            : "partialEvidence";
      } else if (
        relevant.some((result) =>
          ["collectionIncomplete", "assignmentUnknown"].includes(result.status),
        )
      )
        status = "notAssessed";
      for (const result of relevant)
        for (const limitation of result.limitations)
          if (!unassessedAspects.includes(limitation))
            unassessedAspects.push(limitation);
      return {
        control,
        capabilityIds: status === "notApplicable" ? [] : capabilityIds,
        enforcedCapabilityIds:
          status === "notApplicable" ? [] : enforcedCapabilityIds,
        status,
        unassessedAspects,
        excludedCapabilityIds:
          status === "notApplicable" ? mappedIds : excludedCapabilityIds,
      };
    });

  return {
    framework: {
      id: framework.id,
      name: framework.name,
      version: framework.version,
      note: framework.note,
      source: framework.source,
      totalRequirements: framework.totalRequirements,
    },
    controls,
    summary: {
      totalControls: controls.length,
      withEvidence: controls.filter((c) => c.status === "evidenceFound").length,
      partial: controls.filter((c) => c.status === "partialEvidence").length,
      withoutEvidence: controls.filter((c) => c.status === "noEvidence").length,
      notApplicable: controls.filter((c) => c.status === "notApplicable")
        .length,
      notAssessed: controls.filter((c) => c.status === "notAssessed").length,
      conflicting: controls.filter((c) => c.status === "conflictingEvidence")
        .length,
      applicableControls: controls.filter((c) => c.status !== "notApplicable")
        .length,
    },
  };
}

export function assessCompliance(
  data: ComplianceExportData,
  scope: AssessmentScope = data.assessmentScope ?? {},
): ComplianceAssessment {
  const capabilities = assessCapabilities(data, COMPLIANCE_CAPABILITIES, scope);
  return {
    generatedAt: new Date().toISOString(),
    disclaimer: COMPLIANCE_DISCLAIMER,
    capabilities,
    scope,
    collectionCoverage: buildCollectionCoverage(data, capabilities),
    provenance: {
      rulesetVersion: COMPLIANCE_RULESET_VERSION,
      collectedAt: data.collectedAt,
      collectionStartedAt: data.collectionStartedAt,
      deviceState: "notCollected",
      effectiveAccess: "unverified",
    },
    frameworks: [
      assessFramework(capabilities, NIST_800_53, scope),
      assessFramework(capabilities, NIST_CSF, scope),
      assessFramework(capabilities, BSI_IT_GRUNDSCHUTZ, scope),
      assessFramework(capabilities, ISO_27001, scope),
      assessFramework(capabilities, SOC_2, scope),
      assessFramework(capabilities, DEF_STAN_05_138, scope),
      assessFramework(capabilities, CYBER_ESSENTIALS, scope),
      assessFramework(capabilities, NIST_800_171, scope),
      assessFramework(capabilities, NIST_800_171_R3, scope),
    ],
  };
}
