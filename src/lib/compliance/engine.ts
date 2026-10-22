import {
  essentialEightFramework,
  essentialEightLevel,
} from "./frameworks/essential-eight";
import type { DetailedExportData } from "../configuration-analyzer";
import type { ConfigurationSettingInstance } from "../intune-detailed-client";
import { summarizeAssignments } from "./assignments";
import { evaluatePolicyCheck } from "./policy-checks";
import { comparableValue, expectedValue } from "./check-results";
import { policyCheckObservation } from "./policy-check-observation";
import { graphPropertyValues } from "./documented-values";
import { canonicalOmaUri } from "./oma-uri";
import { isIdentifier, unidentifiedSources } from "./graph-rows";
import {
  buildCollectionCoverage,
  collectConfigurations,
  capabilityCollectionGaps,
} from "./coverage";
import { COMPLIANCE_CAPABILITIES } from "./capabilities";
import {
  evaluateTenantPolicySignals,
  TENANT_POLICY_FAMILIES,
  tenantPolicySettingId,
} from "./tenant-policies";
import { CYBER_ESSENTIALS } from "./frameworks/cyber-essentials";
import { DEF_STAN_05_138 } from "./frameworks/def-stan-05-138";
import { ISO_27001 } from "./frameworks/iso-27001";
import { NIST_800_53 } from "./frameworks/nist-800-53";
import { NIST_800_171 } from "./frameworks/nist-800-171";
import { NIST_800_171_R3 } from "./frameworks/nist-800-171-r3";
import { HIPAA_SECURITY_RULE } from "./frameworks/hipaa-security-rule";
import { NIST_CSF } from "./frameworks/nist-csf";
import { NIS2 } from "./frameworks/nis2";
import { DORA } from "./frameworks/dora";
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
  TechnicalCheck,
} from "./types";

export type ComplianceExportData = Omit<DetailedExportData, "groupNames"> & {
  groupNames?: Map<string, string> | Readonly<Record<string, string>>;
};

export const COMPLIANCE_DISCLAIMER =
  "This assessment reports technical evidence found in the Intune tenant configuration. It is not a compliance certification and does not replace an audit. Absence of evidence means no matching Intune policy was detected, not that a requirement is unmet through other means.";

export const COMPLIANCE_RULESET_VERSION = "2026.10.22";

const TENANT_POLICY_FAMILY_KEYS = new Set(
  Object.values(TENANT_POLICY_FAMILIES),
);

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

