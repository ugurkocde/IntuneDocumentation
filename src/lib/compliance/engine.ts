import type { DetailedExportData } from "../configuration-analyzer";
import type { ConfigurationSettingInstance } from "../intune-detailed-client";
import { COMPLIANCE_CAPABILITIES } from "./capabilities";
import { BSI_IT_GRUNDSCHUTZ } from "./frameworks/bsi-it-grundschutz";
import { NIST_800_53 } from "./frameworks/nist-800-53";
import { NIST_CSF } from "./frameworks/nist-csf";
import type {
  AssignmentSummary,
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
} from "./types";

type ComplianceExportData = Omit<DetailedExportData, "groupNames"> & {
  groupNames?: Map<string, string> | Readonly<Record<string, string>>;
};

export const COMPLIANCE_DISCLAIMER =
  "This assessment reports technical evidence found in the Intune tenant configuration. It is not a compliance certification and does not replace an audit. Absence of evidence means no matching Intune policy was detected, not that a requirement is unmet through other means.";

export const COMPLIANCE_RULESET_VERSION = "2026.08";

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

function normalizeOdataType(value: unknown): string {
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
function collectCatalogValues(
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

function summarizeAssignments(
  assignments: unknown,
  groupNames: ReadonlyMap<string, string>,
): AssignmentSummary {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return { state: "notAssigned", targets: [] };
  }

  const targets: string[] = [];
  for (const assignment of assignments) {
    const target = (assignment as { target?: Record<string, unknown> })?.target;
    if (!target) continue;
    const type = normalizeOdataType(target["@odata.type"]);

    if (type.includes("exclusion")) continue;
    if (type.includes("alldevices")) {
      targets.push("All Devices");
    } else if (type.includes("alllicensedusers") || type.includes("allusers")) {
      targets.push("All Users");
    } else if (typeof target.groupId === "string" && target.groupId) {
      const groupName =
        groupNames.get(target.groupId) ||
        (typeof target.groupName === "string" && target.groupName) ||
        target.groupId;
      targets.push(`Group: ${groupName}`);
    } else {
      targets.push("Custom target");
    }
  }

  return targets.length > 0
    ? { state: "assigned", targets }
    : { state: "notAssigned", targets: [] };
}

function compliancePolicyNote(
  config: Record<string, unknown>,
): string | undefined {
  const odataType = normalizeOdataType(config["@odata.type"]);
  if (!odataType.endsWith("compliancepolicy")) return undefined;

  const scheduledActions = Array.isArray(config.scheduledActionsForRule)
    ? config.scheduledActionsForRule
    : [];
  const blocksAccess = scheduledActions.some((rule: any) =>
    (rule?.scheduledActionConfigurations ?? []).some(
      (action: any) => action?.actionType === "block",
    ),
  );

  return blocksAccess
    ? "Compliance policy with a block action for noncompliant devices."
    : "Compliance policy: marks devices noncompliant. Access enforcement depends on Conditional Access.";
}

function verdictFor(
  values: readonly unknown[],
  signal: DetectionSignal,
): { verdict: "enforced" | "disabled"; observed: unknown } | undefined {
  const enforced = values.find((value) =>
    satisfies(value, signal.enforcedWhen),
  );
  if (enforced !== undefined)
    return { verdict: "enforced", observed: enforced };
  if (signal.disabledWhen) {
    const disabled = values.find((value) =>
      satisfies(value, signal.disabledWhen!),
    );
    if (disabled !== undefined)
      return { verdict: "disabled", observed: disabled };
  }
  return undefined;
}

function evaluateConfiguration(
  config: Record<string, unknown>,
  capabilities: readonly ComplianceCapability[],
  groupNames: ReadonlyMap<string, string>,
): CapabilityEvidence[] {
  const evidence: CapabilityEvidence[] = [];
  const catalogValues = collectCatalogValues(config.settings);
  const odataType = normalizeOdataType(config["@odata.type"]);
  const assignment = summarizeAssignments(config.assignments, groupNames);
  const note = compliancePolicyNote(config);

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
      let match:
        | { verdict: "enforced" | "disabled"; observed: unknown }
        | undefined;
      let settingId: string;

      if (signal.source === "settingsCatalog") {
        settingId = signal.settingDefinitionId;
        const values = catalogValues.get(signal.settingDefinitionId);
        if (!values) continue;
        match = verdictFor(values, signal);
      } else {
        if (
          !signal.odataTypes.some((type) => type.toLowerCase() === odataType)
        ) {
          continue;
        }
        settingId = signal.propertyPath;
        const value = resolvePropertyPath(config, signal.propertyPath);
        if (value === undefined || value === null) continue;
        match = verdictFor([value], signal);
      }

      // A present value that matches neither expectation is indeterminate and
      // is deliberately not reported in either direction.
      if (!match) continue;

      evidence.push({
        capabilityId: capability.id,
        policyId,
        policyName,
        policyType,
        source: signal.source,
        settingId,
        observedValue: String(match.observed),
        verdict: match.verdict,
        assignment,
        note,
      });
    }
  }

  return evidence;
}