// Null when Graph returned the property or a parent of it as null (not
// configured), undefined when it omitted one or returned an unsupported
// shape.
function resolvePropertyPath(config: unknown, path: string): unknown {
  let current: unknown = config;
  for (const segment of path.split(".")) {
    if (current === null) return null;
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
    // Presence without a readable primitive is unknown, never a missing setting.
    if (definitionId && !values.has(definitionId)) values.set(definitionId, []);

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

// The row shape checks live in graph-rows.ts, where every engine reads them.
export {
  isIdentifier,
  unidentifiedSources,
  type IdentifiedSource,
} from "./graph-rows";

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
  signal: Exclude<DetectionSignal, { source: "policyCheck" | "tenantPolicy" }>,
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
  if (signal.source === "administrativeTemplate") {
    const definitions = Array.isArray(config.definitionValues)
      ? config.definitionValues
      : [];
    return definitions
      .filter((row: any) => row?.definition?.id === signal.settingId)
      .flatMap((row: any) => {
        if (!signal.presentationId)
          return typeof row.enabled === "boolean" ? [row.enabled] : [];
        if (row.enabled !== true || row.presentationFetchError) return [];
        return (row.presentationValues ?? [])
          .filter(
            (value: any) => value?.presentation?.id === signal.presentationId,
          )
          .map((value: any) => value.value);
      });
  }
  if (signal.source === "omaUri") {
    const uri = canonicalOmaUri(signal.settingId);
    return (config.omaSettings ?? [])
      .filter((value: any) => canonicalOmaUri(value?.omaUri) === uri)
      .map((value: any) => value.value);
  }
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

/**
 * Plain reason for an Intune enum default that sets nothing: Microsoft Learn
 * documents `userDefined` as the default with no intent (the device or user
 * decides) and `notConfigured` as leaving the device default.
 */
function notConfiguredReason(value: unknown): string | undefined {
  if (value === "userDefined")
    return "Not configured in this policy: userDefined is the default with no intent, so the device or the user decides.";
  if (value === "notConfigured")
    return "Not configured in this policy: notConfigured leaves the device default.";
  return undefined;
}

function evaluateConfiguration(
  config: Record<string, unknown>,
  capabilities: readonly ComplianceCapability[],
  groupNames: ReadonlyMap<string, string>,
  checksByCapability: Map<string, TechnicalCheck[]>,
): CapabilityEvidence[] {
  const evidence: CapabilityEvidence[] = [];
  const catalogValues = collectCatalogValues(config.settings);
  const unidentified = unidentifiedSources(config);
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
    // Only a documented state decides whether the policy applies. A state
    // Graph omitted or did not document is unknown, never not assigned.
    assignment.state =
      ca.state === "enabled"
        ? "assigned"
        : ["disabled", "enabledForReportingButNotEnforced"].includes(ca.state)
          ? "notAssigned"
          : "unknown";
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
      // Tenant-wide Entra policies are not configurations; see tenant-policies.ts.
      if (signal.source === "tenantPolicy") continue;
      const checks = checksByCapability.get(capability.id) ?? [];
      checksByCapability.set(capability.id, checks);
      const checked = checks.length;
      let values: unknown[] = [];
      let settingId: string;
      let prerequisiteReason: string | undefined;
      let matches: Array<{
        verdict: "enforced" | "disabled";
        observed: unknown;
      }>;
      if (signal.source === "policyCheck") {
        settingId = signal.check;
        const match = evaluatePolicyCheck(config, signal.check);
        matches = match ? [match] : [];
        if (!match) {
          const observation = policyCheckObservation(config, signal.check);
          if (observation)
            checks.push({
              assessmentStatus: observation.complete
                ? "checked"
                : "unableToCheck",
              result: observation.complete ? "different" : null,
              settingId,
              expectedValue: expectedValue(signal),
              actualValue: observation.actual,
              reason: observation.reason,
              policyId,
              policyName,
              assignment,
            });
        }
      } else {
        if (signal.source === "settingsCatalog") {
          settingId = signal.settingDefinitionId;
          values = catalogValues.get(settingId) ?? [];
          if (catalogValues.has(settingId) && !values.length)
            checks.push({
              assessmentStatus: "unableToCheck",
              result: null,
              settingId,
              expectedValue: expectedValue(signal),
              actualValue: null,
              reason:
                "The setting is present but Graph did not return a readable configured value.",
              policyId,
              policyName,
              assignment,
            });
          if (
            signal.prerequisites?.some((required) => {
              const selected =
                catalogValues.get(required.settingDefinitionId) ?? [];
              return (
                selected.length !== 1 ||
                !required.values.includes(String(selected[0]))
              );
            })
          )
            prerequisiteReason =
              "The required parent setting is missing, disabled, or ambiguous in this policy.";
        } else if (signal.source === "graphProperty") {
          if (
            !signal.odataTypes.some((type) => type.toLowerCase() === odataType)
          )
            continue;
          settingId = signal.propertyPath;
          const value = resolvePropertyPath(config, settingId);
          // Graph returns every property of a template resource, null when
          // not configured. One it omitted is unknown, so it is no check
          // result and never reads as removed evidence.
          if (value === undefined) {
            checks.push({
              assessmentStatus: "unableToCheck",
              result: null,
              settingId,
              expectedValue: expectedValue(signal),
              actualValue: null,
              reason:
                "Graph did not return this property for the policy. Refresh policy details.",
              policyId,
              policyName,
              assignment,
            });
            continue;
          }
          if (value === null) continue;
          // Template resources such as compliance policies and device
          // restrictions return every boolean; false is the "Not configured"
          // default, not a configured value, so it is neither a check result
          // nor counter-evidence.
          if (
            value === false &&
            signal.enforcedWhen.kind === "equals" &&
            signal.enforcedWhen.value === true
          )
            continue;
          values = [value];
        } else {
          settingId = signal.presentationId
            ? `${signal.settingId}/${signal.presentationId}`
            : signal.settingId;
          values = legacyValues(config, signal);
          // Graph returns the custom OMA-URI rows on every custom profile
          // (checked in the lab tenant, 21 October 2026); without them, the
          // profile's values are unknown, not absent.
          if (
            signal.source === "omaUri" &&
            !Array.isArray(config.omaSettings) &&
            odataType === "windows10customconfiguration"
          )
            checks.push({
              assessmentStatus: "unableToCheck",
              result: null,
              settingId,
              expectedValue: expectedValue(signal),
              actualValue: null,
              reason:
                "Graph did not return the custom OMA-URI settings of this profile. Refresh policy details.",
              policyId,
              policyName,
              assignment,
            });
          if (
            signal.source === "administrativeTemplate" &&
            signal.presentationId &&
            !values.length
          ) {
            const rows = (config as any).definitionValues;
            const row = Array.isArray(rows)
              ? rows.find(
                  (item: any) => item?.definition?.id === signal.settingId,
                )
              : undefined;
            if (row)
              checks.push({
                assessmentStatus:
                  row.enabled === false ? "checked" : "unableToCheck",
                result: row.enabled === false ? "different" : null,
                settingId,
                expectedValue: expectedValue(signal),
                actualValue:
                  row.enabled === false ? "Parent policy disabled" : null,
                reason:
                  "This dropdown requires an enabled parent policy and its presentation value.",
                policyId,
                policyName,
                assignment,
              });
          }
        }
        // A row without its identifier may be this setting, so its absence
        // from this configuration is unknown.
        if (
          signal.source !== "graphProperty" &&
          unidentified.has(signal.source) &&
          !values.length &&
          checks.length === checked
        )
          checks.push({
            assessmentStatus: "unableToCheck",
            result: null,
            settingId,
            expectedValue: expectedValue(signal),
            actualValue: null,
            reason:
              "Graph returned a setting of this policy without its identifier, so this setting may be configured in it. Refresh policy details.",
            policyId,
            policyName,
            assignment,
          });
        // A Graph property is read only as a documented value of its type:
        // an Int32 is an integer in range, and an enum one of its documented
        // values. Only readable values are evidence.
        const documented =
          signal.source === "graphProperty"
            ? graphPropertyValues(signal.propertyPath)
            : undefined;
        const isReadable = (value: unknown) =>
          comparableValue(value, signal.enforcedWhen) &&
          (signal.source !== "graphProperty" ||
            (typeof value === "number"
              ? Number.isInteger(value) &&
                value >= -2147483648 &&
                value <= 2147483647
              : typeof value !== "string" ||
                !documented ||
                documented.includes(value)));
        matches = verdictsFor(values.filter(isReadable), signal);
        for (const value of [...new Set(values)]) {
          const readable = isReadable(value);
          const unset =
            signal.source === "graphProperty" &&
            readable &&
            !satisfies(value, signal.enforcedWhen)
              ? notConfiguredReason(value)
              : undefined;
          checks.push({
            assessmentStatus:
              readable && !prerequisiteReason ? "checked" : "unableToCheck",
            result:
              readable && !prerequisiteReason
                ? satisfies(value, signal.enforcedWhen)
                  ? "matches"
                  : "different"
                : null,
            settingId,
            expectedValue: expectedValue(signal),
            actualValue: JSON.stringify(value) ?? null,
            reason:
              prerequisiteReason ??
              (readable
                ? unset
                : documented && typeof value === "string"
                  ? "Graph returned a value it does not document for this property, so it cannot be judged."
                  : "Graph returned an unsupported value shape."),
            policyId,
            policyName,
            assignment,
          });
        }
        if (prerequisiteReason) matches = [];
      }
      if (signal.source === "policyCheck")
        for (const match of matches)
          checks.push({
            assessmentStatus: "checked",
            result: match.verdict === "enforced" ? "matches" : "different",
            settingId,
            expectedValue: expectedValue(signal),
            actualValue: String(match.observed),
            policyId,
            policyName,
            assignment,
          });
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
  policyKey: (item: CapabilityEvidence) => string,
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
      const policyKeys = new Set(positive.map(policyKey));
      const complete = [...policyKeys].some((key) =>
        capability.requiredGroups!.every((group) =>
          positive.some(
            (item) =>
              policyKey(item) === key && item.requirementGroup === group,
          ),
        ),
      );
      if (!complete) {
        // A compliance requirement is supporting evidence for the capability,
        // not a partial attempt to configure all firewall profile settings.
        if (
          positive.some(
            (item) =>
              item.kind === "complianceRequirement" && !item.requirementGroup,
          )
        )
          return "requirementAssigned";
        return "partialConfiguration";
      }
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

/**
 * Whether an alternative is in use or the capability cannot be combined with
 * existing Conditional Access policies. Such a capability is no safeguard to
 * count and no gap; an unreadable alternative (`unknown`) stays counted.
 */
export function excludedByAlternative(result: CapabilityResult): boolean {
  return Boolean(result.alternative && result.alternative.state !== "unknown");
}

/**
 * The capabilities of a control that count as safeguards: every mapped
 * capability in scope except those excluded by an alternative. Reports,
 * registers and the management summary use the same denominator.
 */
export function countedCapabilityIds(
  control: Pick<ControlAssessment, "capabilityIds">,
  capabilities: ReadonlyMap<string, CapabilityResult>,
): string[] {
  return control.capabilityIds.filter((id) => {
    const result = capabilities.get(id);
    return !result || !excludedByAlternative(result);
  });
}

export function assessCapabilities(
  data: ComplianceExportData,
  capabilities: readonly ComplianceCapability[] = COMPLIANCE_CAPABILITIES,
  scope: AssessmentScope = data.assessmentScope ?? {},
): CapabilityResult[] {
  const configurations = collectConfigurations(data);
  const groupNames = normalizeGroupNames(data.groupNames);
  const evidenceByCapability = new Map<string, CapabilityEvidence[]>();
  const checksByCapability = new Map<string, TechnicalCheck[]>();
  // The configuration each piece of evidence came from, so policies without
  // an id are never taken for one policy.
  const origin = new Map<CapabilityEvidence, number>();
  const policyKey = (item: CapabilityEvidence) =>
    isIdentifier(item.policyId)
      ? `${item.policyType}:${item.policyId}`
      : `\u0000${origin.get(item)}`;

  for (const [index, config] of configurations.entries()) {
    for (const item of evaluateConfiguration(
      config,
      capabilities,
      groupNames,
      checksByCapability,
    )) {
      origin.set(item, index);
      const existing = evidenceByCapability.get(item.capabilityId);
      if (existing) existing.push(item);
      else evidenceByCapability.set(item.capabilityId, [item]);
    }
  }

  for (const capability of capabilities) {
    if (!capability.signals.some((signal) => signal.source === "tenantPolicy"))
      continue;
    const tenant = evaluateTenantPolicySignals(data, capability);
    evidenceByCapability.set(capability.id, [
      ...(evidenceByCapability.get(capability.id) ?? []),
      ...tenant.evidence,
    ]);
    checksByCapability.set(capability.id, [
      ...(checksByCapability.get(capability.id) ?? []),
      ...tenant.checks,
    ]);
  }

  const results = capabilities.map((capability) => {
    const evidence = evidenceByCapability.get(capability.id) ?? [];
    const collectionGaps = capabilityCollectionGaps(data, capability);
    const incomplete = collectionGaps.length > 0;
    const checks = checksByCapability.get(capability.id) ?? [];
    if (checks.length && capability.requiredGroups?.length) {
      for (const group of capability.requiredGroups) {
        const groupIds = capability.signals
          .filter((signal) => signal.requirementGroup === group)
          .map((signal) =>
            signal.source === "settingsCatalog"
              ? signal.settingDefinitionId
              : signal.source === "graphProperty"
                ? signal.propertyPath
                : signal.source === "policyCheck"
                  ? signal.check
                  : signal.source === "tenantPolicy"
                    ? tenantPolicySettingId(signal)
                    : signal.settingId,
          );
        if (!checks.some((check) => groupIds.includes(check.settingId)))
          checks.push({
            assessmentStatus:
              incomplete || !data.collectedAt ? "unableToCheck" : "checked",
            result: incomplete || !data.collectedAt ? null : "missing",
            settingId: group,
            expectedValue: capability.signals
              .filter((signal) => signal.requirementGroup === group)
              .map(expectedValue)
              .join("; alternative: "),
            actualValue: null,
            reason:
              "This required setting group was not found. All required groups must be configured together on a policy for complete deployment evidence.",
          });
      }
    }
    // A successful comparison remains visible even when another source failed.
    // Absence is only a result after collection provenance is known and complete.
    if (!checks.length || incomplete) {
      const unable =
        incomplete || !data.collectedAt || !capability.signals.length;
      checks.push({
        assessmentStatus: unable ? "unableToCheck" : "checked",
        result: unable ? null : "missing",
        settingId: capability.id,
        expectedValue: capability.signals
          .map(expectedValue)
          .join("; alternative: "),
        actualValue: null,
        reason: incomplete
          ? collectionGaps
              .map(
                (row) =>
                  `${row.family}: ${row.status}. ${row.errors.join(" ")}`,
              )
              .join(" ")
          : !data.collectedAt
            ? "Collection completeness is unknown for this imported snapshot. Refresh policy data before concluding a setting is missing."
            : !capability.signals.length
              ? "A detector has not been implemented for this check."
              : "No supported setting was found after checking the collected policies.",
      });
    }
    let status = capabilityStatus(evidence, capability, policyKey);
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
      checks:
        status === "notApplicable"
          ? checks.map((check) => ({
              ...check,
              assessmentStatus: "outsideScope" as const,
              result: null,
            }))
          : checks,
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
        ...collectionGaps.map((row) =>
          row.family === "conditionalAccessPolicies" &&
          row.status === "notCollected"
            ? "Conditional Access policies were not collected. Enable Include Conditional Access in Settings, complete sign-in or consent if requested, and refresh the policies to assess MFA and access requirements."
            : TENANT_POLICY_FAMILY_KEYS.has(row.family)
              ? row.status === "notCollected"
                ? "Entra tenant policies were not collected. They are read with the Conditional Access permission: enable Include Conditional Access in Settings, complete sign-in or consent if requested, and refresh the policies."
                : `${row.family}: collection incomplete. ${row.errors.join(" ")}`
              : `${row.family}: ${row.status === "notCollected" ? "not collected" : "collection incomplete"}. Refresh the policies to retry collection. See collection coverage for the API error details.`,
        ),
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
  return applyAlternatives(
    results,
    conditionalAccessState(data, configurations),
  );
}

/**
 * Whether the collection shows a Conditional Access policy in any state
 * (`exists`), shows completely that none exists (`none`), or cannot tell
 * (`unknown`: not collected, incomplete or no collection timestamp). Any
 * existing policy, disabled ones included, prevents turning on security
 * defaults (README "Alternative capabilities").
 */
function conditionalAccessState(
  data: ComplianceExportData,
  configurations: readonly Record<string, any>[],
): "exists" | "none" | "unknown" {
  if (
    configurations.some(
      (config) => config.__evidenceFamily === "conditionalAccessPolicies",
    )
  )
    return "exists";
  if (
    !data.collectedAt ||
    buildCollectionCoverage(data, [], true).some(
      (row) =>
        row.family === "conditionalAccessPolicies" &&
        (row.status === "incomplete" || row.status === "notCollected"),
    )
  )
    return "unknown";
  return "none";
}

/**
 * State of the alternatives of a capability without evidence. An alternative
 * is in use only with assigned enforcing evidence (enforced or
 * requirementAssigned); report-only, disabled, unassigned or merely compared
 * policies never count. A capability exclusive with Conditional Access is not
 * combinable while any Conditional Access policy exists. Unknown when an
 * alternative or, for an exclusive capability, Conditional Access could not
 * be read; unreadable values on unassigned (disabled or report-only) policies
 * do not count. Outside scope and plainly absent alternatives leave the capability
 * a regular gap.
 */
function alternativeOf(
  result: CapabilityResult,
  byId: ReadonlyMap<string, CapabilityResult>,
  conditionalAccess: "exists" | "none" | "unknown",
): CapabilityResult["alternative"] {
  const { alternativeTo = [], exclusiveWithConditionalAccess } =
    result.capability;
  // Only a value that was read and compared counts; an unreadable capability
  // stays a data question of its own.
  if (
    result.status !== "noEvidence" ||
    (!alternativeTo.length && !exclusiveWithConditionalAccess) ||
    !result.checks.some(
      (check) =>
        check.assessmentStatus === "checked" &&
        (check.result === "different" || check.result === "missing"),
    )
  )
    return undefined;
  const alternatives = alternativeTo
    .map((id) => byId.get(id))
    .filter((item): item is CapabilityResult => Boolean(item))
    .filter((item) => item.status !== "notApplicable");
  const inUse = alternatives.filter((item) => hasAssignedEvidence(item.status));
  if (inUse.length)
    return {
      state: "inUse",
      capabilityIds: inUse.map((item) => item.capability.id),
    };
  if (exclusiveWithConditionalAccess && conditionalAccess === "exists")
    return { state: "notCombinable", capabilityIds: [] };
  const unknown = alternatives.filter((item) => {
    if (
      item.status === "collectionIncomplete" ||
      item.status === "assignmentUnknown"
    )
      return true;
    // A disabled or report-only policy cannot enforce the alternative, so its
    // unreadable value leaves nothing open.
    const relevant = item.checks.filter(
      (check) => check.assignment?.state !== "notAssigned",
    );
    return (
      relevant.length > 0 &&
      relevant.every((check) => check.assessmentStatus === "unableToCheck")
    );
  });
  return unknown.length ||
    (exclusiveWithConditionalAccess && conditionalAccess === "unknown")
    ? {
        state: "unknown",
        capabilityIds: unknown.map((item) => item.capability.id),
      }
    : undefined;
}

function alternativeReason(
  alternative: NonNullable<CapabilityResult["alternative"]>,
  byId: ReadonlyMap<string, CapabilityResult>,
): string {
  const names = alternative.capabilityIds
    .map((id) => byId.get(id)!.capability.name)
    .join(", ");
  if (alternative.state === "inUse")
    return `Not a gap: an alternative is configured and assigned in this tenant (${names}).`;
  if (alternative.state === "notCombinable")
    return "Not applicable while Conditional Access policies exist: this setting cannot be turned on while any Conditional Access policy exists, including disabled ones. Require MFA through Conditional Access instead.";
  return `Not compared: whether this is needed depends on ${names || "the Conditional Access policies"}, which could not be read completely. Refresh the policies before acting on this value.`;
}

// A capability with an alternative state is no ordinary gap: its different
// and missing comparisons keep their values but carry no result, so no tally,
// next action or fix pack treats it as missing (README "Alternative
// capabilities"). Alternatives are judged on the unchanged first pass.
function applyAlternatives(
  results: CapabilityResult[],
  conditionalAccess: "exists" | "none" | "unknown",
): CapabilityResult[] {
  const byId = new Map(results.map((result) => [result.capability.id, result]));
  return results.map((result) => {
    const alternative = alternativeOf(result, byId, conditionalAccess);
    if (!alternative) return result;
    const reason = alternativeReason(alternative, byId);
    return {
      ...result,
      alternative,
      checks: result.checks.map((check) =>
        check.result === "different" || check.result === "missing"
          ? {
              ...check,
              assessmentStatus:
                alternative.state === "unknown"
                  ? ("unableToCheck" as const)
                  : check.assessmentStatus,
              result: null,
              reason: check.reason ? `${reason} ${check.reason}` : reason,
            }
          : check,
      ),
      limitations: [...result.limitations, reason],
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
    // Reference-only requirements remain in the source, not in policy checks.
    .filter((control) =>
      (capabilitiesByControl.get(control.id) ?? []).some((id) =>
        capabilityResults.some(
          (result) =>
            result.capability.id === id && result.capability.signals.length > 0,
        ),
      ),
    )
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
      if (
        outsidePlatformScope ||
        outsideRiskScope ||
        (mappedIds.length > 0 &&
          excludedCapabilityIds.length === mappedIds.length)
      )
        status = "notApplicable";
      else if (!capabilityIds.length) {
        status = "notAssessed";
        if (!unassessedAspects.length)
          unassessedAspects.push(
            "This requirement needs evidence outside the collected settings or a supported platform in scope.",
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
        ...(!capabilityIds.length && status !== "notApplicable"
          ? {
              unavailableCheck: {
                assessmentStatus: "unableToCheck" as const,
                result: null,
                settingId: control.id,
                expectedValue: control.summary,
                actualValue: null,
                reason: unassessedAspects.join(" "),
              },
            }
          : {}),
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

// Every framework the engine assesses, in report order.
function assessedFrameworks(
  essentialEightMaturityLevel: AssessmentScope["essentialEightMaturityLevel"],
): FrameworkDefinition[] {
  return [
    NIST_800_53,
    NIST_CSF,
    ISO_27001,
    SOC_2,
    DEF_STAN_05_138,
    CYBER_ESSENTIALS,
    NIST_800_171,
    NIST_800_171_R3,
    essentialEightFramework(essentialEightMaturityLevel),
    NIS2,
    DORA,
    HIPAA_SECURITY_RULE,
  ];
}

let assessedIds: ReadonlySet<string> | undefined;

/**
 * Whether the engine still assesses this framework. Assessments stored by an
 * earlier version can name a framework that was removed since; readers drop
 * it so it is never shown or counted.
 */
export function isAssessedFramework(frameworkId: unknown): boolean {
  assessedIds ??= new Set(
    assessedFrameworks(undefined).map((framework) => framework.id),
  );
  return typeof frameworkId === "string" && assessedIds.has(frameworkId);
}

export function assessCompliance(
  data: ComplianceExportData,
  scope: AssessmentScope = data.assessmentScope ?? {},
): ComplianceAssessment {
  scope = {
    ...scope,
    essentialEightMaturityLevel: essentialEightLevel(
      scope.essentialEightMaturityLevel,
    ),
  };
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
      policyStatusSummary: Object.values(
        data.policyDeviceStatus?.sources ?? {},
      ).includes("collected")
        ? "collected"
        : "notCollected",
      effectiveAccess: "unverified",
    },
    frameworks: assessedFrameworks(scope.essentialEightMaturityLevel).map(
      (framework) => assessFramework(capabilities, framework, scope),
    ),
  };
}