function collectConfigurations(
  data: ComplianceExportData,
): Array<Record<string, unknown>> {
  const configs = data.sections?.length
    ? data.sections.flatMap((section) => section.items)
    : [
        ...data.settingsCatalog,
        ...data.deviceConfigurations,
        ...data.administrativeTemplates,
        ...data.compliancePolicies,
        ...(data.appProtectionPolicies ?? []),
        ...data.securityBaselines,
        ...data.scripts.windows,
        ...data.scripts.macOS,
        ...(data.appConfigurations ?? []),
        ...(data.windowsUpdatePolicies ?? []),
        ...(data.enrollmentConfigurations ?? []),
        ...(data.conditionalAccessPolicies ?? []),
      ];

  return configs.filter(
    (config): config is Record<string, unknown> =>
      Boolean(config) && typeof config === "object",
  );
}

function capabilityStatus(
  evidence: readonly CapabilityEvidence[],
): CapabilityStatus {
  if (
    evidence.some(
      (item) =>
        item.verdict === "enforced" && item.assignment.state === "assigned",
    )
  ) {
    return "enforced";
  }
  if (evidence.some((item) => item.verdict === "enforced")) {
    return "configuredNotAssigned";
  }
  if (evidence.some((item) => item.verdict === "disabled")) {
    return "disabledByPolicy";
  }
  return "noEvidence";
}

export function assessCapabilities(
  data: ComplianceExportData,
  capabilities: readonly ComplianceCapability[] = COMPLIANCE_CAPABILITIES,
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
    return { capability, status: capabilityStatus(evidence), evidence };
  });
}

export function assessFramework(
  capabilityResults: readonly CapabilityResult[],
  framework: FrameworkDefinition,
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
      const capabilityIds = capabilitiesByControl.get(control.id) ?? [];
      const enforcedCapabilityIds = capabilityIds.filter(
        (id) => statusById.get(id) === "enforced",
      );

      let status: ControlStatus = "noEvidence";
      if (
        enforcedCapabilityIds.length === capabilityIds.length &&
        capabilityIds.length > 0
      ) {
        status = "evidenceFound";
      } else if (enforcedCapabilityIds.length > 0) {
        status = "partialEvidence";
      }

      return { control, capabilityIds, enforcedCapabilityIds, status };
    });

  return {
    framework: {
      id: framework.id,
      name: framework.name,
      version: framework.version,
      note: framework.note,
    },
    controls,
    summary: {
      totalControls: controls.length,
      withEvidence: controls.filter((c) => c.status === "evidenceFound").length,
      partial: controls.filter((c) => c.status === "partialEvidence").length,
      withoutEvidence: controls.filter((c) => c.status === "noEvidence").length,
    },
  };
}

export function assessCompliance(
  data: ComplianceExportData,
): ComplianceAssessment {
  const capabilities = assessCapabilities(data);
  return {
    generatedAt: new Date().toISOString(),
    disclaimer: COMPLIANCE_DISCLAIMER,
    capabilities,
    frameworks: [
      assessFramework(capabilities, NIST_800_53),
      assessFramework(capabilities, NIST_CSF),
      assessFramework(capabilities, BSI_IT_GRUNDSCHUTZ),
    ],
  };
}
